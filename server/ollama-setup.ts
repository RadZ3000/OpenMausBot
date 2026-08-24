// Path A runtime: fetch a pinned Ollama zip and launch `ollama serve`.
//
// `runtimeEnv()` is inert until we own the process. A tray install someone
// else started keeps Ollama's laptop-hostile defaults. Fetching their embed
// zip (CLI + GPU libs, no tray, no updater) is a memory decision before it
// is a convenience one. Models land under our data directory so uninstall
// reclaims them.
//
// If 127.0.0.1:11434 already answers, we do nothing. Do not spawn their
// installer copy. Stream the zip to disk — it is ~1.4 GB and must not sit
// in RAM. Review the URL and SHA-256 together before bumping a release.
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
  MODELS_DIRNAME,
  runtimeEnv,
  DEFAULT_CONTEXT_TOKENS,
  shouldDisableOllamaVulkan,
  type RuntimePolicy,
} from "./local-runtime.ts";
import { OLLAMA_ORIGIN, runtimeUp } from "./local-model.ts";
import { killCliTree } from "./procs.ts";

/** Review this URL and SHA-256 together before bumping an Ollama release. */
export const OLLAMA_ZIP_VERSION = "0.32.15";
export const OLLAMA_ZIP_URL =
  "https://github.com/ollama/ollama/releases/download/v0.32.15/ollama-windows-amd64.zip";
export const OLLAMA_ZIP_SHA256 = "a1d11d46a944f9c7521f5e9a3a5db51cd3365401da627d96c204698fc6914ff9";
export const OLLAMA_ZIP_BYTES = 1_460_302_386;
const ZIP_BYTES_MAX = 2 * 1024 * 1024 * 1024;
export const RUNTIME_DIRNAME = "local-runtime";

export type OllamaSkipReason = "not-windows" | "setup-failed";

export type OllamaSetupEvent = {
  status: string;
  fraction?: number | null;
  done?: boolean;
  skip?: boolean;
  reason?: OllamaSkipReason;
};

export type ArgvLaunch = {
  command: string;
  args: string[];
};

export type PauseFn = (ms: number) => Promise<void>;

export interface OllamaChild {
  pid?: number;
  exitCode: number | null;
  signalCode: NodeJS.Signals | null;
  onError(listener: (error: Error) => void): void;
}

export interface OllamaSetupHooks {
  platform?: NodeJS.Platform;
  env?: Record<string, string | undefined>;
  dataDir: string;
  fetchImpl?: typeof fetch;
  origin?: string;
  exists?: (path: string) => boolean;
  extract?: (zipPath: string, dest: string) => Promise<void>;
  spawnServe?: (command: string, args: string[], env: NodeJS.ProcessEnv) => OllamaChild;
  pause?: PauseFn;
  contextTokens?: number;
  now?: () => number;
  serveTimeoutMs?: number;
}

let owned: ChildProcess | null = null;
let ownedFake: OllamaChild | null = null;

export function runtimeDir(dataDir: string): string {
  return join(dataDir, RUNTIME_DIRNAME);
}

export function modelsDir(dataDir: string): string {
  return join(dataDir, MODELS_DIRNAME);
}

export function ollamaExe(
  dataDir: string,
  platform: NodeJS.Platform = process.platform,
): string {
  return join(runtimeDir(dataDir), platform === "win32" ? "ollama.exe" : "ollama");
}

export function ollamaInstalled(
  dataDir: string,
  platform: NodeJS.Platform = process.platform,
  exists: (path: string) => boolean = existsSync,
): boolean {
  return exists(ollamaExe(dataDir, platform));
}

export function tarExtractSpawn(
  zipPath: string,
  dest: string,
  env: Record<string, string | undefined> = process.env,
): ArgvLaunch {
  const root = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  return {
    command: join(root, "System32", "tar.exe"),
    args: ["-xf", zipPath, "-C", dest],
  };
}

export function stopOwnedOllama(): void {
  if (owned) {
    killCliTree(owned);
    owned = null;
  }
  ownedFake = null;
}

