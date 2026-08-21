// Path A Local VM: get a Podman machine running on Windows without Docker.
//
// Chat must still work if any step here fails. Callers treat `skip` as
// "continue without a computer", not as a broken first run.
//
// Install is the official per-user MSI (checksum-pinned). WSL is a one-time
// UAC when missing. Guest RAM is raised above our 4 GB container cap — the
// MSI default is 2 GiB. Do not shell:true; msiexec and wsl travel as argv.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";

import { augmentedPath } from "./env-path.ts";

const execFileAsync = promisify(execFile);

/** Review this URL and SHA-256 together before bumping a Podman release. */
export const PODMAN_MSI_VERSION = "6.0.2";
export const PODMAN_MSI_URL =
  "https://github.com/podman-container-tools/podman/releases/download/v6.0.2/podman-installer-windows-amd64.msi";
export const PODMAN_MSI_SHA256 = "c094059880f033656092f5fb4306457e42aa068ee32137162299817c5f79396f";
const MSI_BYTES_MAX = 80 * 1024 * 1024;
/** Cua container is `--memory 4g`; the guest default is 2 GiB. */
export const PODMAN_MACHINE_MEMORY_MIB = 6144;
const MACHINE_NAME = "podman-machine-default";

export type PodmanSkipReason = "wsl-missing" | "not-windows" | "setup-failed";

export type PodmanSetupEvent = {
  status: string;
  done?: boolean;
  skip?: boolean;
  reason?: PodmanSkipReason;
};

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export type ArgvLaunch = {
  command: string;
  args: string[];
};

export type MachineSnapshot = {
  running: boolean;
  memoryMiB: number;
};

export type CommandRun = (command: string, args: string[], timeoutMs: number) => Promise<CommandResult>;

export interface PodmanSetupHooks {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  run?: CommandRun;
  exists?: (path: string) => boolean;
}

const inspectSchema = z.array(
  z.object({
    State: z.string().optional(),
    Resources: z.object({ Memory: z.number().optional() }).optional(),
  }),
);

const execFailureSchema = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  stdout: z.union([z.string(), z.instanceof(Buffer)]).optional(),
  stderr: z.union([z.string(), z.instanceof(Buffer)]).optional(),
});

function decodeCliBuffer(bytes: Buffer): string {
  if (bytes.includes(0)) return bytes.toString("utf16le").replace(/\0/g, "").trim();
  return bytes.toString("utf8");
}

function textOf(value: string | Buffer | undefined): string {
  if (value === undefined) return "";
  if (Buffer.isBuffer(value)) return decodeCliBuffer(value);
  return value;
}

function decodeExecFailure(cause: Error): CommandResult {
  const parsed = execFailureSchema.safeParse(cause);
  if (!parsed.success) return { code: 1, stdout: "", stderr: cause.message };
  const numeric = z.number().safeParse(parsed.data.code);
  return {
    code: numeric.success ? numeric.data : 1,
    stdout: textOf(parsed.data.stdout),
    stderr: textOf(parsed.data.stderr) || cause.message,
  };
}

async function defaultRun(command: string, args: string[], timeoutMs: number): Promise<CommandResult> {
  try {
    const result = await execFileAsync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
      env: { ...process.env, PATH: augmentedPath() },
    });
    return { code: 0, stdout: decodeCliBuffer(result.stdout), stderr: decodeCliBuffer(result.stderr) };
  } catch (cause) {
    if (cause instanceof Error) return decodeExecFailure(cause);
    return { code: 1, stdout: "", stderr: "command failed" };
  }
}

export function podmanBinDirs(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform !== "win32") return [];
  const local = env.LOCALAPPDATA || join(env.HOME || env.USERPROFILE || homedir(), "AppData", "Local");
  return [join(local, "Programs", "Podman")];
}

export function podmanExe(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform !== "win32") return "podman";
  return join(podmanBinDirs(env, platform)[0]!, "podman.exe");
}

