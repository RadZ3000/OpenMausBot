// Path A Local VM: get a Podman machine running on Windows without Docker.
//
// Chat must still work if any step here fails. Callers treat `skip` as
// "continue without a computer", not as a broken first run.
//
// Install is the official per-user MSI (checksum-pinned). WSL is a one-time
// UAC when missing. Guest RAM is set at `machine init` — WSL cannot
// `machine set --memory` after create, and the MSI default is 2 GiB. Do not
// shell:true; msiexec and wsl travel as argv.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { promisify } from "node:util";
import { z } from "zod";

import { augmentedPath } from "./env-path.ts";
import { probeWindowsVirt, type WindowsVirtKind } from "./windows-virt.ts";

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

/** WSL guests cannot `machine set --memory` after create (Podman 6: "changing
 * memory not supported for WSL machines"). Size the VM at init. */
export function podmanMachineInitArgs(): string[] {
  return ["machine", "init", "--provider", "wsl", "--memory", String(PODMAN_MACHINE_MEMORY_MIB)];
}

/** The line that actually failed, not WSL's pipe-TTY warning and not the
 * rootless advertisement. `Error:` is Podman's own summary. */
export function podmanCliDetail(stderr: string, stdout = ""): string {
  const lines = `${stderr}\n${stdout}`
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !/screen size is bogus/i.test(line));
  const errorLine = lines.find((line) => /^error:/i.test(line));
  if (errorLine) return errorLine.replace(/^error:\s*/i, "");
  const pipeLine = lines.find((line) => /pipe instances are busy/i.test(line));
  if (pipeLine) return pipeLine;
  return lines[0] ?? "";
}

export type PodmanSkipReason = "wsl-missing" | "virt-features" | "virt-reboot" | "virt-firmware" | "not-windows" | "setup-failed";

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
  /** Tests pin this so they do not spawn the CIM probe. */
  virtKind?: WindowsVirtKind;
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
      env: { ...process.env, PATH: augmentedPath(), COLUMNS: "80", LINES: "24" },
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

function system32Exe(name: string, env: Record<string, string | undefined>): string {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return join(root, "System32", name);
}

/** HKCU. Microsoft's WSL team: this stops the welcome GUI on first distro
 * (github.com/microsoft/WSL/issues/13223). No admin. */
export function wslOobeCompleteSpawn(
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  return {
    command: system32Exe("reg.exe", env),
    args: [
      "add",
      "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Lxss",
      "/v",
      "OOBEComplete",
      "/t",
      "REG_DWORD",
      "/d",
      "1",
      "/f",
    ],
  };
}

/** Best-effort: the settings app if it still stole focus. */
export function dismissWslSettingsSpawn(
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  return {
    command: system32Exe("taskkill.exe", env),
    args: ["/IM", "wslsettings.exe"],
  };
}

async function silenceWslWelcome(env: Record<string, string | undefined>, run: CommandRun): Promise<void> {
  const oobe = wslOobeCompleteSpawn(env);
  await run(oobe.command, oobe.args, 8_000);
}

async function dismissWslSettingsUi(env: Record<string, string | undefined>, run: CommandRun): Promise<void> {
  const launched = dismissWslSettingsSpawn(env);
  await run(launched.command, launched.args, 8_000);
}

export const WSL_INSTALL_SCRIPT =
  "Start-Process -FilePath $env:SystemRoot\\System32\\wsl.exe -ArgumentList '--install','--no-distribution' -Verb RunAs -Wait\n";

function wslExe(env: Record<string, string | undefined>): string {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return join(root, "System32", "wsl.exe");
}

function wslText(result: CommandResult): string {
  return `${result.stdout}\n${result.stderr}`.replace(/\0/g, "");
}

/** `--no-distribution` leaves WSL with zero distros; `wsl -l -v` then exits
 * non-zero. That is still "WSL is on this machine". */
export function wslOutputLooksPresent(result: CommandResult): boolean {
  const text = wslText(result);
  if (/no installed distributions/i.test(text)) return true;
  if (/subsystem for linux is not installed|wsl(?:\.exe)? is not (?:recognized|installed)/i.test(text)) {
    return false;
  }
  if (result.code === 0 && text.trim().length > 0) return true;
  return false;
}