function spawnEnvFrom(env: Record<string, string | undefined>, policy: RuntimePolicy): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = {};
  for (const key of Object.keys(env)) {
    const value = env[key];
    if (value !== undefined) out[key] = value;
  }
  return { ...out, ...runtimeEnv(policy) };
}

function defaultPause(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function defaultExtract(
  zipPath: string,
  dest: string,
  env: Record<string, string | undefined>,
): Promise<void> {
  const launched = tarExtractSpawn(zipPath, dest, env);
  await mkdir(dest, { recursive: true });
  await new Promise<void>((resolve, reject) => {
    const child = spawn(launched.command, launched.args, { windowsHide: true, stdio: "ignore" });
    child.once("error", reject);
    child.once("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Ollama zip extract exited ${code ?? "without a code"}`));
    });
  });
}

type ZipProgress = { seen: number; total: number };

async function streamZipToFile(
  body: ReadableStream<Uint8Array>,
  dest: string,
  total: number,
  onProgress: (progress: ZipProgress) => void,
): Promise<string> {
  const hash = createHash("sha256");
  let seen = 0;
  const out = createWriteStream(dest);
  const reader = body.getReader();
  try {
    for (;;) {
      const step = await reader.read();
      if (step.done) break;
      const chunk = Buffer.from(step.value);
      seen += chunk.byteLength;
      if (seen > ZIP_BYTES_MAX) throw new Error("Ollama download was unexpectedly large");
      hash.update(chunk);
      onProgress({ seen, total });
      await new Promise<void>((resolve, reject) => {
        out.write(chunk, (err) => (err ? reject(err) : resolve()));
      });
    }
  } finally {
    await new Promise<void>((resolve, reject) => {
      out.end((err: Error | null | undefined) => (err ? reject(err) : resolve()));
    });
  }
  if (seen === 0) throw new Error("Ollama download was empty");
  return hash.digest("hex");
}

function serving(child: ChildProcess | OllamaChild | null): boolean {
  if (child === null) return false;
  return child.exitCode === null && child.signalCode === null;
}

async function waitUntilUp(hooks: OllamaSetupHooks): Promise<boolean> {
  const fetchImpl = hooks.fetchImpl ?? fetch;
  const origin = hooks.origin ?? OLLAMA_ORIGIN;
  const pause = hooks.pause ?? defaultPause;
  const now = hooks.now ?? Date.now;
  const deadline = now() + (hooks.serveTimeoutMs ?? 60_000);
  while (now() < deadline) {
    if (await runtimeUp(fetchImpl, origin)) return true;
    if (!serving(owned) && !serving(ownedFake)) return false;
    await pause(250);
  }
  return false;
}

async function spawnServe(hooks: OllamaSetupHooks): Promise<void> {
  const platform = hooks.platform ?? process.platform;
  const env = hooks.env ?? process.env;
  const exists = hooks.exists ?? existsSync;
  const command = ollamaExe(hooks.dataDir, platform);
  const policy: RuntimePolicy = {
    modelsDir: modelsDir(hooks.dataDir),
    contextTokens: hooks.contextTokens ?? DEFAULT_CONTEXT_TOKENS,
    disableVulkan: shouldDisableOllamaVulkan({
      platform,
      systemRoot: env.SystemRoot || env.SYSTEMROOT || "C:\\Windows",
      exists,
    }),
  };
  const childEnv = spawnEnvFrom(env, policy);
  await mkdir(policy.modelsDir, { recursive: true });
  stopOwnedOllama();
  if (hooks.spawnServe) {
    ownedFake = hooks.spawnServe(command, ["serve"], childEnv);
    return;
  }
  owned = spawn(command, ["serve"], {
    env: childEnv,
    cwd: runtimeDir(hooks.dataDir),
    windowsHide: true,
    stdio: "ignore",
  });
  owned.once("error", () => {
    owned = null;
  });
}

