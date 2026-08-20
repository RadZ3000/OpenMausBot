import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { describe, expect, it } from "vitest";

import {
  MAX_ATTACHMENT_BYTES,
  readAttachment,
  removeThreadAttachments,
  safeName,
  saveAttachment,
  sniffImageMime,
} from "./attachments.ts";

/** A real, whole PNG — the sniffer reads magic bytes, not extensions. */
function png(): Buffer {
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    Buffer.alloc(64, 7),
  ]);
}

describe("attachment names", () => {
  it("strips directory components so a name cannot climb out", () => {
    expect(safeName("../../etc/passwd")).toBe("passwd");
    expect(safeName("..\\..\\windows\\system32\\cfg.sys")).toBe("cfg.sys");
    expect(safeName("/absolute/path.png")).toBe("path.png");
  });

  it("refuses to lead with a dot and never returns empty", () => {
    expect(safeName(".ssh")).toBe("ssh");
    expect(safeName("...")).toBe("attachment");
    expect(safeName("")).toBe("attachment");
  });
});

describe("image sniffing", () => {
  it("identifies images by their bytes", () => {
    expect(sniffImageMime(png())).toBe("image/png");
    expect(sniffImageMime(Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(20), Buffer.from([0xd9])]))).toBe(
      "image/jpeg",
    );
    expect(sniffImageMime(Buffer.from("GIF89a" + "x".repeat(20)))).toBe("image/gif");
  });

  it("does not take a caller's word for it", () => {
    expect(sniffImageMime(Buffer.from("PK\u0003\u0004 this is a zip"))).toBeNull();
    expect(sniffImageMime(Buffer.from("short"))).toBeNull();
  });
});

describe("saving and resolving attachments", () => {
  it("stores an image and resolves it back by id", () => {
    const saved = saveAttachment("t-save", "shot.png", png());
    expect(saved.kind).toBe("image");
    expect(saved.mime).toBe("image/png");
    expect(saved.size).toBe(72);
    expect(readFileSync(saved.path).equals(png())).toBe(true);

    const found = readAttachment("t-save", saved.id);
    expect(found?.path).toBe(saved.path);
    removeThreadAttachments("t-save");
  });

  it("keeps a mislabelled image on the extension its bytes deserve", () => {
    const saved = saveAttachment("t-ext", "screenshot.dat", png());
    expect(basename(saved.path).endsWith(".png")).toBe(true);
    // the display name is what the user typed; only the path is normalized
    expect(saved.name).toBe("screenshot.dat");
    removeThreadAttachments("t-ext");
  });

  it("treats anything that is not an image as an openable file", () => {
    const saved = saveAttachment("t-file", "notes.txt", Buffer.from("plain text, not a picture"));
    expect(saved.kind).toBe("file");
    expect(saved.mime).toBe("application/octet-stream");
    removeThreadAttachments("t-file");
  });

  it("writes inside the thread's own directory even for a hostile name", () => {
    const saved = saveAttachment("t-evil", "../../../escape.png", png());
    expect(basename(dirname(saved.path))).toBe("t-evil");
    expect(saved.path).not.toContain("..");
    removeThreadAttachments("t-evil");
  });

  it("rejects empty and oversize uploads", () => {
    expect(() => saveAttachment("t-size", "empty.png", Buffer.alloc(0))).toThrow(/empty/);
    expect(() => saveAttachment("t-size", "huge.png", Buffer.alloc(MAX_ATTACHMENT_BYTES + 1))).toThrow(/limited to/);
  });

  it("resolves nothing for ids it never issued", () => {
    expect(readAttachment("t-miss", "not-a-uuid")).toBeNull();
    expect(readAttachment("t-miss", "11111111-2222-3333-4444-555555555555")).toBeNull();
  });

  it("forgets a conversation's attachments when it is removed", () => {
    const saved = saveAttachment("t-gone", "shot.png", png());
    expect(readAttachment("t-gone", saved.id)).not.toBeNull();
    removeThreadAttachments("t-gone");
    expect(readAttachment("t-gone", saved.id)).toBeNull();
  });
});