export function podmanInstalled(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): boolean {
  if (platform !== "win32") return false;
  return exists(podmanExe(env, platform));
}

export function msiexecSpawn(
  msiPath: string,
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return {
    command: join(root, "System32", "msiexec.exe"),
    args: ["/i", msiPath, "/quiet", "/norestart", "MSIINSTALLPERUSER=1", "MACHINE_PROVIDER=wsl"],
  };
}

export function wslInstallSpawn(
  scriptPath: string,
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return {
    command: join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
  };
}

export const WSL_INSTALL_SCRIPT =
  "Start-Process -FilePath $env:SystemRoot\\System32\\wsl.exe -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait\n";

function wslExe(env: Record<string, string | undefined>): string {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return join(root, "System32", "wsl.exe");
}

export async function wslPresent(
  env: Record<string, string | undefined> = process.env,
  run: CommandRun = defaultRun,
): Promise<boolean> {
  const result = await run(wslExe(env), ["-l", "-v"], 8_000);
  if (result.code !== 0) return false;
  return result.stdout.length > 0 || result.stderr.length > 0;
}

function skip(status: string, reason: PodmanSkipReason): PodmanSetupEvent {
  return { status, skip: true, reason, done: true };
}

async function podman(
  hooks: PodmanSetupHooks,
  args: string[],
  timeoutMs: number,
): Promise<CommandResult> {
  const env = hooks.env ?? process.env;
  const platform = hooks.platform ?? process.platform;
  const run = hooks.run ?? defaultRun;
  return run(podmanExe(env, platform), args, timeoutMs);
}

