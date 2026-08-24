// Stdio wrapper in front of container-mcp / vps-container-mcp. Hermes sees
// the compact Path A computer tool list; Cua Driver still runs the calls.
// Spawned only for local-inject models (see wrapComputerMcpForLocalModel).
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

import {
  cuaClickFromIndex,
  cuaRefusalMessage,
  httpUrlFromArgs,
  lookFromWindowState,
  openVisibleUrl,
  resolveWindowLook,
  windowExcerpt,
} from "./compact-computer-open.ts";
import type { CuaCallArgs, CuaToolResult, LastWindowLook } from "./compact-computer-open.ts";
import {
  compactToolsListLine,
  COMPACT_COMPUTER_WIRE_FLAG,
  cuaNameForComputerWire,
  isAllowedCompactComputerInner,
} from "./compact-computer-tools.ts";
import {
  compactObserveImageEnabled,
  COMPACT_OBSERVE_CAPTION_MODEL_ENV,
  COMPACT_SHOT_GUEST_PATH,
  observeCompactText,
} from "./compact-computer-observe.ts";
import { ObservationCoordinator } from "./computer-observation.ts";
import {
  cuaFromMcpResult,
  mcpToolResultSchema,
  wholeObservationImage,
  type McpToolResult,
  type ObservationImage,
} from "./observe-computer.ts";
import { createComputerLookClient } from "./computer-thread-state.ts";
import { createLineSplitter } from "./mcp-bridge.ts";

const raw = process.argv.slice(2);
const argv = raw[0] === COMPACT_COMPUTER_WIRE_FLAG ? raw.slice(1) : raw;
const inner = argv[0];
if (!inner || !isAllowedCompactComputerInner(inner)) {
  process.stderr.write("compact-computer-mcp: expected container-mcp or vps-container-mcp as the first argument\n");
  process.exit(2);
}

const run = promisify(execFile);
const jsonValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string())]);
const callSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.literal("tools/call"),
  params: z
    .object({
      name: z.string(),
      arguments: z.record(z.string(), jsonValueSchema).optional(),
    })
    .passthrough(),
});
const responseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    result: z
      .object({
        content: z.array(z.object({ text: z.string().optional() }).passthrough()).optional(),
        structuredContent: z.unknown().optional(),
        isError: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    error: z.object({ message: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();
const lookArgsSchema = z.object({
  pid: z.number().optional(),
  window_id: z.number().optional(),
});
const clickArgsSchema = z.object({
  index: z.number().optional(),
  element_index: z.number().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
});
const argsSchema = z
  .object({
    url: z.string().optional(),
    urls: z.array(z.string()).optional(),
  })
  .passthrough();
const looseFrameSchema = z.object({}).passthrough();

const child = spawn(process.execPath, [inner, ...argv.slice(1)], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
  windowsHide: true,
});

child.stdin.on("error", () => {});
child.stderr.pipe(process.stderr);

const pending = new Map<string | number, (result: McpToolResult) => void>();
let nextInnerId = 1;
let chain: Promise<void> = Promise.resolve();

function writeInner(frame: z.infer<typeof looseFrameSchema>): void {
  child.stdin.write(`${JSON.stringify(frame)}\n`);
}

function failPending(message: string): void {
  const failed: McpToolResult = { content: [{ type: "text", text: message }], isError: true };
  for (const finish of pending.values()) finish(failed);
  pending.clear();
}

function callMcp(name: string, args: CuaCallArgs): Promise<McpToolResult> {
  const id = `omb-${nextInnerId}`;
  nextInnerId += 1;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    writeInner({
      jsonrpc: "2.0",
      id,
      method: "tools/call",
      params: { name, arguments: args },
    });
  });
}

function callCua(name: string, args: CuaCallArgs): Promise<CuaToolResult> {
  return callMcp(name, args).then((result) => cuaFromMcpResult(result));
}

async function readGuestShot(path: string): Promise<ObservationImage | undefined> {
  if (path !== COMPACT_SHOT_GUEST_PATH) return;
  const runtime = argv[1];
  const container = argv[2];
  if (runtime !== "podman" && runtime !== "docker") return;
  if (!container || !/^[a-zA-Z0-9_.-]+$/.test(container)) return;
  const jpegPath = "/tmp/openmausbot-compact-shot.jpg";
  try {
    await run(
      runtime,
      [
        "exec",
        "-u",
        "cua",
        container,
        "ffmpeg",
        "-y",
        "-i",
        path,
        "-vf",
        "scale=512:-1",
        "-q:v",
        "8",
        jpegPath,
      ],
      { encoding: "utf8", timeout: 20_000, windowsHide: true },
    );
    const { stdout } = await run(runtime, ["exec", "-u", "cua", container, "base64", "-w0", jpegPath], {
      encoding: "utf8",
      timeout: 20_000,
      windowsHide: true,
    });
    const b64 = stdout.trim();
    const check = wholeObservationImage(Buffer.from(b64, "base64"));
    if (!check.ok) return;
    return { data: b64, mimeType: check.mime };
  } catch {
    return;
  }
}

async function captionShot(image: ObservationImage): Promise<string | undefined> {
  const model = process.env[COMPACT_OBSERVE_CAPTION_MODEL_ENV]?.trim();
  if (!model) return;
  const host = process.env.OLLAMA_HOST?.trim() || "127.0.0.1:11434";
  const url = /^https?:\/\//i.test(host)
    ? `${host.replace(/\/$/, "")}/v1/chat/completions`
    : `http://${host}/v1/chat/completions`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        max_tokens: 80,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Read any large painted letters in this screenshot. Reply with only those letters. If there are none, describe the screen in one short sentence.",
              },
              {
                type: "image_url",
                image_url: { url: `data:${image.mimeType};base64,${image.data}` },
              },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return;
    const parsed = z
      .object({
        choices: z
          .array(z.object({ message: z.object({ content: z.string().optional() }).passthrough() }).passthrough())
          .optional(),
      })
      .safeParse(await res.json());
    const text = parsed.success ? parsed.data.choices?.[0]?.message.content?.trim() : undefined;
    if (!text) return;
    return text.length > 240 ? text.slice(0, 240) : text;
  } catch {
    return;
  }
}

