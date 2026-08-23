// Frontier Local VM / VPS fused observe. Claude, Codex, and grokAgent keep
// Cua's tool names; after a mutating call we attach a screenshot so the
// same MCP result is a fresh observation (Box's act-and-observe loop).
// Path A local-inject must never use this wrapper — 8k, no vision.
import { z } from "zod";

import {
  cuaResultFromMcp,
  cuaToolResultSchema,
  resolveWindowLook,
  type CuaCallArgs,
  type CuaToolCaller,
  type CuaToolResult,
} from "./compact-computer-open.ts";
import { isAllowedCompactComputerInner } from "./compact-computer-tools.ts";
import {
  normalizeBrowserUrl,
  ObservationCoordinator,
  parseBrowserTargets,
  safeBrowserUrl,
} from "./computer-observation.ts";
import { SPAWNED_PROXIES } from "./proxy-paths.ts";

/** Busts MCP schema caches when we inject wait_for_navigation. */
export const OBSERVE_COMPUTER_WIRE_FLAG = "--wire=observe-1";

export const WAIT_FOR_NAVIGATION_NAME = "wait_for_navigation";

export const WAIT_FOR_NAVIGATION_TOOL = {
  name: WAIT_FOR_NAVIGATION_NAME,
  description:
    "Verify that the Linux VM browser reached one exact http(s) URL, including its query and fragment, with at most three bounded checks. Reports current page URLs when Cua has them. Does not rewrite navigation.",
  inputSchema: {
    type: "object",
    properties: { url: { type: "string" } },
    required: ["url"],
  },
};

const MUTATING_CUA_TOOLS = new Set([
  "click",
  "double_click",
  "right_click",
  "drag",
  "scroll",
  "type_text",
  "press_key",
  "hotkey",
  "move_cursor",
  "launch_app",
  "bring_to_front",
  "zoom",
  "browser_navigate",
  "browser_prepare",
]);

export type ObserveClock = {
  wait: (ms: number) => Promise<void>;
};

export type ObservationImage = {
  data: string;
  mimeType: "image/png" | "image/jpeg";
};

export type WholeObservationCheck = {
  ok: boolean;
  mime: "image/png" | "image/jpeg";
};

const mcpPartSchema = z
  .object({
    type: z.string().optional(),
    text: z.string().optional(),
    data: z.string().optional(),
    mimeType: z.string().optional(),
  })
  .passthrough();

export const mcpToolResultSchema = z
  .object({
    content: z.array(mcpPartSchema).optional(),
    structuredContent: z.object({}).passthrough().optional(),
    isError: z.boolean().optional(),
  })
  .passthrough();

export type McpToolResult = z.infer<typeof mcpToolResultSchema>;

const browserUrlFieldsSchema = z
  .object({
    url: z.string().optional(),
    page_url: z.string().optional(),
    current_url: z.string().optional(),
    json_list: z.string().optional(),
    tabs: z
      .array(z.object({ url: z.string().optional() }).passthrough())
      .optional(),
  })
  .passthrough();

const structuredShotSchema = z
  .object({
    screenshot: z.string().optional(),
    screenshot_base64: z.string().optional(),
    image_base64: z.string().optional(),
  })
  .passthrough();

export function shouldFuseObserve(toolName: string): boolean {
  return MUTATING_CUA_TOOLS.has(toolName);
}

export function observeSettleMs(raw: string | undefined): number {
  if (raw === undefined || raw === "") return 350;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 350;
  return n > 3_000 ? 3_000 : n;
}

export function defaultObserveClock(): ObserveClock {
  return {
    wait: (ms) => (ms <= 0 ? Promise.resolve() : new Promise((resolve) => setTimeout(resolve, ms))),
  };
}

/** Same whole-image contract as container-computer.wholeScreenshot, kept
 * local so the MCP bundle does not pull the Local VM lifecycle module. */
export function wholeObservationImage(bytes: Buffer): WholeObservationCheck {
  if (bytes.length < 512) return { ok: false, mime: "image/png" };
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (png) {
    return {
      ok: bytes.subarray(Math.max(0, bytes.length - 12)).includes(Buffer.from("IEND", "ascii")),
      mime: "image/png",
    };
  }
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8;
  return {
    ok: jpeg && bytes.subarray(Math.max(0, bytes.length - 32)).includes(Buffer.from([0xff, 0xd9])),
    mime: "image/jpeg",
  };
}

function imageFromBase64(raw: string): ObservationImage | undefined {
  const trimmed = raw.trim();
  const marker = "base64,";
  const at = trimmed.indexOf(marker);
  const b64 = at >= 0 ? trimmed.slice(at + marker.length) : trimmed;
  if (!b64) return undefined;
  const bytes = Buffer.from(b64, "base64");
  const check = wholeObservationImage(bytes);
  if (!check.ok) return undefined;
  return { data: b64, mimeType: check.mime };
}

export function screenshotFromMcpResult(result: McpToolResult): ObservationImage | undefined {
  for (const part of result.content ?? []) {
    if (part.type !== "image" || !part.data) continue;
    const image = imageFromBase64(part.data);
    if (image) return image;
  }
  const structured = structuredShotSchema.safeParse(result.structuredContent ?? {});
  if (!structured.success) return undefined;
  for (const raw of [structured.data.screenshot, structured.data.screenshot_base64, structured.data.image_base64]) {
    if (!raw) continue;
    const image = imageFromBase64(raw);
    if (image) return image;
  }
}