async function downloadMsi(
  dest: string,
  fetchImpl: typeof fetch,
): Promise<void> {
  const response = await fetchImpl(PODMAN_MSI_URL);
  if (!response.ok) throw new Error(`Podman installer download failed (HTTP ${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error("Podman installer download was empty");
  if (buffer.byteLength > MSI_BYTES_MAX) throw new Error("Podman installer download was unexpectedly large");
  const digest = createHash("sha256").update(buffer).digest("hex");
  if (digest !== PODMAN_MSI_SHA256) {
    throw new Error("Podman installer checksum did not match the pinned release");
  }
  await writeFile(dest, buffer);
}

function machineState(stdout: string): MachineSnapshot {
  const parsed = inspectSchema.safeParse(JSON.parse(stdout || "[]"));
  if (!parsed.success || parsed.data.length === 0) return { running: false, memoryMiB: 0 };
  const row = parsed.data[0]!;
  return {
    running: (row.State ?? "").toLowerCase() === "running",
    memoryMiB: row.Resources?.Memory ?? 0,
  };
}

/** Install Podman per-user, init/start a WSL machine with enough RAM. */
export async function* runPodmanSetup(hooks: PodmanSetupHooks = {}): AsyncGenerator<PodmanSetupEvent> {
  const platform = hooks.platform ?? process.platform;
  const env = hooks.env ?? process.env;
  const run = hooks.run ?? defaultRun;
  const exists = hooks.exists ?? existsSync;

  if (platform !== "win32") {
    yield skip("On this OS, use Settings → Local VM if a container runtime is already installed.", "not-windows");
    return;
  }

  if (!(await wslPresent(env, run))) {
    yield skip("Windows needs WSL before a Local VM can start. That step asks for administrator once.", "wsl-missing");
    return;
  }

  if (!podmanInstalled(env, platform, exists)) {
    yield { status: "Downloading Podman…" };
    const dir = await mkdtemp(join(tmpdir(), "omb-podman-install-"));
    const msiPath = join(dir, `podman-${PODMAN_MSI_VERSION}.msi`);
    try {
      await downloadMsi(msiPath, hooks.fetchImpl ?? fetch);
      const launched = msiexecSpawn(msiPath, env);
      yield { status: "Installing Podman…" };
      const installed = await run(launched.command, launched.args, 5 * 60_000);
      if (installed.code !== 0) {
        yield skip(`Podman installer exited ${installed.code}. Chat still works without a computer.`, "setup-failed");
        return;
      }
      if (!podmanInstalled(env, platform, exists)) {
        yield skip("Podman installer finished but podman.exe is still missing. Chat still works without a computer.", "setup-failed");
        return;
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Podman could not be installed";
      yield skip(`${message}. Chat still works without a computer.`, "setup-failed");
      return;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  yield { status: "Checking the Podman machine…" };
  const listed = await podman(hooks, ["machine", "inspect", MACHINE_NAME], 15_000);
  const haveMachine = listed.code === 0 && listed.stdout.trim().startsWith("[");
  if (!haveMachine) {
    yield { status: "Creating the Podman machine (first time, a few minutes)…" };
    const inited = await podman(hooks, ["machine", "init", "--provider", "wsl"], 15 * 60_000);
    if (inited.code !== 0) {
      yield skip(
        `Podman machine init failed: ${(inited.stderr || inited.stdout).trim().slice(0, 240) || inited.code}. Chat still works without a computer.`,
        "setup-failed",
      );
      return;
    }
  }

  const inspected = await podman(hooks, ["machine", "inspect", MACHINE_NAME], 15_000);
  let state = { running: false, memoryMiB: 0 };
  if (inspected.code === 0) {
    try {
      state = machineState(inspected.stdout);
    } catch {
      state = { running: false, memoryMiB: 0 };
    }
  }

  if (state.memoryMiB > 0 && state.memoryMiB < PODMAN_MACHINE_MEMORY_MIB) {
    if (state.running) {
      yield { status: "Stopping the Podman machine to give it enough memory…" };
      await podman(hooks, ["machine", "stop"], 60_000);
      state = { ...state, running: false };
    }
    yield { status: `Setting Podman machine memory to ${PODMAN_MACHINE_MEMORY_MIB} MiB…` };
    const sized = await podman(hooks, ["machine", "set", "--memory", String(PODMAN_MACHINE_MEMORY_MIB)], 30_000);
    if (sized.code !== 0) {
      yield skip("Could not raise Podman machine memory. Chat still works without a computer.", "setup-failed");
      return;
    }
  }

  if (!state.running) {
    yield { status: "Starting the Podman machine…" };
    const started = await podman(hooks, ["machine", "start"], 2 * 60_000);
    if (started.code !== 0) {
      yield skip(
        `Podman machine would not start. Chat still works without a computer.`,
        "setup-failed",
      );
      return;
    }
  }

  const info = await podman(hooks, ["info", "--format", "json"], 20_000);
  if (info.code !== 0) {
    yield skip("Podman is installed but not answering yet. Chat still works without a computer.", "setup-failed");
    return;
  }

  yield { status: "Podman is ready", done: true };
}

export async function* runWslInstall(hooks: PodmanSetupHooks = {}): AsyncGenerator<PodmanSetupEvent> {
  const platform = hooks.platform ?? process.platform;
  const env = hooks.env ?? process.env;
  if (platform !== "win32") {
    yield skip("WSL is a Windows step.", "not-windows");
    return;
  }
  yield { status: "Asking Windows to install WSL (administrator once)…" };
  const dir = await mkdtemp(join(tmpdir(), "omb-wsl-install-"));
  const scriptPath = join(dir, "install-wsl.ps1");
  try {
    await writeFile(scriptPath, WSL_INSTALL_SCRIPT);
    const launched = wslInstallSpawn(scriptPath, env);
    const run = hooks.run ?? defaultRun;
    const result = await run(launched.command, launched.args, 10 * 60_000);
    if (result.code !== 0) {
      yield skip("WSL install did not finish. Chat still works without a computer.", "setup-failed");
      return;
    }
    yield { status: "WSL install finished — a reboot may be required", done: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