/** Launch our pinned copy if it is on disk and nothing is already serving. */
export async function ensureOwnedOllama(hooks: OllamaSetupHooks): Promise<boolean> {
  const fetchImpl = hooks.fetchImpl ?? fetch;
  const origin = hooks.origin ?? OLLAMA_ORIGIN;
  const platform = hooks.platform ?? process.platform;
  const exists = hooks.exists ?? existsSync;
  if (await runtimeUp(fetchImpl, origin)) return true;
  if (!ollamaInstalled(hooks.dataDir, platform, exists)) return false;
  await spawnServe(hooks);
  return waitUntilUp(hooks);
}

/** Download, unpack, and start Ollama for Path A. */
export async function* runOllamaSetup(hooks: OllamaSetupHooks): AsyncGenerator<OllamaSetupEvent> {
  const platform = hooks.platform ?? process.platform;
  const env = hooks.env ?? process.env;
  const exists = hooks.exists ?? existsSync;
  const fetchImpl = hooks.fetchImpl ?? fetch;
  const origin = hooks.origin ?? OLLAMA_ORIGIN;

  if (await runtimeUp(fetchImpl, origin)) {
    yield { status: "Ollama is already running", done: true };
    return;
  }

  if (platform !== "win32") {
    yield {
      status: "On this OS, install Ollama yourself, then come back.",
      skip: true,
      reason: "not-windows",
      done: true,
    };
    return;
  }

  if (!ollamaInstalled(hooks.dataDir, platform, exists)) {
    yield { status: "Downloading Ollama…", fraction: 0 };
    const zipPath = join(hooks.dataDir, `ollama-${OLLAMA_ZIP_VERSION}.zip`);
    const response = await fetchImpl(OLLAMA_ZIP_URL);
    if (!response.ok) throw new Error(`Ollama download failed (HTTP ${response.status})`);
    if (!response.body) throw new Error("Ollama download sent no body");
    const headerLength = headerBytes(response.headers.get("content-length"));
    const total = headerLength ?? OLLAMA_ZIP_BYTES;
    const incoming: ZipProgress[] = [];
    let wake: (() => void) | undefined;
    const outcomes: Array<{ ok: true; digest: string } | { ok: false; error: Error }> = [];
    void streamZipToFile(response.body, zipPath, total, (progress) => {
      incoming.push(progress);
      wake?.();
    }).then(
      (digest) => {
        outcomes.push({ ok: true, digest });
        wake?.();
      },
      (cause) => {
        const error = cause instanceof Error ? cause : new Error("Ollama download failed");
        outcomes.push({ ok: false, error });
        wake?.();
      },
    );
    let lastFraction = 0;
    for (;;) {
      if (incoming.length === 0 && outcomes.length === 0) {
        await new Promise<void>((resolve) => {
          wake = resolve;
        });
      }
      while (incoming.length > 0) {
        const progress = incoming.shift()!;
        const fraction = Math.min(1, progress.seen / progress.total);
        if (fraction - lastFraction >= 0.01 || fraction === 1) {
          lastFraction = fraction;
          yield { status: "Downloading Ollama…", fraction };
        }
      }
      if (outcomes.length > 0) break;
    }
    const zipDone = outcomes[0];
    if (!zipDone) throw new Error("Ollama download did not finish");
    if (!zipDone.ok) throw zipDone.error;
    if (zipDone.digest !== OLLAMA_ZIP_SHA256) {
      await rm(zipPath, { force: true });
      throw new Error("Ollama download checksum did not match the pinned release");
    }
    yield { status: "Unpacking Ollama…" };
    const dest = runtimeDir(hooks.dataDir);
    await mkdir(dest, { recursive: true });
    if (hooks.extract) await hooks.extract(zipPath, dest);
    else await defaultExtract(zipPath, dest, env);
    if (!ollamaInstalled(hooks.dataDir, platform, exists)) {
      throw new Error("Ollama unpacked but ollama.exe is still missing");
    }
    await rm(zipPath, { force: true });
  }

  yield { status: "Starting Ollama…" };
  await spawnServe(hooks);
  if (!(await waitUntilUp(hooks))) {
    stopOwnedOllama();
    throw new Error("Ollama started but did not answer on 127.0.0.1:11434");
  }
  yield { status: "Ollama is running", done: true };
}

function headerBytes(raw: string | null): number | null {
  if (raw === null || raw === "") return null;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}
