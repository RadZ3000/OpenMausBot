// Install Hermes Agent as the local-path CLI — download their official
// script and run it with argv, never through a shell.
//
// The first-run arm used to stop at "the model is on disk" and hand the user
// to EngineSetup, where Qwen Code was the lightest click. Qwen still cannot
// complete a local turn; Hermes can, once model.provider is selected. So this
// arm now installs Hermes itself: -SkipSetup (we inject the local host),
// -SkipComputerUse (their CUA scheduled task is not our product), and
// -NonInteractive.
//
// Windows: powershell.exe -File <script>. POSIX: /bin/bash <script>. The
// one-liners on Hermes' site (`iex (irm …)`, `curl | bash`) are exactly the
// command strings this repo forbids.
import { spawn, type SpawnOptions } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtemp, writeFile, rm } from "node:fs/promises";

export const HERMES_INSTALL_PS1 = "https://hermes-agent.nousresearch.com/install.ps1";
export const HERMES_INSTALL_SH = "https://hermes-agent.nousresearch.com/install.sh";

const SCRIPT_BYTES_MAX = 2 * 1024 * 1024;

export function hermesBinDirs(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string[] {
  if (platform === "win32") {
    const local = env.LOCALAPPDATA || join(env.HOME || env.USERPROFILE || homedir(), "AppData", "Local");
    return [join(local, "hermes", "hermes-agent", "bin"), join(local, "hermes", "bin")];
  }
  const home = env.HOME || homedir();
  return [join(home, ".local", "bin"), join(home, ".hermes", "bin")];
}

export function hermesInstalled(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const names = platform === "win32" ? ["hermes.exe", "hermes.cmd", "hermes"] : ["hermes"];
  for (const dir of hermesBinDirs(env, platform)) {
    for (const name of names) {
      if (existsSync(join(dir, name))) return true;
    }
  }
  return false;
}

export interface HermesCliSpawn {
  command: string;
  args: string[];
}

export function hermesInstallSpawn(
  scriptPath: string,
  platform: NodeJS.Platform = process.platform,
  env: Record<string, string | undefined> = process.env,
): HermesCliSpawn {
  if (platform === "win32") {
    const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
    const launched: HermesCliSpawn = {
      command: join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"),
      args: [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-SkipSetup",
        "-SkipComputerUse",
        "-NonInteractive",
      ],
    };
    return launched;
  }
  const launched: HermesCliSpawn = {
    command: "/bin/bash",
    args: [scriptPath, "--skip-setup", "--skip-computer-use"],
  };
  return launched;
}

export function hermesInstallUrl(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? HERMES_INSTALL_PS1 : HERMES_INSTALL_SH;
}

export async function downloadHermesInstallScript(
  dest: string,
  fetchImpl: typeof fetch = fetch,
  platform: NodeJS.Platform = process.platform,
): Promise<void> {
  const response = await fetchImpl(hermesInstallUrl(platform));
  if (!response.ok) throw new Error(`Hermes installer download failed (HTTP ${response.status})`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength === 0) throw new Error("Hermes installer download was empty");
  if (buffer.byteLength > SCRIPT_BYTES_MAX) throw new Error("Hermes installer download was unexpectedly large");
  await writeFile(dest, buffer);
}

export type HermesInstallEvent = { status: string; done?: boolean };

export interface HermesInstallChild {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  onError(listener: (error: Error) => void): void;
  onClose(listener: (code: number | null) => void): void;
}

export interface HermesInstallHooks {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  spawnImpl?: (command: string, args: string[], opts: SpawnOptions) => HermesInstallChild;
}

function spawnEnvFrom(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  return out;
}

function childFromSpawn(proc: ReturnType<typeof spawn>): HermesInstallChild {
  return {
    stdout: proc.stdout,
    stderr: proc.stderr,
    onError(listener) {
      proc.once("error", listener);
    },
    onClose(listener) {
      proc.once("close", listener);
    },
  };
}

function readLines(child: HermesInstallChild, onLine: (line: string) => void): void {
  for (const stream of [child.stdout, child.stderr]) {
    if (!stream) continue;
    let rest = "";
    stream.setEncoding("utf8");
    stream.on("data", (chunk: string) => {
      rest += chunk;
      const parts = rest.split(/\r?\n/);
      rest = parts.pop() ?? "";
      for (const part of parts) {
        const line = part.trim();
        if (line) onLine(line);
      }
    });
    stream.on("end", () => {
      const line = rest.trim();
      if (line) onLine(line);
    });
  }
}

/** Run the official installer, or no-op when Hermes is already on this machine. */
export async function* runHermesInstall(hooks: HermesInstallHooks = {}): AsyncGenerator<HermesInstallEvent> {
  const platform = hooks.platform ?? process.platform;
  const env = hooks.env ?? process.env;
  if (hermesInstalled(env, platform)) {
    yield { status: "Hermes is already installed", done: true };
    return;
  }

  yield { status: "Downloading the Hermes installer…" };
  const dir = await mkdtemp(join(tmpdir(), "omb-hermes-install-"));
  const scriptPath = join(dir, platform === "win32" ? "install.ps1" : "install.sh");
  try {
    await downloadHermesInstallScript(scriptPath, hooks.fetchImpl ?? fetch, platform);
    const launched = hermesInstallSpawn(scriptPath, platform, env);
    yield { status: "Installing Hermes…" };
    const spawnOpts: SpawnOptions = {
      env: spawnEnvFrom(env),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    };
    const child = hooks.spawnImpl
      ? hooks.spawnImpl(launched.command, launched.args, spawnOpts)
      : childFromSpawn(spawn(launched.command, launched.args, spawnOpts));
    const incoming: Array<{ type: "line"; line: string } | { type: "close"; code: number | null } | { type: "error"; error: Error }> =
      [];
    let wake: (() => void) | undefined;
    const push = (item: (typeof incoming)[number]) => {
      incoming.push(item);
      wake?.();
    };
    readLines(child, (line) => push({ type: "line", line }));
    child.onError((error) => push({ type: "error", error }));
    child.onClose((code) => push({ type: "close", code }));
    let code: number | null = 0;
    for (;;) {
      if (incoming.length === 0) await new Promise<void>((resolve) => { wake = resolve; });
      const item = incoming.shift()!;
      if (item.type === "error") throw item.error;
      if (item.type === "close") {
        code = item.code;
        break;
      }
      yield { status: item.line };
    }
    if (code !== 0) throw new Error(`Hermes installer exited ${code ?? "without a code"}`);
    if (!hermesInstalled(env, platform)) {
      throw new Error("Hermes installer finished but the hermes command is still missing");
    }
    yield { status: "Hermes is installed", done: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
