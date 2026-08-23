// Path A local models cannot hold Cua Driver's ~60-tool catalog in an 8k
// window (B-24(a)). Cloud engines keep the full catalog. This module is the
// smaller list, short `vm_*` names (so they look like `extract` / `write_file`
// instead of `mcp__computer__…`), and the argv wrap that puts
// compact-computer-mcp in front of container-mcp.
import { z } from "zod";

import { SPAWNED_PROXIES } from "./proxy-paths.ts";

/** Cua tools a 3B local model can actually aim at. Descriptions on the wire
 * are replaced with the blurbs below — the stock Cua text is longer than
 * the rest of the turn. Names on the wire are the `vm_*` aliases: Hermes
 * native `browser_*` would otherwise collide when we disable that toolset.
 * P8: the allowlist stays eight names. Observation copy and chrome-skip
 * still change so Path A can run observe → act; do not add more `vm_*`. */
export const LOCAL_COMPUTER_TOOL_NAMES = [
  "list_apps",
  "list_windows",
  "get_window_state",
  "get_desktop_state",
  "launch_app",
  "click",
  "type_text",
  "browser_navigate",
] as const;

export type LocalComputerToolName = (typeof LOCAL_COMPUTER_TOOL_NAMES)[number];

/** Model-facing names. Must start with `vm_` so Hermes can skip the
 * `mcp__` prefix and keep them eager without colliding with native tools. */
export const LOCAL_COMPUTER_WIRE_NAMES = {
  list_apps: "vm_apps",
  list_windows: "vm_windows",
  get_window_state: "vm_window",
  get_desktop_state: "vm_desktop",
  launch_app: "vm_launch",
  click: "vm_click",
  type_text: "vm_keys",
  browser_navigate: "vm_open",
};

export const LOCAL_COMPUTER_TOOL_BLURBS = {
  list_apps: "List installed and running apps in the Linux VM.",
  list_windows: "List top-level windows in the Linux VM.",
  get_window_state: "Read named buttons, links, and text in the front window when you need a fresh numbered list.",
  get_desktop_state: "Read the VM desktop screenshot and open windows.",
  launch_app: "Launch an app in the Linux VM by name.",
  click: "Click one numbered item from the last window reading. Use this to follow buttons and links on the page that is already open.",
  type_text: "Type into the focused VM window.",
  browser_navigate:
    "Open a http(s) URL in Chromium on the Linux desktop. Starts the browser if needed. The result is the front window, not proof the destination loaded. If the look is browser chrome or the wrong page, use a numbered item from that look instead of opening the same URL again.",
};

/** Model-facing schema for opening a site. Cua still requires session/tab
 * ids on the far side — compact-computer-mcp fills those in. */
export const VM_OPEN_INPUT_SCHEMA = {
  type: "object",
  properties: {
    url: { type: "string", description: "http or https URL to show on the visible desktop." },
  },
  required: ["url"],
};

export const VM_LAUNCH_INPUT_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string", description: "App name to launch." },
  },
};

/** Cua still requires pid + window_id — compact-computer-mcp fills those. */
export const VM_WINDOW_INPUT_SCHEMA = {
  type: "object",
  properties: {},
};

export const VM_CLICK_INPUT_SCHEMA = {
  type: "object",
  properties: {
    index: { type: "number", description: "Number from the last window reading." },
  },
  required: ["index"],
};

/** Busts Hermes' MCP schema cache when the wire names or schemas change. */
export const COMPACT_COMPUTER_WIRE_FLAG = "--wire=vm-look-5";

const mcpToolSchema = z
  .object({
    name: z.string(),
    description: z.string().optional(),
  })
  .passthrough();

const toolsListFrameSchema = z
  .object({
    result: z.object({ tools: z.array(z.unknown()) }).passthrough(),
  })
  .passthrough();

const toolsCallFrameSchema = z
  .object({
    method: z.literal("tools/call"),
    params: z.object({ name: z.string() }).passthrough(),
  })
  .passthrough();

