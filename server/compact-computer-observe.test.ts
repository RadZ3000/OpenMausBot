import { describe, expect, it } from "vitest";

import { ObservationCoordinator } from "./computer-observation.ts";
import {
  captureCompactFrame,
  compactObserveImageEnabled,
  compactObserveImageEnv,
  compactObserveImageForModel,
  compactObservedParts,
  compactShotGuestPath,
  COMPACT_OBSERVE_IMAGE_ENV,
  COMPACT_SHOT_GUEST_PATH,
  observeCompactText,
} from "./compact-computer-observe.ts";

function wholePng(): string {
  const buf = Buffer.alloc(520, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  Buffer.from("IEND", "ascii").copy(buf, buf.length - 8);
  return buf.toString("base64");
}

describe("compactObserveImageForModel", () => {
  it("is off for Granite, on for Qwen3-VL and qwen2.5vl", () => {
    expect(compactObserveImageForModel("ollama::ibm/granite4.1:3b")).toBe(false);
    expect(compactObserveImageForModel("ollama::ibm/granite4.1:8b")).toBe(false);
    expect(compactObserveImageForModel("ollama::qwen3-vl:4b")).toBe(true);
    expect(compactObserveImageForModel("ollama::qwen3-vl:4b-instruct")).toBe(true);
    expect(compactObserveImageForModel("ollama::qwen3vl:4b")).toBe(true);
    expect(compactObserveImageEnv("ollama::qwen3-vl:4b")).toEqual({ [COMPACT_OBSERVE_IMAGE_ENV]: "1" });
    expect(compactObserveImageForModel("ollama::qwen2.5vl:7b")).toBe(true);
    expect(compactObserveImageForModel("local_ollama::qwen2.5-vl:7b")).toBe(true);
    expect(compactObserveImageEnv("ollama::ibm/granite4.1:3b")).toEqual({});
    expect(compactObserveImageEnv("ollama::qwen2.5vl:7b")).toEqual({ [COMPACT_OBSERVE_IMAGE_ENV]: "1" });
  });
});

describe("compactObserveImageEnabled", () => {
  it("requires the exact env flag", () => {
    expect(compactObserveImageEnabled({})).toBe(false);
    expect(compactObserveImageEnabled({ [COMPACT_OBSERVE_IMAGE_ENV]: "1" })).toBe(true);
    expect(compactObserveImageEnabled({ [COMPACT_OBSERVE_IMAGE_ENV]: "true" })).toBe(false);
  });
});

describe("compactObservedParts", () => {
  it("keeps text and a whole PNG, and prefers fused text notes", () => {
    const png = wholePng();
    expect(
      compactObservedParts("opened", {
        content: [
          { type: "text", text: "opened" },
          { type: "image", data: png, mimeType: "image/png" },
        ],
      }),
    ).toEqual({ text: "opened", image: { data: png, mimeType: "image/png" } });
  });
});

describe("observeCompactText", () => {
  it("attaches a screenshot only when the env flag is set", async () => {
    const png = wholePng();
    const callMcp = async () => ({
      content: [{ type: "image" as const, data: png, mimeType: "image/png" as const }],
    });
    const clock = { wait: async () => {} };
    const off = await observeCompactText("opened", false, callMcp, new ObservationCoordinator(), clock, 0);
    expect(off.image).toBeUndefined();
    const prev = process.env[COMPACT_OBSERVE_IMAGE_ENV];
    process.env[COMPACT_OBSERVE_IMAGE_ENV] = "1";
    try {
      const on = await observeCompactText("opened", false, callMcp, new ObservationCoordinator(), clock, 0);
      expect(on.image).toEqual({ data: png, mimeType: "image/png" });
      const errored = await observeCompactText("fail", true, callMcp, new ObservationCoordinator(), clock, 0);
      expect(errored.image).toBeUndefined();
      const captioned = await observeCompactText(
        "opened",
        false,
        callMcp,
        new ObservationCoordinator(),
        clock,
        0,
        undefined,
        async () => "OMB-GOLD-C9E2",
      );
      expect(captioned.image).toBeUndefined();
      expect(captioned.text).toContain("opened");
      expect(captioned.text).toContain("OMB-GOLD-C9E2");
    } finally {
      if (prev === undefined) delete process.env[COMPACT_OBSERVE_IMAGE_ENV];
      else process.env[COMPACT_OBSERVE_IMAGE_ENV] = prev;
    }
  });
});

describe("captureCompactFrame", () => {
  it("reads Cua screenshot_file_path when MCP image parts are missing", async () => {
    const png = wholePng();
    const names: string[] = [];
    const frame = await captureCompactFrame(async (name, args) => {
      names.push(name);
      if (name === "screenshot") return { content: [{ type: "text", text: "denied" }] };
      expect(args).toEqual({ screenshot_out_file: COMPACT_SHOT_GUEST_PATH });
      return {
        content: [{ type: "text", text: "ok" }],
        structuredContent: {
          screenshot_file_path: COMPACT_SHOT_GUEST_PATH,
          screenshot_mime_type: "image/png",
        },
      };
    }, async (path) => {
      expect(path).toBe(COMPACT_SHOT_GUEST_PATH);
      return { data: png, mimeType: "image/png" };
    });
    expect(names).toEqual(["screenshot", "get_desktop_state"]);
    expect(frame).toEqual({ data: png, mimeType: "image/png" });
    expect(
      compactShotGuestPath({
        structuredContent: { screenshot_file_path: COMPACT_SHOT_GUEST_PATH },
      }),
    ).toBe(COMPACT_SHOT_GUEST_PATH);
    expect(compactShotGuestPath({ structuredContent: { screenshot_file_path: "/etc/passwd" } })).toBeUndefined();
  });
});
