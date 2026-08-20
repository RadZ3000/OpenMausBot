// What the user attaches to a message, on disk rather than in the message.
//
// Every message the store writes is broadcast to all SSE clients in full and
// serialized into SQLite's `json` column, so a few megabytes of base64 on a
// Message would be paid for by every connected client — a phone on cellular
// most of all. Attachments therefore live as files and the message carries
// only their metadata.
//
// The upload answers with an id, never a path, and the id resolves to a path
// only here. A client that could name the file to attach could make a driver
// hand any file on disk to a model: `localImage` takes a path and Codex reads
// it. So the path is ours, written next to the bytes as a sidecar so an
// upload survives a restart between attaching and sending.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join, resolve, sep } from "node:path";

import { DATA_DIR } from "./config.ts";

export const ATTACHMENTS_DIR = join(DATA_DIR, "attachments");

/** Big enough for a retina screenshot, small enough that a handful of them
 * cannot exhaust memory while being base64'd through a JSON body. */
export const MAX_ATTACHMENT_BYTES = 8_000_000;

/** How many may ride on one message — a bound on the work a single turn can
 * ask a driver to base64 and a model to read. */
export const MAX_ATTACHMENTS_PER_MESSAGE = 8;

export interface StoredAttachment {
  id: string;
  /** What to show the user; never used to build a path. */
  name: string;
  mime: string;
  size: number;
  /** Absolute path, written by us. */
  path: string;
  /** `image` is what a vision model can be shown; `file` is a path an agent
   * can open with its own tools. */
  kind: "image" | "file";
}

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The bytes decide whether something is an image, not the filename and not
 * the content-type the client claimed. A driver that base64s a "png" that is
 * really a zip just wastes a model's context. */
export function sniffImageMime(bytes: Buffer): string | null {
  if (bytes.length < 12) return null;
  if (bytes.subarray(0, 8).equals(PNG)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[bytes.length - 1] === 0xd9) return "image/jpeg";
  if (bytes.subarray(0, 3).toString("latin1") === "GIF") return "image/gif";
  if (bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP") {
    return "image/webp";
  }
  return null;
}

const EXTENSION: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
};

/** A filename that cannot climb out of its directory or collide with the
 * sidecar: letters, digits, dot, dash and underscore, never leading with a
 * dot, never empty. */
export function safeName(name: string): string {
  const base = name
    .replace(/^.*[\\/]/, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^[.-]+/, "")
    .slice(0, 60);
  return base || "attachment";
}

function threadDir(threadId: string): string {
  return join(ATTACHMENTS_DIR, safeName(threadId));
}

export function saveAttachment(threadId: string, name: string, bytes: Buffer): StoredAttachment {
  if (bytes.length === 0) throw Object.assign(new Error("that file is empty"), { status: 400 });
  if (bytes.length > MAX_ATTACHMENT_BYTES) {
    throw Object.assign(new Error(`attachments are limited to ${Math.floor(MAX_ATTACHMENT_BYTES / 1_000_000)}MB`), {
      status: 413,
    });
  }

  const imageMime = sniffImageMime(bytes);
  const id = randomUUID();
  const display = safeName(name);
  // The extension follows the sniffed type so a mislabelled screenshot still
  // lands as .png — the CLIs that take a path key off it.
  const wanted = imageMime ? `${display.replace(/\.[A-Za-z0-9]+$/, "")}.${EXTENSION[imageMime]}` : display;

  const directory = threadDir(threadId);
  mkdirSync(directory, { recursive: true });
  const path = join(directory, `${id}-${wanted}`);
  // Defence in depth: the name is already sanitized, so this should be
  // unreachable — but a path that escaped its thread would be handed to a
  // model, and that is not a failure worth discovering in production.
  if (!resolve(path).startsWith(resolve(directory) + sep)) {
    throw Object.assign(new Error("bad attachment name"), { status: 400 });
  }

  const stored: StoredAttachment = {
    id,
    name: display,
    mime: imageMime ?? "application/octet-stream",
    size: bytes.length,
    path,
    kind: imageMime ? "image" : "file",
  };
  writeFileSync(path, bytes, { mode: 0o600 });
  writeFileSync(join(directory, `${id}.json`), JSON.stringify(stored), { mode: 0o600 });
  return stored;
}

/** Resolve an id the client handed back. Returns null for an id that was
 * never issued, whose sidecar is unreadable, or whose bytes are gone. */
export function readAttachment(threadId: string, id: string): StoredAttachment | null {
  // `id` reaches this from a URL and from a message body; keep it to the shape
  // randomUUID produces rather than trusting the caller's route regex.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const sidecar = join(threadDir(threadId), `${id}.json`);
  if (!existsSync(sidecar)) return null;
  try {
    const stored = JSON.parse(readFileSync(sidecar, "utf8")) as StoredAttachment;
    return existsSync(stored.path) ? stored : null;
  } catch {
    return null;
  }
}

/** Drop a conversation's attachments when the conversation goes. */
export function removeThreadAttachments(threadId: string): void {
  rmSync(threadDir(threadId), { recursive: true, force: true });
}
