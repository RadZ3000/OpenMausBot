import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  ensureOwnedOllama,
  ollamaExe,
  ollamaInstalled,
  OLLAMA_ZIP_SHA256,
  OLLAMA_ZIP_URL,
  runOllamaSetup,
  stopOwnedOllama,
  tarExtractSpawn,
  type OllamaChild,
} from "./ollama-setup.ts";

function fakeFetch(respond: () => Promise<Response>): typeof fetch {
  // SAFETY: the functions under test call fetch one way only — with a URL, for
  // a Response — so a plain responder satisfies every use they make of it.
  return respond as typeof fetch;
}

const scratch: string[] = [];
afterEach(() => {
  stopOwnedOllama();
  for (const dir of scratch.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function scratchDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "omb-ollama-"));
  scratch.push(dir);
  return dir;
}

function idleChild(): OllamaChild {
  return {
    exitCode: null,
    signalCode: null,
    onError() {},
  };
}

describe("tarExtractSpawn", () => {
  it("extracts with System32 tar argv, never a shell one-liner", () => {
    const launched = tarExtractSpawn("D:\\tmp\\ollama.zip", "D:\\tmp\\runtime", { SystemRoot: "C:\\Windows" });
    expect(launched.command.replaceAll("/", "\\")).toBe("C:\\Windows\\System32\\tar.exe");
    expect(launched.args).toEqual(["-xf", "D:\\tmp\\ollama.zip", "-C", "D:\\tmp\\runtime"]);
  });
});

describe("ollamaInstalled", () => {
  it("finds ollama.exe under our data directory, not Programs\\Ollama", () => {
    const data = scratchDir();
    mkdirSync(join(data, "local-runtime"), { recursive: true });
    writeFileSync(join(data, "local-runtime", "ollama.exe"), "");
    expect(ollamaExe(data, "win32")).toBe(join(data, "local-runtime", "ollama.exe"));
    expect(ollamaInstalled(data, "win32")).toBe(true);
    expect(ollamaInstalled(scratchDir(), "win32")).toBe(false);
  });
});

describe("runOllamaSetup", () => {
  it("no-ops when something is already answering on the origin", async () => {
    const events = [];
    for await (const event of runOllamaSetup({
      dataDir: scratchDir(),
      platform: "win32",
      fetchImpl: fakeFetch(async () => new Response("{}", { status: 200 })),
      origin: "http://runtime.test",
    })) {
      events.push(event);
    }
    expect(events.at(-1)).toEqual({ status: "Ollama is already running", done: true });
  });

  it("skips the zip on non-Windows", async () => {
    const events = [];
    for await (const event of runOllamaSetup({
      dataDir: scratchDir(),
      platform: "darwin",
      fetchImpl: fakeFetch(async () => new Response("down", { status: 503 })),
      origin: "http://runtime.test",
    })) {
      events.push(event);
    }
    expect(events.at(-1)).toMatchObject({ skip: true, reason: "not-windows", done: true });
  });

  it("rejects a checksum-mismatched zip", async () => {
    let calls = 0;
    await expect(async () => {
      for await (const _event of runOllamaSetup({
        dataDir: scratchDir(),
        platform: "win32",
        env: { SystemRoot: "C:\\Windows" },
        origin: "http://runtime.test",
        fetchImpl: fakeFetch(async () => {
          calls += 1;
          if (calls === 1) return new Response("down", { status: 503 });
          return new Response("not-an-ollama-zip");
        }),
        exists: () => false,
      })) {
        /* drain */
      }
    }).rejects.toThrow(/checksum/);
  });

  it("spawns ollama serve with our memory policy when the zip is already unpacked", async () => {
    const data = scratchDir();
    mkdirSync(join(data, "local-runtime"), { recursive: true });
    writeFileSync(join(data, "local-runtime", "ollama.exe"), "");
    let seen: { command: string; args: string[]; env: NodeJS.ProcessEnv } | null = null;
    let tags = 0;
    const events = [];
    for await (const event of runOllamaSetup({
      dataDir: data,
      platform: "win32",
      origin: "http://runtime.test",
      fetchImpl: fakeFetch(async () => {
        tags += 1;
        if (tags === 1) return new Response("down", { status: 503 });
        return new Response("{}", { status: 200 });
      }),
      exists: (path) => path.endsWith("ollama.exe"),
      spawnServe: (command, args, env) => {
        seen = { command, args, env };
        return idleChild();
      },
      pause: async () => {},
    })) {
      events.push(event);
    }
    expect(seen).not.toBeNull();
    expect(seen!.args).toEqual(["serve"]);
    expect(seen!.command).toBe(join(data, "local-runtime", "ollama.exe"));
    expect(seen!.env.OLLAMA_MODELS).toBe(join(data, "local-models"));
    expect(seen!.env.OLLAMA_MAX_LOADED_MODELS).toBe("1");
    expect(seen!.env.OLLAMA_KEEP_ALIVE).toBe("60s");
    expect(events.at(-1)).toEqual({ status: "Ollama is running", done: true });
  });

  it("pins the published zip checksum", () => {
    expect(OLLAMA_ZIP_URL).toContain("v0.32.15");
    expect(OLLAMA_ZIP_SHA256).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("ensureOwnedOllama", () => {
  it("does not spawn when the origin is already up", async () => {
    let spawned = 0;
    const ready = await ensureOwnedOllama({
      dataDir: scratchDir(),
      origin: "http://runtime.test",
      fetchImpl: fakeFetch(async () => new Response("{}", { status: 200 })),
      spawnServe: () => {
        spawned += 1;
        return idleChild();
      },
    });
    expect(ready).toBe(true);
    expect(spawned).toBe(0);
  });
});
