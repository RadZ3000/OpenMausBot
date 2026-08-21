import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  msiexecSpawn,
  podmanBinDirs,
  podmanExe,
  podmanInstalled,
  PODMAN_MACHINE_MEMORY_MIB,
  podmanCliDetail,
  podmanMachineInitArgs,
  PODMAN_MSI_SHA256,
  PODMAN_MSI_URL,
  runPodmanSetup,
  wslInstallSpawn,
  wslPresent,
  type CommandResult,
} from "./podman-setup.ts";

function fakeFetch(respond: () => Promise<Response>): typeof fetch {
  // SAFETY: downloadMsi calls fetch one way only — with a URL, for a Response.
  return respond as typeof fetch;
}

const scratch: string[] = [];
afterEach(() => {
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omb-podman-"));
  scratch.push(dir);
  return dir;
}

function ok(stdout = "", stderr = ""): CommandResult {
  return { code: 0, stdout, stderr };
}

describe("podmanCliDetail", () => {
  it("prefers Podman's Error line over the WSL TTY warning", () => {
    const stderr = [
      "your 131072x1 screen size is bogus. expect trouble",
      "API forwarding for Docker API clients is not available due to the following startup failures.",
      "CreateFile \\\\.\\pipe\\podman-machine-default: All pipe instances are busy.",
      "Podman clients are still able to connect.",
      "Error: machine did not transition into running state: ssh error: machine not in running state",
    ].join("\n");
    expect(podmanCliDetail(stderr)).toBe(
      "machine did not transition into running state: ssh error: machine not in running state",
    );
  });
});

describe("msiexecSpawn", () => {
  it("installs per-user with WSL as the machine provider, never a shell one-liner", () => {
    const launched = msiexecSpawn("D:\\tmp\\podman.msi", { SystemRoot: "C:\\Windows" });
    expect(launched.command.replaceAll("/", "\\")).toBe("C:\\Windows\\System32\\msiexec.exe");
    expect(launched.args).toEqual([
      "/i",
      "D:\\tmp\\podman.msi",
      "/quiet",
      "/norestart",
      "MSIINSTALLPERUSER=1",
      "MACHINE_PROVIDER=wsl",
    ]);
  });
});

describe("wslInstallSpawn", () => {
  it("runs a written PowerShell file, not iex", () => {
    const launched = wslInstallSpawn("D:\\tmp\\install-wsl.ps1", { SystemRoot: "C:\\Windows" });
    expect(launched.command.replaceAll("/", "\\")).toBe(
      "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
    );
    expect(launched.args).toEqual([
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      "D:\\tmp\\install-wsl.ps1",
    ]);
  });
});

describe("podmanInstalled", () => {
  it("finds the per-user MSI location", () => {
    const local = scratchDir();
    const bin = join(local, "Programs", "Podman");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "podman.exe"), "");
    expect(podmanBinDirs({ LOCALAPPDATA: local }, "win32")[0]).toBe(bin);
    expect(podmanExe({ LOCALAPPDATA: local }, "win32")).toBe(join(bin, "podman.exe"));
    expect(podmanInstalled({ LOCALAPPDATA: local }, "win32")).toBe(true);
  });

  it("is false when the directory is empty", () => {
    const local = scratchDir();
    expect(podmanInstalled({ LOCALAPPDATA: local }, "win32")).toBe(false);
  });
});

