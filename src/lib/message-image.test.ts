import { describe, expect, it } from "vitest";

import { messageImageSrc } from "./message-image";

describe("messageImageSrc", () => {
  it("inlines the pixels when they arrived with the message", () => {
    expect(messageImageSrc("t1", { id: "m1", png: "AAA", mime: "image/webp" })).toBe("data:image/webp;base64,AAA");
  });

  it("assumes png when a live frame omits its mime", () => {
    expect(messageImageSrc("t1", { id: "m1", png: "AAA" })).toBe("data:image/png;base64,AAA");
  });

  // the reload path: the server strips stored pixels and says `hasImage`, and
  // without this the transcript rendered a hole where the picture had been
  it("fetches a stored message's pixels back from the thread route", () => {
    expect(messageImageSrc("t1", { id: "m1", hasImage: true })).toBe("/api/threads/t1/messages/m1/image");
  });

  it("escapes ids rather than pasting them into the path", () => {
    expect(messageImageSrc("t/1", { id: "m 1", hasImage: true })).toBe("/api/threads/t%2F1/messages/m%201/image");
  });

  it("has nothing to show for a message carrying no picture", () => {
    expect(messageImageSrc("t1", { id: "m1" })).toBeNull();
  });
});