async function replyObserved(id: string | number, text: string, isError: boolean): Promise<void> {
  if (!compactObserveImageEnabled() || isError) {
    reply(id, text, isError);
    return;
  }
  const captioner = process.env[COMPACT_OBSERVE_CAPTION_MODEL_ENV]?.trim() ? captionShot : undefined;
  const observed = await observeCompactText(
    text,
    isError,
    callMcp,
    observeCoordinator,
    undefined,
    undefined,
    readGuestShot,
    captioner,
  );
  reply(id, observed.text, false, observed.image);
}

function reply(
  id: string | number,
  text: string,
  isError: boolean,
  image?: { data: string; mimeType: "image/png" | "image/jpeg" },
): void {
  const content: Array<{ type: string; text?: string; data?: string; mimeType?: string }> = [
    { type: "text", text },
  ];
  if (image) content.push({ type: "image", data: image.data, mimeType: image.mimeType });
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id,
      result: { content, isError },
    })}\n`,
  );
}

let lastLook: LastWindowLook | undefined;
const lookClient = createComputerLookClient();
const observeCoordinator = new ObservationCoordinator();

function enqueue(work: () => Promise<void>): void {
  chain = chain.then(work, work);
}

async function rememberLook(seen: CuaToolResult, pid: number, windowId: number): Promise<void> {
  lastLook = lookFromWindowState(seen, pid, windowId);
  const excerpt = windowExcerpt(seen);
  const title = excerpt.split("\n")[0] ?? "";
  await lookClient.save(lastLook, title, excerpt);
}

async function restoreLook(): Promise<LastWindowLook | undefined> {
  if (lastLook) return lastLook;
  const loaded = await lookClient.load();
  if (!loaded) return undefined;
  lastLook = loaded;
  return lastLook;
}

async function readFrontWindow(pid: number, windowId: number): Promise<{ text: string; ok: boolean }> {
  const seen = await callCua("get_window_state", { pid, window_id: windowId });
  const fail = cuaRefusalMessage(seen);
  if (fail) return { text: fail, ok: false };
  await rememberLook(seen, pid, windowId);
  return { text: windowExcerpt(seen) || "looked at the frontmost Chromium window", ok: true };
}

const inbound = createLineSplitter((line) => {
  let parsed: z.infer<typeof looseFrameSchema>;
  try {
    const rawFrame = JSON.parse(line);
    const loose = looseFrameSchema.safeParse(rawFrame);
    if (!loose.success) return;
    parsed = loose.data;
  } catch {
    return;
  }
  const call = callSchema.safeParse(parsed);
  if (!call.success) {
    writeInner(parsed);
    return;
  }
  const cuaName = cuaNameForComputerWire(call.data.params.name) ?? call.data.params.name;
  const args = argsSchema.safeParse(call.data.params.arguments ?? {});
  const url = args.success ? httpUrlFromArgs(args.data) : undefined;
  if (cuaName === "browser_navigate" || (cuaName === "launch_app" && url)) {
    const requestId = call.data.id;
    enqueue(async () => {
      if (!url) {
        reply(requestId, "url is required", true);
        return;
      }
      try {
        const opened = await openVisibleUrl(url, callCua);
        if (opened.look) {
          const pid = opened.look.pid;
          const windowId = opened.look.window_id;
          if (pid != null && windowId != null) await rememberLook(opened.look, pid, windowId);
        }
        replyObserved(requestId, opened.text, !opened.ok);
      } catch {
        reply(requestId, "opening the URL on the computer failed", true);
      }
    });
    return;
  }
  if (cuaName === "get_window_state") {
    const requestId = call.data.id;
    const parsedLook = lookArgsSchema.safeParse(call.data.params.arguments ?? {});
    const given: CuaCallArgs = parsedLook.success
      ? { pid: parsedLook.data.pid, window_id: parsedLook.data.window_id }
      : {};
    enqueue(async () => {
      try {
        if (given.pid == null || given.window_id == null) {
          const restored = await restoreLook();
          if (restored) {
            given.pid = restored.pid;
            given.window_id = restored.windowId;
          }
        }
        const target = await resolveWindowLook(callCua, given);
        if (!target.ok) {
          reply(requestId, target.error, true);
          return;
        }
        const seen = await readFrontWindow(target.pid, target.windowId);
        reply(requestId, seen.text, !seen.ok);
      } catch {
        reply(requestId, "reading the window failed", true);
      }
    });
    return;
  }
  if (cuaName === "click") {
    const requestId = call.data.id;
    const parsedClick = clickArgsSchema.safeParse(call.data.params.arguments ?? {});
    const index = parsedClick.success ? (parsedClick.data.index ?? parsedClick.data.element_index) : undefined;
    const x = parsedClick.success ? parsedClick.data.x : undefined;
    const y = parsedClick.success ? parsedClick.data.y : undefined;
    enqueue(async () => {
      try {
        if (index != null) {
          const look = await restoreLook();
          if (!look) {
            reply(requestId, "the window was not read in this turn", true);
            return;
          }
          const clicked = await callCua("click", cuaClickFromIndex(look, index));
          const clickFail = cuaRefusalMessage(clicked);
          if (clickFail) {
            reply(requestId, clickFail, true);
            return;
          }
          const seen = await readFrontWindow(look.pid, look.windowId);
          replyObserved(requestId, seen.ok ? `clicked [${index}]\n\n${seen.text}` : `clicked [${index}]`, false);
          return;
        }
        if (x == null || y == null) {
          reply(requestId, "index is required", true);
          return;
        }
        const restored = await restoreLook();
        const target = restored
          ? { ok: true as const, pid: restored.pid, windowId: restored.windowId }
          : await resolveWindowLook(callCua, {});
        if (!target.ok) {
          reply(requestId, target.error, true);
          return;
        }
        const clicked = await callCua("click", { pid: target.pid, x, y });
        const clickFail = cuaRefusalMessage(clicked);
        if (clickFail) {
          reply(requestId, clickFail, true);
          return;
        }
        const seen = await readFrontWindow(target.pid, target.windowId);
        replyObserved(requestId, seen.ok ? `clicked\n\n${seen.text}` : "clicked", false);
      } catch {
        reply(requestId, "clicking failed", true);
      }
    });
    return;
  }
  writeInner({
    ...call.data,
    params: { ...call.data.params, name: cuaName },
  });
});

process.stdin.on("data", (chunk: Buffer) => inbound.push(chunk));
process.stdin.on("end", () => {
  inbound.flush();
  chain.finally(() => child.stdin.end());
});

const outbound = createLineSplitter((line) => {
  let parsed: z.infer<typeof looseFrameSchema>;
  try {
    const rawFrame = JSON.parse(line);
    const loose = looseFrameSchema.safeParse(rawFrame);
    if (!loose.success) {
      process.stdout.write(`${line}\n`);
      return;
    }
    parsed = loose.data;
  } catch {
    process.stdout.write(`${line}\n`);
    return;
  }
  const frame = responseSchema.safeParse(parsed);
  if (frame.success && pending.has(frame.data.id)) {
    const finish = pending.get(frame.data.id);
    pending.delete(frame.data.id);
    if (frame.data.error?.message) {
      finish?.({ content: [{ type: "text", text: frame.data.error.message }], isError: true });
      return;
    }
    const parsed = mcpToolResultSchema.safeParse(frame.data.result ?? {});
    finish?.(
      parsed.success
        ? parsed.data
        : { content: [{ type: "text", text: "Cua returned an empty tool result" }], isError: true },
    );
    return;
  }
  process.stdout.write(`${compactToolsListLine(line)}\n`);
});
child.stdout.on("data", (chunk: Buffer) => outbound.push(chunk));
child.stdout.on("end", () => outbound.flush());

child.on("error", (error) => {
  process.stderr.write(`compact-computer-mcp: ${error.message}\n`);
  failPending(error.message);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  failPending("Cua MCP bridge closed");
  if (signal) process.stderr.write(`compact-computer-mcp inner ended with ${signal}\n`);
  process.exitCode = process.exitCode ?? code ?? 1;
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => child.kill(signal));
}
