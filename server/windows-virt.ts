// Path A Windows virtualization: three different stops, not one "virt off".
//
// 1. Windows features (Virtual Machine Platform + WSL) — we can read these
//    without admin and turn them on with one UAC, then a restart.
// 2. A restart Windows owes us *after both features are Enabled* — ask to
//    reboot. A leftover CBS RebootPending key is not this stop.
// 3. Firmware virtualization — detect only. The app cannot flip BIOS.
//
// Do not treat `wsl --status` "virtualization is not enabled" as firmware-off.
// Measured 2026-08-22: that string fired while VMP was already on and a reboot
// was pending. See docs/plans/2026-08-22-001-path-a-nsis-first-run.md.
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);

/** Win32_OptionalFeature.InstallState Enabled. */
export const WINDOWS_FEATURE_ENABLED = 1;

export type WindowsVirtKind = "ready" | "enable-features" | "reboot-pending" | "firmware-off";

export type WindowsVirtProbe = {
  vmp: number | null;
  wslFeature: number | null;
  hypervisorPresent: boolean;
  rebootPending: boolean;
};

export type CommandRun = (
  command: string,
  args: string[],
  timeoutMs: number,
) => Promise<{ code: number; stdout: string; stderr: string }>;

export type ArgvLaunch = {
  command: string;
  args: string[];
};

const probeSchema = z.object({
  vmp: z.number().nullable(),
  wslFeature: z.number().nullable(),
  hypervisorPresent: z.boolean(),
  rebootPending: z.boolean(),
});

export const WINDOWS_VIRT_PROBE_SCRIPT = [
  "$ErrorActionPreference = 'SilentlyContinue'",
  "function FeatureState($name) {",
  "  $row = Get-CimInstance Win32_OptionalFeature | Where-Object { $_.Name -eq $name }",
  "  if ($null -eq $row) { return $null }",
  "  return [int]$row.InstallState",
  "}",
  "$hv = Get-CimInstance Win32_ComputerSystem",
  "$reboot = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Component Based Servicing\\RebootPending'",
  "if (-not $reboot) { $reboot = Test-Path 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\WindowsUpdate\\Auto Update\\RebootRequired' }",
  "@{",
  "  vmp = (FeatureState 'VirtualMachinePlatform')",
  "  wslFeature = (FeatureState 'Microsoft-Windows-Subsystem-Linux')",
  "  hypervisorPresent = [bool]$hv.HypervisorPresent",
  "  rebootPending = [bool]$reboot",
  "} | ConvertTo-Json -Compress",
  "",
].join("\n");

export const WINDOWS_VIRT_ENABLE_INNER_SCRIPT = [
  "& \"$env:SystemRoot\\System32\\dism.exe\" /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart",
  "if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { exit $LASTEXITCODE }",
  "& \"$env:SystemRoot\\System32\\dism.exe\" /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart",
  "if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne 3010) { exit $LASTEXITCODE }",
  "exit 0",
  "",
].join("\n");

export function classifyWindowsVirt(probe: WindowsVirtProbe): WindowsVirtKind {
  // Features first. `CBS\RebootPending` is a key that can linger after a real
  // reboot (measured 2026-08-22). Treating it as the top stop loops Restart
  // while WSL is still Disabled. Restart is only honest once both features
  // are Enabled and Windows still owes a reboot.
  if (probe.vmp !== WINDOWS_FEATURE_ENABLED || probe.wslFeature !== WINDOWS_FEATURE_ENABLED) {
    return "enable-features";
  }
  if (probe.rebootPending) return "reboot-pending";
  if (!probe.hypervisorPresent) return "firmware-off";
  return "ready";
}

