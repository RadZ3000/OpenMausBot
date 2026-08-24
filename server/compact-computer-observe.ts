// Path A compact wrap can attach one screenshot after a mutating vm_* call,
// or caption it via skip-Hermes /v1 when OMB_COMPACT_OBSERVE_CAPTION_MODEL
// is set (Instruct + 8k cannot hold JPEG+tools). Off unless
// OMB_COMPACT_OBSERVE_IMAGE=1. index.ts sets those env vars when
// compactObserveImageForModel is true — VL tags (qwen3-vl, qwen2.5vl,
// granite-vision, llava), never Granite 3B/8B. Hermes MCP pixels land via
// the mcp_tool.py envelope patch (plan 007) if a JPEG is attached.
import {
  defaultObserveClock,
  fuseObservation,
  observeSettleMs,
  screenshotFromMcpResult,
  type McpToolResult,
  type ObservationImage,
  type ObserveClock,
} from "./observe-computer.ts";
import { ObservationCoordinator } from "./computer-observation.ts";
import type { CuaCallArgs } from "./compact-computer-open.ts";

export const COMPACT_OBSERVE_IMAGE_ENV = "OMB_COMPACT_OBSERVE_IMAGE";
/** Skip-Hermes Ollama tag used to caption a screenshot as text (plan 007 D). */
export const COMPACT_OBSERVE_CAPTION_MODEL_ENV = "OMB_COMPACT_OBSERVE_CAPTION_MODEL";

export function compactObserveImageEnabled(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return env[COMPACT_OBSERVE_IMAGE_ENV] === "1";
}

/** Local-inject model ids that may receive fused JPEGs. Granite 3B/8B stay text.
 * Qwen3-VL / qwen2.5vl / granite-vision / llava get a screenshot after a
 * mutating vm_* (plan 007). Caption env may replace the JPEG on Hermes. */
export function compactObserveImageForModel(model: string): boolean {
  const lower = model.toLowerCase();
  return (
    lower.includes("qwen3-vl") ||
    lower.includes("qwen3vl") ||
    lower.includes("qwen2.5vl") ||
    lower.includes("qwen2.5-vl") ||
    lower.includes("granite-vision") ||
    /(?:^|[/:-])llava(?:[/:-]|$|:)/.test(lower)
  );
}

export function compactObserveImageEnv(model: string) {
  if (!compactObserveImageForModel(model)) return {};
  return { [COMPACT_OBSERVE_IMAGE_ENV]: "1" as const };
}

export type CompactObservedParts = {
  text: string;
  image?: ObservationImage;
};

export function compactObservedParts(text: string, fused: McpToolResult): CompactObservedParts {
  const parts = fused.content ?? [];
  const texts: string[] = [];
  let image: ObservationImage | undefined;
  for (const part of parts) {
    if (
      part.type === "image" &&
      part.data &&
      (part.mimeType === "image/png" || part.mimeType === "image/jpeg")
    ) {
      image = { data: part.data, mimeType: part.mimeType };
      continue;
    }
    if (part.type === "text" && part.text) texts.push(part.text);
  }
  return { text: texts.length > 0 ? texts.join("\n") : text, image };
}

export type CompactMcpCaller = (name: string, args: CuaCallArgs) => Promise<McpToolResult>;

/** Guest path Cua 0.20.0 `get_desktop_state` writes when MCP ImageContent is absent. */
export const COMPACT_SHOT_GUEST_PATH = "/tmp/openmausbot-compact-shot.png";

export type CompactGuestShotReader = (
  path: string,
) => ObservationImage | undefined | Promise<ObservationImage | undefined>;

export function compactShotGuestPath(result: McpToolResult): string | undefined {
  const structured = result.structuredContent;
  if (!structured || !("screenshot_file_path" in structured)) return;
  const path = structured.screenshot_file_path;
  if (path === COMPACT_SHOT_GUEST_PATH) return path;
}

export async function captureCompactFrame(
  callMcp: CompactMcpCaller,
  readGuestShot?: CompactGuestShotReader,
): Promise<ObservationImage | undefined> {
  const shot = await callMcp("screenshot", {});
  const fromShot = screenshotFromMcpResult(shot);
  if (fromShot) return fromShot;
  const desk = await callMcp("get_desktop_state", { screenshot_out_file: COMPACT_SHOT_GUEST_PATH });
  const fromDesk = screenshotFromMcpResult(desk);
  if (fromDesk) return fromDesk;
  const path = compactShotGuestPath(desk);
  if (!path || !readGuestShot) return;
  return readGuestShot(path);
}

export type CompactCaptioner = (image: ObservationImage) => Promise<string | undefined>;

export async function observeCompactText(
  text: string,
  isError: boolean,
  callMcp: CompactMcpCaller,
  coordinator: ObservationCoordinator,
  clock: ObserveClock = defaultObserveClock(),
  settleMs = observeSettleMs(process.env.OMB_OBSERVE_SETTLE_MS),
  readGuestShot?: CompactGuestShotReader,
  captioner?: CompactCaptioner,
): Promise<CompactObservedParts> {
  if (isError || !compactObserveImageEnabled()) return { text };
  await clock.wait(settleMs);
  const frame = await captureCompactFrame(callMcp, readGuestShot);
  if (captioner) {
    const caption = frame ? await captioner(frame) : undefined;
    return { text: caption ? `${text}\n\n${caption}` : text };
  }
  return compactObservedParts(text, fuseObservation({ content: [{ type: "text", text }] }, frame, coordinator, true));
}
