// Turning attachments into the shapes the engines accept.
//
// Three of them are protocol-specific and live with their driver; what is
// shared is the fallback — a path in the prompt text, which is what every
// attachment got before this existed and is still the only thing a
// string-only engine can be handed.
import { readFileSync } from "node:fs";

import type { TurnAttachment } from "./contracts.ts";

/** File paths are untrusted prompt content: a filename can carry quotes or
 * newlines and would otherwise break out of the attribute it sits in.
 * Mirrors escapeAttribute in src/lib/composer-attachments.ts. */
function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\t", "&#9;")
    .replaceAll("\r", "&#13;")
    .replaceAll("\n", "&#10;");
}

/** The prompt text for attachments an engine cannot be shown directly. A
 * file needs only its path — every driver here is an agent that can open
 * one. Images say so, because an agent that cannot see pixels should know
 * there is a picture worth opening rather than a blob worth ignoring. */
export function attachmentsAsText(attachments: readonly TurnAttachment[]): string {
  return attachments
    .map((a) =>
      a.kind === "image"
        ? `<attached-image path="${escapeAttribute(a.path)}" />`
        : `<attached-file path="${escapeAttribute(a.path)}" />`,
    )
    .join("\n");
}

/** `text`, with any attachments the caller could not deliver structurally
 * appended. Empty attachments leave the text byte-identical, so a turn that
 * carries none is unchanged for every driver. */
export function withAttachmentText(text: string, attachments: readonly TurnAttachment[]): string {
  if (attachments.length === 0) return text;
  const block = attachmentsAsText(attachments);
  return text ? `${text}\n\n${block}` : block;
}

export const imagesOf = (attachments: readonly TurnAttachment[] = []) =>
  attachments.filter((a) => a.kind === "image");

export const filesOf = (attachments: readonly TurnAttachment[] = []) =>
  attachments.filter((a) => a.kind !== "image");

/** Base64 for the protocols that inline bytes (ACP, Claude, OpenAI-style
 * APIs). Unreadable bytes are dropped rather than failing the turn: the
 * message still has its text, and a turn that dies because one attachment
 * went missing is worse than one that answers without it. */
export function inlineImage(attachment: TurnAttachment): { data: string; mime: string } | null {
  try {
    return { data: readFileSync(attachment.path).toString("base64"), mime: attachment.mime };
  } catch {
    return null;
  }
}