export function parseVirtProbeJson(text: string): WindowsVirtProbe | null {
  try {
    const parsed = probeSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function powershellExe(env: Record<string, string | undefined>): string {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return join(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

function shutdownExe(env: Record<string, string | undefined>): string {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return join(root, "System32", "shutdown.exe");
}

export function virtProbeSpawn(
  scriptPath: string,
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  return {
    command: powershellExe(env),
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
  };
}

export function virtEnableOuterScript(innerPath: string): string {
  const quoted = innerPath.replaceAll("'", "''");
  return (
    "Start-Process -FilePath $env:SystemRoot\\System32\\WindowsPowerShell\\v1.0\\powershell.exe " +
    `-ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','${quoted}' -Verb RunAs -Wait\n`
  );
}

export function virtEnableSpawn(
  scriptPath: string,
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  return {
    command: powershellExe(env),
    args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", scriptPath],
  };
}

export function windowsRebootSpawn(
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  return {
    command: shutdownExe(env),
    args: ["/r", "/t", "0"],
  };
}

function decodeCliBuffer(bytes: Buffer): string {
  if (bytes.includes(0)) return bytes.toString("utf16le").replace(/\0/g, "").trim();
  return bytes.toString("utf8");
}

const execFailureSchema = z.object({
  code: z.union([z.number(), z.string()]).optional(),
  stdout: z.union([z.string(), z.instanceof(Buffer)]).optional(),
  stderr: z.union([z.string(), z.instanceof(Buffer)]).optional(),
});

function textOf(value: string | Buffer | undefined): string {
  if (value === undefined) return "";
  if (Buffer.isBuffer(value)) return decodeCliBuffer(value);
  return value;
}

function decodeExecFailure(cause: Error): { code: number; stdout: string; stderr: string } {
  const parsed = execFailureSchema.safeParse(cause);
  if (!parsed.success) return { code: 1, stdout: "", stderr: cause.message };
  const numeric = z.number().safeParse(parsed.data.code);
  return {
    code: numeric.success ? numeric.data : 1,
    stdout: textOf(parsed.data.stdout),
    stderr: textOf(parsed.data.stderr) || cause.message,
  };
}

async function defaultRun(command: string, args: string[], timeoutMs: number) {
  try {
    const result = await execFileAsync(command, args, {
      timeout: timeoutMs,
      windowsHide: true,
      encoding: "buffer",
      maxBuffer: 16 * 1024 * 1024,
    });
    return { code: 0, stdout: decodeCliBuffer(result.stdout), stderr: decodeCliBuffer(result.stderr) };
  } catch (cause) {
    if (cause instanceof Error) return decodeExecFailure(cause);
    return { code: 1, stdout: "", stderr: "command failed" };
  }
}

export async function probeWindowsVirt(hooks: {
  env?: Record<string, string | undefined>;
  run?: CommandRun;
  platform?: NodeJS.Platform;
}): Promise<WindowsVirtKind> {
  if ((hooks.platform ?? process.platform) !== "win32") return "ready";
  const env = hooks.env ?? process.env;
  const run = hooks.run ?? defaultRun;
  const dir = await mkdtemp(join(tmpdir(), "omb-virt-probe-"));
  const scriptPath = join(dir, "probe.ps1");
  try {
    await writeFile(scriptPath, WINDOWS_VIRT_PROBE_SCRIPT);
    const launched = virtProbeSpawn(scriptPath, env);
    const result = await run(launched.command, launched.args, 15_000);
    const parsed = parseVirtProbeJson(result.stdout.trim() || result.stderr.trim());
    if (!parsed) return "enable-features";
    return classifyWindowsVirt(parsed);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function* runWindowsVirtEnable(hooks: {
  env?: Record<string, string | undefined>;
  run?: CommandRun;
  platform?: NodeJS.Platform;
} = {}): AsyncGenerator<{ status: string; done?: boolean; skip?: boolean; reason?: string }> {
  if ((hooks.platform ?? process.platform) !== "win32") {
    yield { status: "Windows virtualization settings are a Windows step.", skip: true, reason: "not-windows", done: true };
    return;
  }
  yield { status: "Turning on Windows virtualization (administrator once)…" };
  const env = hooks.env ?? process.env;
  const run = hooks.run ?? defaultRun;
  const dir = await mkdtemp(join(tmpdir(), "omb-virt-enable-"));
  const innerPath = join(dir, "enable-inner.ps1");
  const outerPath = join(dir, "enable-outer.ps1");
  try {
    await writeFile(innerPath, WINDOWS_VIRT_ENABLE_INNER_SCRIPT);
    await writeFile(outerPath, virtEnableOuterScript(innerPath));
    const launched = virtEnableSpawn(outerPath, env);
    const result = await run(launched.command, launched.args, 10 * 60_000);
    if (result.code !== 0) {
      yield {
        status: "Windows could not turn on virtualization. Chat still works without a Local computer.",
        skip: true,
        reason: "setup-failed",
        done: true,
      };
      return;
    }
    yield { status: "Windows virtualization is on — a restart is next", done: true };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function requestWindowsReboot(hooks: {
  env?: Record<string, string | undefined>;
  run?: CommandRun;
  platform?: NodeJS.Platform;
} = {}): Promise<{ restarting: boolean; error?: string }> {
  if ((hooks.platform ?? process.platform) !== "win32") {
    return { restarting: false, error: "Restart is a Windows step." };
  }
  const env = hooks.env ?? process.env;
  const run = hooks.run ?? defaultRun;
  const launched = windowsRebootSpawn(env);
  const result = await run(launched.command, launched.args, 15_000);
  if (result.code !== 0) {
    return { restarting: false, error: "Windows would not start a restart." };
  }
  return { restarting: true };
}