describe("runPodmanSetup", () => {
  it("skips on non-Windows so chat is not blocked", async () => {
    const events = [];
    for await (const event of runPodmanSetup({ platform: "linux" })) events.push(event);
    expect(events.at(-1)).toMatchObject({ skip: true, reason: "not-windows", done: true });
  });

  it("skips when WSL is missing rather than failing the arm", async () => {
    const events = [];
    for await (const event of runPodmanSetup({
      platform: "win32",
      env: { LOCALAPPDATA: scratchDir(), SystemRoot: "C:\\Windows" },
      run: async () => ({ code: 1, stdout: "", stderr: "WSL is not installed" }),
    })) {
      events.push(event);
    }
    expect(events.at(-1)).toMatchObject({ skip: true, reason: "wsl-missing", done: true });
  });

  it("does not download when Podman is present and the machine is already running", async () => {
    const local = scratchDir();
    const bin = join(local, "Programs", "Podman");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "podman.exe"), "");
    let fetched = 0;
    const events = [];
    for await (const event of runPodmanSetup({
      platform: "win32",
      env: { LOCALAPPDATA: local, SystemRoot: "C:\\Windows" },
      fetchImpl: fakeFetch(async () => {
        fetched += 1;
        return new Response("no");
      }),
      run: async (_command, args) => {
        if (args[0] === "-l") return ok("  NAME\n* docker-desktop");
        if (args.includes("inspect")) {
          return ok(JSON.stringify([{ State: "running", Resources: { Memory: PODMAN_MACHINE_MEMORY_MIB } }]));
        }
        if (args[0] === "info") return ok("{}");
        return { code: 1, stdout: "", stderr: args.join(" ") };
      },
    })) {
      events.push(event);
    }
    expect(fetched).toBe(0);
    expect(events.at(-1)).toEqual({ status: "Podman is ready", done: true });
  });

  it("sizes a new machine at init, not via machine set", () => {
    expect(podmanMachineInitArgs()).toEqual([
      "machine",
      "init",
      "--provider",
      "wsl",
      "--memory",
      String(PODMAN_MACHINE_MEMORY_MIB),
    ]);
  });

  it("recreates an undersized WSL machine instead of machine set --memory", async () => {
    const local = scratchDir();
    const bin = join(local, "Programs", "Podman");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "podman.exe"), "");
    const seen: string[] = [];
    const events = [];
    for await (const event of runPodmanSetup({
      platform: "win32",
      env: { LOCALAPPDATA: local, SystemRoot: "C:\\Windows" },
      run: async (_command, args) => {
        seen.push(args.join(" "));
        if (args[0] === "-l") return ok("docker-desktop");
        if (args.includes("inspect")) {
          return ok(JSON.stringify([{ State: "running", Resources: { Memory: 2048 } }]));
        }
        if (args.includes("stop") || args.includes("rm") || args.includes("init") || args.includes("start") || args[0] === "info") {
          return ok("{}");
        }
        return { code: 1, stdout: "", stderr: args.join(" ") };
      },
    })) {
      events.push(event);
    }
    expect(seen.some((row) => row.includes("machine stop"))).toBe(true);
    expect(seen.some((row) => row.includes("machine rm --force"))).toBe(true);
    expect(seen.some((row) => row.includes(`machine init --provider wsl --memory ${PODMAN_MACHINE_MEMORY_MIB}`))).toBe(
      true,
    );
    expect(seen.some((row) => row.includes("machine set --memory"))).toBe(false);
    expect(seen.some((row) => row.includes("machine start"))).toBe(true);
    expect(events.at(-1)).toEqual({ status: "Podman is ready", done: true });
  });

  it("inits a missing machine with guest RAM already sized", async () => {
    const local = scratchDir();
    const bin = join(local, "Programs", "Podman");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "podman.exe"), "");
    const seen: string[] = [];
    const events = [];
    for await (const event of runPodmanSetup({
      platform: "win32",
      env: { LOCALAPPDATA: local, SystemRoot: "C:\\Windows" },
      run: async (_command, args) => {
        seen.push(args.join(" "));
        if (args[0] === "-l") return ok("docker-desktop");
        if (args.includes("inspect")) {
          if (args.includes("init") || seen.some((row) => row.includes("machine init"))) {
            return ok(JSON.stringify([{ State: "stopped", Resources: { Memory: PODMAN_MACHINE_MEMORY_MIB } }]));
          }
          return { code: 1, stdout: "", stderr: "no machine" };
        }
        if (args.includes("init") || args.includes("start") || args[0] === "info") return ok("{}");
        return { code: 1, stdout: "", stderr: args.join(" ") };
      },
    })) {
      events.push(event);
    }
    expect(seen.some((row) => row.includes(`machine init --provider wsl --memory ${PODMAN_MACHINE_MEMORY_MIB}`))).toBe(
      true,
    );
    expect(events.at(-1)).toEqual({ status: "Podman is ready", done: true });
  });

  it("skips machine start with the real CLI error, not a generic line", async () => {
    const local = scratchDir();
    const bin = join(local, "Programs", "Podman");
    mkdirSync(bin, { recursive: true });
    writeFileSync(join(bin, "podman.exe"), "");
    const events = [];
    for await (const event of runPodmanSetup({
      platform: "win32",
      env: { LOCALAPPDATA: local, SystemRoot: "C:\\Windows" },
      run: async (_command, args) => {
        if (args[0] === "-l") return ok("docker-desktop");
        if (args.includes("inspect")) {
          return ok(JSON.stringify([{ State: "stopped", Resources: { Memory: PODMAN_MACHINE_MEMORY_MIB } }]));
        }
        if (args.includes("start")) {
          return {
            code: 125,
            stdout: "",
            stderr: [
              "your 131072x1 screen size is bogus. expect trouble",
              "CreateFile \\\\.\\pipe\\podman-machine-default: All pipe instances are busy.",
              "Error: machine did not transition into running state: ssh error: machine not in running state",
            ].join("\n"),
          };
        }
        return { code: 1, stdout: "", stderr: args.join(" ") };
      },
    })) {
      events.push(event);
    }
    expect(events.at(-1)?.skip).toBe(true);
    expect(events.at(-1)?.status).toMatch(/machine did not transition into running state/i);
    expect(events.at(-1)?.status).not.toMatch(/screen size is bogus/i);
  });

  it("skips a checksum-mismatched installer rather than throwing", async () => {
    const events = [];
    for await (const event of runPodmanSetup({
      platform: "win32",
      env: { LOCALAPPDATA: scratchDir(), SystemRoot: "C:\\Windows" },
      exists: () => false,
      fetchImpl: fakeFetch(async () => new Response("not-an-msi")),
      run: async (_command, args) => (args[0] === "-l" ? ok("ok") : { code: 1, stdout: "", stderr: "no" }),
    })) {
      events.push(event);
    }
    expect(events.at(-1)?.skip).toBe(true);
    expect(events.at(-1)?.reason).toBe("setup-failed");
    expect(events.at(-1)?.status).toMatch(/checksum/i);
  });

  it("pins the published MSI checksum", () => {
    expect(PODMAN_MSI_URL).toContain("v6.0.2");
    expect(PODMAN_MSI_SHA256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("wslPresent", () => {
  it("is true when wsl -l -v exits 0", async () => {
    expect(await wslPresent({ SystemRoot: "C:\\Windows" }, async () => ok("docker-desktop"))).toBe(true);
  });
});
