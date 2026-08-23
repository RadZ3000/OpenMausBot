// Stdio wrapper in front of container-mcp / vps-container-mcp for frontier
// engines. Cua names stay on the wire; mutating calls get a screenshot in
// the same MCP result. Spawned only for non-inject Local VM / VPS mounts.
import { spawn } from "node:child_process";
import { z } from "zod";

import { isAllowedCompactComputerInner } from "./compact-computer-tools.ts";
import { ObservationCoordinator } from "./computer-observation.ts";
import { createLineSplitter } from "./mcp-bridge.ts";
import {
  defaultObserveClock,
  fuseObservation,
  mcpToolResultSchema,
  observeSettleMs,
  OBSERVE_COMPUTER_WIRE_FLAG,
  readBoundBrowserState,
  screenshotFromMcpResult,
  shouldFuseObserve,
  waitForCuaNavigation,
  WAIT_FOR_NAVIGATION_NAME,
  withWaitForNavigationTool,
  type McpToolResult,
} from "./observe-computer.ts";

const raw = process.argv.slice(2);
const argv = raw[0] === OBSERVE_COMPUTER_WIRE_FLAG ? raw.slice(1) : raw;
const inner = argv[0];
if (!inner || !isAllowedCompactComputerInner(inner)) {
  process.stderr.write("observe-computer-mcp: expected container-mcp or vps-container-mcp as the first argument\n");
  process.exit(2);
}

const callSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]),
  method: z.literal("tools/call"),
  params: z
    .object({
      name: z.string(),
      arguments: z.object({}).passthrough().optional(),
    })
    .passthrough(),
});
const responseSchema = z
  .object({
    jsonrpc: z.literal("2.0"),
    id: z.union([z.string(), z.number()]),
    result: mcpToolResultSchema.optional(),
    error: z.object({ message: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();
const looseFrameSchema = z.object({}).passthrough();
const cuaArgsSchema = z.object({}).passthrough();
const navArgsSchema = z.object({ url: z.string().optional() }).passthrough();

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
const coordinator = new ObservationCoordinator();
const clock = defaultObserveClock();
const settleMs = observeSettleMs(process.env.OMB_OBSERVE_SETTLE_MS);

function writeInner(frame: z.infer<typeof looseFrameSchema>): void {
  child.stdin.write(`${JSON.stringify(frame)}\n`);
}

function failPending(message: string): void {
  const failed: McpToolResult = { content: [{ type: "text", text: message }], isError: true };
  for (const finish of pending.values()) finish(failed);
  pending.clear();
}

function callCua(name: string, args: z.infer<typeof cuaArgsSchema>): Promise<McpToolResult> {
  const id = `omb-obs-${nextInnerId}`;
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

function reply(id: string | number, result: McpToolResult): void {
  process.stdout.write(
    `${JSON.stringify({
      jsonrpc: "2.0",
      id,
      result,
    })}\n`,
  );
}

function enqueue(work: () => Promise<void>): void {
  chain = chain.then(work, work);
}

async function captureFrame(): Promise<ReturnType<typeof screenshotFromMcpResult>> {
  const shot = await callCua("screenshot", {});
  const fromShot = screenshotFromMcpResult(shot);
  if (fromShot) return fromShot;
  const desk = await callCua("get_desktop_state", { include_screenshot: true });
  return screenshotFromMcpResult(desk);
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
  const name = call.data.params.name;
  if (name === WAIT_FOR_NAVIGATION_NAME) {
    const requestId = call.data.id;
    const parsedNav = navArgsSchema.safeParse(call.data.params.arguments ?? {});
    enqueue(async () => {
      const url = parsedNav.success ? parsedNav.data.url : undefined;
      const outcome = await waitForCuaNavigation(
        () => readBoundBrowserState((name, args) => callCua(name, args)),
        url ?? "",
        clock,
      );
      reply(requestId, { content: [{ type: "text", text: outcome.text }], isError: !outcome.ok });
    });
    return;
  }
  if (!shouldFuseObserve(name)) {
    writeInner(parsed);
    return;
  }
  const requestId = call.data.id;
  enqueue(async () => {
    try {
      const actedArgs = cuaArgsSchema.safeParse(call.data.params.arguments ?? {});
      const acted = await callCua(name, actedArgs.success ? actedArgs.data : {});
      if (acted.isError) {
        reply(requestId, acted);
        return;
      }
      await clock.wait(settleMs);
      const frame = await captureFrame();
      reply(requestId, fuseObservation(acted, frame, coordinator, true));
    } catch {
      reply(requestId, { content: [{ type: "text", text: "observing the computer failed" }], isError: true });
    }
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
    finish?.(frame.data.result ?? {});
    return;
  }
  process.stdout.write(`${withWaitForNavigationTool(line)}\n`);
});
child.stdout.on("data", (chunk: Buffer) => outbound.push(chunk));
child.stdout.on("end", () => outbound.flush());

child.on("error", (error) => {
  process.stderr.write(`observe-computer-mcp: ${error.message}\n`);
  failPending(error.message);
  process.exitCode = 1;
});
child.on("close", (code, signal) => {
  failPending("Cua MCP bridge closed");
  if (signal) process.stderr.write(`observe-computer-mcp inner ended with ${signal}\n`);
  process.exitCode = process.exitCode ?? code ?? 1;
});

for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => child.kill(signal));
}
