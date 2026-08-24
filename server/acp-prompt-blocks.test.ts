// ACP prompt last hop: path tags stay text unless initialize asked for
// images and the file is a name-locked attachment.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ATTACHMENTS_DIR, saveImage } from "./attachments.ts";
import { acpPromptAcceptsImage, buildAcpPrompt } from "./acp-prompt-blocks.ts";

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

describe("acpPromptAcceptsImage", () => {
  it("is true only when initialize advertised promptCapabilities.image", () => {
    expect(acpPromptAcceptsImage(undefined)).toBe(false);
    expect(acpPromptAcceptsImage({})).toBe(false);
    expect(acpPromptAcceptsImage({ agentCapabilities: {} })).toBe(false);
    expect(acpPromptAcceptsImage({ agentCapabilities: { promptCapabilities: {} } })).toBe(false);
    expect(acpPromptAcceptsImage({ agentCapabilities: { promptCapabilities: { image: false } } })).toBe(false);
    expect(acpPromptAcceptsImage({ agentCapabilities: { promptCapabilities: { image: true } } })).toBe(true);
  });
});

describe("buildAcpPrompt", () => {
  it("returns the original text when images are off", () => {
    const saved = saveImage(PNG, "image/png");
    const text = `look\n\n<attached-image path="${saved.path}" />`;
    expect(buildAcpPrompt(text, false)).toEqual([{ type: "text", text }]);
  });

  it("loads a name-locked PNG into an image block", () => {
    const saved = saveImage(PNG, "image/png");
    const blocks = buildAcpPrompt(`what is this?\n\n<attached-image path="${saved.path}" />`, true);
    expect(blocks).toEqual([
      { type: "text", text: "what is this?" },
      { type: "image", mimeType: "image/png", data: PNG.toString("base64") },
    ]);
  });

  it("uses a short caption when the message is only the tag", () => {
    const saved = saveImage(PNG, "image/png");
    const blocks = buildAcpPrompt(`<attached-image path="${saved.path}" />`, true);
    expect(blocks[0]).toEqual({ type: "text", text: "[Attached image]" });
    expect(blocks).toHaveLength(2);
  });

  it("leaves a path outside the attachments dir as text", () => {
    mkdirSync(join(process.env.HOME ?? "", "outside"), { recursive: true });
    const outsider = join(process.env.HOME ?? "", "outside", "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png");
    writeFileSync(outsider, PNG);
    const text = `see\n\n<attached-image path="${outsider}" />`;
    expect(buildAcpPrompt(text, true)).toEqual([{ type: "text", text }]);
  });

  it("leaves a missing attachment as text", () => {
    const missing = join(ATTACHMENTS_DIR, "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff.png");
    const text = `<attached-image path="${missing}" />`;
    expect(buildAcpPrompt(text, true)).toEqual([{ type: "text", text }]);
  });

  it("unescapes the path attribute the same way the composer stored it", () => {
    const saved = saveImage(PNG, "image/png");
    const escaped = saved.path.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    const blocks = buildAcpPrompt(`<attached-image path="${escaped}" />`, true);
    expect(blocks.some((block) => block.type === "image")).toBe(true);
  });
});
