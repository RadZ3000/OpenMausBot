// ACP session/prompt last hop: keep upstream's <attached-image path> in the
// text, and when initialize advertised promptCapabilities.image, also send
// the bytes. Codex still opens the path itself; this is only for ACP agents
// that asked for image blocks. Paths outside the attachments dir stay text.
import { basename, isAbsolute, relative, resolve, sep } from "node:path";

import { ATTACHMENTS_DIR, IMAGE_MAX_BYTES, readAttachment } from "./attachments.ts";

export type AcpTextBlock = { type: "text"; text: string };
export type AcpImageBlock = { type: "image"; mimeType: string; data: string };
export type AcpPromptBlock = AcpTextBlock | AcpImageBlock;

export type AcpInitializePromptCaps = {
  agentCapabilities?: { promptCapabilities?: { image?: boolean } };
};

const ATTACHED_IMAGE_TAG = /<attached-image\s+path="([^"]*)"\s*\/?>(?:\s*\n)?/g;

export function acpPromptAcceptsImage(init: AcpInitializePromptCaps | undefined): boolean {
  return init?.agentCapabilities?.promptCapabilities?.image === true;
}

export function buildAcpPrompt(text: string, images: boolean): AcpPromptBlock[] {
  if (!images) return [{ type: "text", text }];
  const loaded: AcpImageBlock[] = [];
  const display = text.replace(ATTACHED_IMAGE_TAG, (match, raw: string) => {
    const image = readPromptImage(unescapeAttribute(raw));
    if (!image) return match;
    loaded.push(image);
    return "";
  });
  if (loaded.length === 0) return [{ type: "text", text }];
  const trimmed = display.trim();
  return [{ type: "text", text: trimmed || "[Attached image]" }, ...loaded];
}

function unescapeAttribute(raw: string): string {
  return raw
    .replaceAll("&quot;", '"')
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function readPromptImage(filePath: string): AcpImageBlock | undefined {
  if (!filePath) return undefined;
  const name = basename(filePath);
  if (!pathIsInsideAttachments(filePath)) return undefined;
  if (resolve(filePath) !== resolve(ATTACHMENTS_DIR, name)) return undefined;
  const saved = readAttachment(name);
  if (!saved || saved.bytes.byteLength > IMAGE_MAX_BYTES) return undefined;
  return { type: "image", mimeType: saved.mime, data: saved.bytes.toString("base64") };
}

function pathIsInsideAttachments(filePath: string): boolean {
  const root = resolve(ATTACHMENTS_DIR);
  const resolved = resolve(filePath);
  const rel = relative(root, resolved);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) return false;
  if (rel.includes(`..${sep}`)) return false;
  return true;
}