export async function wslReadiness(
  env: Record<string, string | undefined> = process.env,
  run: CommandRun = defaultRun,
  platform: NodeJS.Platform = process.platform,
): Promise<{ present: boolean; virtKind: WindowsVirtKind }> {
  const listed = await run(wslExe(env), ["-l", "-v"], 8_000);
  const present = wslOutputLooksPresent(listed);
  if (!present) return { present: false, virtKind: "enable-features" };
  const virtKind = await probeWindowsVirt({ env, run, platform });
  return { present: true, virtKind };
}

export async function wslPresent(
  env: Record<string, string | undefined> = process.env,
  run: CommandRun = defaultRun,
): Promise<boolean> {
  const listed = await run(wslExe(env), ["-l", "-v"], 8_000);
  return wslOutputLooksPresent(listed);
}

function skip(status: string, reason: PodmanSkipReason): PodmanSetupEvent {
  return { status, skip: true, reason, done: true };
}

function skipFromCli(prefix: string, result: CommandResult): PodmanSetupEvent {
  const detail = podmanCliDetail(result.stderr, result.stdout).slice(0, 200);
  const status = detail
    ? `${prefix}: ${detail}. Chat still works without a computer.`
    : `${prefix}. Chat still works without a computer.`;
  return skip(status, "setup-failed");
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
  const virtKind = hooks.virtKind ?? (await probeWindowsVirt({ env, run, platform }));
  if (virtKind === "reboot-pending") {
    yield skip("Windows needs a restart before a Local computer can start. Chat still works.", "virt-reboot");
    return;
  }
  if (virtKind === "enable-features") {
    yield skip("Windows still needs a virtualization setting turned on. Chat still works.", "virt-features");
    return;
  }
  if (virtKind === "firmware-off") {
    yield skip(
      "This PC's firmware has virtualization off. Turn it on in BIOS, then come back. Chat still works.",
      "virt-firmware",
    );
    return;
  }

  await silenceWslWelcome(env, run);

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
    const inited = await podman(hooks, podmanMachineInitArgs(), 15 * 60_000);
    if (inited.code !== 0) {
      yield skipFromCli("Podman machine init failed", inited);
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
    // `machine set --memory` is a no-op on WSL. Recreate with --memory on init.
    yield { status: `Recreating the Podman machine with ${PODMAN_MACHINE_MEMORY_MIB} MiB…` };
    const removed = await podman(hooks, ["machine", "rm", "--force", MACHINE_NAME], 60_000);
    if (removed.code !== 0) {
      yield skipFromCli("Could not replace the undersized Podman machine", removed);
      return;
    }
    const resized = await podman(hooks, podmanMachineInitArgs(), 15 * 60_000);
    if (resized.code !== 0) {
      yield skipFromCli("Podman machine init failed", resized);
      return;
    }
    state = { running: false, memoryMiB: PODMAN_MACHINE_MEMORY_MIB };
  }

  if (!state.running) {
    yield { status: "Starting the Podman machine…" };
    const started = await podman(hooks, ["machine", "start"], 2 * 60_000);
    if (started.code !== 0) {
      await dismissWslSettingsUi(env, run);
      yield skipFromCli("Podman machine would not start", started);
      return;
    }
  }

  const info = await podman(hooks, ["info", "--format", "json"], 20_000);
  if (info.code !== 0) {
    yield skip("Podman is installed but not answering yet. Chat still works without a computer.", "setup-failed");
    return;
  }

  await dismissWslSettingsUi(env, run);
  yield { status: "Podman is ready", done: true };
}

export async function* runWslInstall(hooks: PodmanSetupHooks = {}): AsyncGenerator<PodmanSetupEvent> {
  const platform = hooks.platform ?? process.platform;
  const env = hooks.env ?? process.env;
  const run = hooks.run ?? defaultRun;
  if (platform !== "win32") {
    yield skip("WSL is a Windows step.", "not-windows");
    return;
  }
  if (await wslPresent(env, run)) {
    yield { status: "WSL is already on this machine", done: true };
    return;
  }
  yield { status: "Asking Windows to install WSL (administrator once)…" };
  const dir = await mkdtemp(join(tmpdir(), "omb-wsl-install-"));
  const scriptPath = join(dir, "install-wsl.ps1");
  try {
    await writeFile(scriptPath, WSL_INSTALL_SCRIPT);
    const launched = wslInstallSpawn(scriptPath, env);
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