export function urlsFromCuaBrowserState(result: McpToolResult): string[] {
  const structured = browserUrlFieldsSchema.safeParse(result.structuredContent ?? {});
  const found: string[] = [];
  const push = (value: string | undefined) => {
    const normalized = normalizeBrowserUrl(value);
    if (normalized && !found.includes(normalized)) found.push(normalized);
  };
  if (structured.success) {
    push(structured.data.url);
    push(structured.data.page_url);
    push(structured.data.current_url);
    for (const tab of structured.data.tabs ?? []) push(tab.url);
    if (structured.data.json_list) {
      for (const target of parseBrowserTargets(structured.data.json_list)) push(target.comparisonUrl);
    }
  }
  for (const part of result.content ?? []) {
    if (part.type === "text" && part.text) {
      for (const target of parseBrowserTargets(part.text)) push(target.comparisonUrl);
    }
  }
  return found;
}

export function fuseObservation(
  result: McpToolResult,
  frame: ObservationImage | undefined,
  coordinator: ObservationCoordinator,
  followsAction: boolean,
): McpToolResult {
  const textParts = (result.content ?? []).filter((part) => part.type !== "image");
  if (result.isError) return result;
  if (!frame) {
    return {
      ...result,
      content: [
        ...textParts,
        {
          type: "text",
          text: "(couldn't capture the screen — call screenshot to retry)",
        },
      ],
    };
  }
  const observation = coordinator.observeFrame(frame.data, null);
  if (!observation.changed) {
    const guidance = followsAction
      ? " Don't repeat the action — it may already have succeeded. If you expected a change, call screenshot again after it has had time to render."
      : " No new image is attached.";
    return {
      ...result,
      content: [
        ...textParts,
        {
          type: "text",
          text: `(the screen is identical to the frame you already have.${guidance})`,
        },
      ],
    };
  }
  return {
    ...result,
    content: [
      ...textParts,
      { type: "image", data: frame.data, mimeType: frame.mimeType },
    ],
  };
}

export function cuaFromMcpResult(result: McpToolResult): CuaToolResult {
  const structured = cuaToolResultSchema.safeParse(result.structuredContent ?? {});
  return cuaResultFromMcp({
    structuredContent: structured.success ? structured.data : undefined,
    content: result.content,
    isError: result.isError,
  });
}

/** Cua 0.20 bind mode needs pid + window_id. Empty `{}` is refused live. */
export async function readBoundBrowserState(
  callMcp: (name: string, args: CuaCallArgs) => Promise<McpToolResult>,
): Promise<McpToolResult> {
  const call: CuaToolCaller = async (name, args) => cuaFromMcpResult(await callMcp(name, args));
  const target = await resolveWindowLook(call, {});
  if (!target.ok) {
    return { content: [{ type: "text", text: target.error }] };
  }
  return callMcp("get_browser_state", { pid: target.pid, window_id: target.windowId });
}

export type NavigationCheck = {
  ok: boolean;
  text: string;
};

export async function waitForCuaNavigation(
  readState: () => Promise<McpToolResult>,
  url: string,
  clock: ObserveClock,
  attempts = 3,
): Promise<NavigationCheck> {
  const expected = normalizeBrowserUrl(url);
  const publicUrl = safeBrowserUrl(url);
  if (!expected || !publicUrl) {
    return { ok: false, text: "wait_for_navigation needs a valid http(s) URL" };
  }
  let urls: string[] = [];
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await clock.wait(1_000);
    const state = await readState();
    urls = urlsFromCuaBrowserState(state);
    if (urls.includes(expected)) {
      return { ok: true, text: `navigation verified: ${publicUrl}` };
    }
  }
  const current = urls.map((item) => safeBrowserUrl(item) ?? item).join(", ");
  if (!current) {
    return {
      ok: false,
      text: "navigation not verified after 3 checks. Cua did not report a page URL. Look at the window.",
    };
  }
  return {
    ok: false,
    text: `navigation not verified after 3 checks. Current structured state: ${current}. Use screenshot only if needed.`,
  };
}

const toolsListFrameSchema = z
  .object({
    result: z.object({ tools: z.array(z.object({}).passthrough()) }).passthrough(),
  })
  .passthrough();

const listedToolSchema = z.object({ name: z.string() }).passthrough();

/** Append wait_for_navigation to a tools/list result without renaming Cua tools. */
export function withWaitForNavigationTool(line: string): string {
  let parsed: z.infer<typeof toolsListFrameSchema>;
  try {
    const raw = JSON.parse(line);
    const frame = toolsListFrameSchema.safeParse(raw);
    if (!frame.success) return line;
    parsed = frame.data;
  } catch {
    return line;
  }
  const tools = parsed.result.tools;
  for (const item of tools) {
    const tool = listedToolSchema.safeParse(item);
    if (tool.success && tool.data.name === WAIT_FOR_NAVIGATION_NAME) return line;
  }
  return JSON.stringify({
    ...parsed,
    result: { ...parsed.result, tools: [...tools, WAIT_FOR_NAVIGATION_TOOL] },
  });
}

/** Put observe-computer-mcp in front of Local VM / VPS Cua bridges for
 * frontier engines. Host Cua and the Path A compact wrapper are left alone. */
export function wrapComputerMcpForFrontier<T extends { args: string[] }>(launch: T): T {
  const observe = SPAWNED_PROXIES.observeComputerMcp;
  const compact = SPAWNED_PROXIES.compactComputerMcp;
  if (launch.args[0] === observe || launch.args[0] === compact) return launch;
  const inner = launch.args.find((arg) => isAllowedCompactComputerInner(arg));
  if (!inner) return launch;
  return { ...launch, args: [observe, OBSERVE_COMPUTER_WIRE_FLAG, ...launch.args] };
}
