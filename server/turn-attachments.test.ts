import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { TurnAttachment } from "./contracts.ts";
import { attachmentsAsText, filesOf, imagesOf, inlineImage, withAttachmentText } from "./turn-attachments.ts";

const attachment = (over: Partial<TurnAttachment> = {}): TurnAttachment => ({
  id: "a1",
  name: "shot.png",
  mime: "image/png",
  size: 10,
  path: "/tmp/shot.png",
  kind: "image",
  ...over,
});

describe("attachment prompt text", () => {
  it("names an image as a picture and a file as a file", () => {
    expect(attachmentsAsText([attachment()])).toBe('<attached-image path="/tmp/shot.png" />');
    expect(attachmentsAsText([attachment({ kind: "file", path: "/tmp/notes.txt" })])).toBe(
      '<attached-file path="/tmp/notes.txt" />',
    );
  });

  it("keeps a hostile filename inside its attribute", () => {
    const text = attachmentsAsText([attachment({ path: '/tmp/a"><script>x</script>.png' })]);
    expect(text).toBe('<attached-image path="/tmp/a&quot;&gt;&lt;script&gt;x&lt;/script&gt;.png" />');
    expect(text).not.toContain("<script>");
  });

  it("leaves a turn without attachments byte-identical", () => {
    expect(withAttachmentText("hello", [])).toBe("hello");
  });

  it("appends a block after the user's text", () => {
    expect(withAttachmentText("look", [attachment()])).toBe('look\n\n<attached-image path="/tmp/shot.png" />');
    expect(withAttachmentText("", [attachment()])).toBe('<attached-image path="/tmp/shot.png" />');
  });
});

describe("splitting and inlining", () => {
  it("separates what can be shown from what can only be opened", () => {
    const items = [attachment(), attachment({ id: "a2", kind: "file" })];
    expect(imagesOf(items).map((a) => a.id)).toEqual(["a1"]);
    expect(filesOf(items).map((a) => a.id)).toEqual(["a2"]);
    expect(imagesOf()).toEqual([]);
  });

  it("reads bytes back as base64", () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-attach-"));
    const path = join(dir, "x.png");
    writeFileSync(path, Buffer.from([1, 2, 3, 4]));
    expect(inlineImage(attachment({ path }))).toEqual({ data: "AQIDBA==", mime: "image/png" });
  });

  it("drops an attachment whose bytes went missing instead of failing the turn", () => {
    expect(inlineImage(attachment({ path: "/nope/gone.png" }))).toBeNull();
  });
});
