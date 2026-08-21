import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it } from "vitest";

import {
  hermesBinDirs,
  hermesInstallSpawn,
  hermesInstallUrl,
  hermesInstalled,
  HERMES_INSTALL_PS1,
  HERMES_INSTALL_SH,
  runHermesInstall,
  type HermesInstallChild,
} from "./hermes-install.ts";

function fakeFetch(respond: () => Promise<Response>): typeof fetch {
  // SAFETY: runHermesInstall calls fetch one way only — with a URL, for a
  // Response — so a responder satisfies every use it makes of it.
  return respond as typeof fetch;
}

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omb-hermes-cli-"));
  scratch.push(dir);
  return dir;
}

describe("hermesInstallSpawn", () => {
  it("runs the Windows script through powershell.exe -File, never iex", () => {
    const launched = hermesInstallSpawn("D:\\tmp\\install.ps1", "win32", { SystemRoot: "C:\\Windows" });
    expect(launched.command.replaceAll("/", "\\")).toBe("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
    expect(launched.args).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "D:\\tmp\\install.ps1",
      "-SkipSetup",
      "-SkipComputerUse",
      "-NonInteractive",
    ]);
  });

  it("runs the POSIX script with bash and skips setup plus computer-use", () => {
    expect(hermesInstallSpawn("/tmp/install.sh", "linux")).toEqual({
      command: "/bin/bash",
      args: ["/tmp/install.sh", "--skip-setup", "--skip-computer-use"],
    });
  });
});

describe("hermesInstallUrl", () => {
  it("uses Nous' installer, not a shell one-liner", () => {
    expect(hermesInstallUrl("win32")).toBe(HERMES_INSTALL_PS1);
    expect(hermesInstallUrl("darwin")).toBe(HERMES_INSTALL_SH);
    expect(HERMES_INSTALL_PS1).toContain("hermes-agent.nousresearch.com");
  });
});

describe("hermesInstalled", () => {
  it("is false when the bin directories are empty", () => {
    const local = scratchDir();
    expect(hermesInstalled({ LOCALAPPDATA: local, HOME: local }, "win32")).toBe(false);
  });

  it("finds hermes.exe under %LOCALAPPDATA%\\hermes\\hermes-agent\\bin", () => {
    const local = scratchDir();
    const bin = join(local, "hermes", "hermes-agent", "bin");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "hermes.exe"), "");
    expect(hermesBinDirs({ LOCALAPPDATA: local }, "win32")[0]).toBe(bin);
    expect(hermesInstalled({ LOCALAPPDATA: local }, "win32")).toBe(true);
  });
});

describe("runHermesInstall", () => {
  it("does not download when Hermes is already present", async () => {
    const local = scratchDir();
    mkdirSync(join(local, "hermes", "hermes-agent", "bin"), { recursive: true });
    writeFileSync(join(local, "hermes", "hermes-agent", "bin", "hermes.exe"), "");
    let fetched = 0;
    const events = [];
    for await (const event of runHermesInstall({
      platform: "win32",
      env: { LOCALAPPDATA: local, SystemRoot: "C:\\Windows" },
      fetchImpl: fakeFetch(async () => {
        fetched += 1;
        return new Response("should not run");
      }),
    })) {
      events.push(event);
    }
    expect(fetched).toBe(0);
    expect(events).toEqual([{ status: "Hermes is already installed", done: true }]);
  });

  it("downloads the script, spawns powershell -File, and streams installer output", async () => {
    const local = scratchDir();
    const seen: { command: string; args: string[] }[] = [];
    const fetchImpl = fakeFetch(async () => new Response("# install.ps1\n", { status: 200 }));
    const spawnImpl = (command: string, args: string[]) => {
      seen.push({ command, args });
      const stdout = new PassThrough();
      const stderr = new PassThrough();
      const child: HermesInstallChild = {
        stdout,
        stderr,
        onError() {},
        onClose(listener) {
          queueMicrotask(() => {
            mkdirSync(join(local, "hermes", "hermes-agent", "bin"), { recursive: true });
            writeFileSync(join(local, "hermes", "hermes-agent", "bin", "hermes.exe"), "");
            stdout.end("Installing uv\n");
            stderr.end();
            listener(0);
          });
        },
      };
      return child;
    };

    const events = [];
    for await (const event of runHermesInstall({
      platform: "win32",
      env: { LOCALAPPDATA: local, SystemRoot: "C:\\Windows" },
      fetchImpl,
      spawnImpl,
    })) {
      events.push(event);
    }
    expect(seen).toHaveLength(1);
    expect(seen[0]!.args).toContain("-File");
    expect(seen[0]!.args).toContain("-SkipSetup");
    expect(seen[0]!.args).toContain("-SkipComputerUse");
    expect(events.map((event) => event.status)).toContain("Installing uv");
    expect(events.at(-1)).toEqual({ status: "Hermes is installed", done: true });
  });
});