const ALLOWED_INNER = new Set([
  "container-mcp.ts",
  "container-mcp.js",
  "vps-container-mcp.ts",
  "vps-container-mcp.js",
]);

export function compactComputerInnerName(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? normalized : normalized.slice(slash + 1);
}

export function isAllowedCompactComputerInner(path: string): boolean {
  return ALLOWED_INNER.has(compactComputerInnerName(path));
}

export function computerWireName(cuaName: string): string | undefined {
  for (const key of LOCAL_COMPUTER_TOOL_NAMES) {
    if (key === cuaName) return LOCAL_COMPUTER_WIRE_NAMES[key];
  }
}

export function cuaNameForComputerWire(wireName: string): LocalComputerToolName | undefined {
  for (const key of LOCAL_COMPUTER_TOOL_NAMES) {
    if (LOCAL_COMPUTER_WIRE_NAMES[key] === wireName) return key;
  }
}

export function compactComputerTools(tools: Array<z.infer<typeof mcpToolSchema>>): Array<z.infer<typeof mcpToolSchema>> {
  const kept: Array<z.infer<typeof mcpToolSchema>> = [];
  for (const tool of tools) {
    for (const key of LOCAL_COMPUTER_TOOL_NAMES) {
      if (key !== tool.name) continue;
      const next = mcpToolSchema.parse({
        ...Object.fromEntries(
          Object.entries(tool).filter(([field]) => field !== "outputSchema" && field !== "output_schema"),
        ),
        name: LOCAL_COMPUTER_WIRE_NAMES[key],
        description: LOCAL_COMPUTER_TOOL_BLURBS[key],
      });
      if (key === "browser_navigate") {
        kept.push({ ...next, inputSchema: VM_OPEN_INPUT_SCHEMA });
      } else if (key === "launch_app") {
        kept.push({ ...next, inputSchema: VM_LAUNCH_INPUT_SCHEMA });
      } else if (key === "get_window_state") {
        kept.push({ ...next, inputSchema: VM_WINDOW_INPUT_SCHEMA });
      } else if (key === "click") {
        kept.push({ ...next, inputSchema: VM_CLICK_INPUT_SCHEMA });
      } else {
        kept.push(next);
      }
      break;
    }
  }
  return kept;
}

/** Rewrite a newline-delimited MCP frame if it is a tools/list result. */
export function compactToolsListLine(line: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line;
  }
  const frame = toolsListFrameSchema.safeParse(parsed);
  if (!frame.success) return line;
  const tools: Array<z.infer<typeof mcpToolSchema>> = [];
  for (const item of frame.data.result.tools) {
    const tool = mcpToolSchema.safeParse(item);
    if (tool.success) tools.push(tool.data);
  }
  return JSON.stringify({
    ...frame.data,
    result: { ...frame.data.result, tools: compactComputerTools(tools) },
  });
}

/** Map a model-facing `vm_*` tools/call back to Cua's original name. */
export function compactToolsCallLine(line: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return line;
  }
  const frame = toolsCallFrameSchema.safeParse(parsed);
  if (!frame.success) return line;
  const cua = cuaNameForComputerWire(frame.data.params.name);
  if (!cua) return line;
  return JSON.stringify({
    ...frame.data,
    params: { ...frame.data.params, name: cua },
  });
}

/** Put compact-computer-mcp in front of Local VM / VPS Cua bridges only.
 * Host Cua (cua-driver mcp argv) must not be wrapped — the inner is not
 * container-mcp / vps-container-mcp and compact-computer-mcp exits 2. */
export function wrapComputerMcpForLocalModel<T extends { args: string[] }>(launch: T): T {
  const compact = SPAWNED_PROXIES.compactComputerMcp;
  if (launch.args[0] === compact) return launch;
  const inner = launch.args.find((arg) => isAllowedCompactComputerInner(arg));
  if (!inner) return launch;
  return { ...launch, args: [compact, COMPACT_COMPUTER_WIRE_FLAG, ...launch.args] };
}
