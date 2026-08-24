import { describe, expect, it } from "vitest";

import { APPROX_MODEL_BYTES, diskNeededBytes, hasRoomOnDisk, modelForTier, tierFor } from "./machine.ts";
import {
  DEFAULT_CONTEXT_TOKENS,
  runtimeEnv,
  shouldDisableOllamaVulkan,
  TIGHT_CONTEXT_TOKENS,
} from "./local-runtime.ts";

const GB = 1024 * 1024 * 1024;
const spec = (memoryGb: number, freeDiskGb: number | null = 100) => ({
  totalMemoryBytes: memoryGb * GB,
  freeDiskBytes: freeDiskGb === null ? null : freeDiskGb * GB,
});

describe("tierFor", () => {
  it("refuses a machine a model cannot fit on", () => {
    expect(tierFor(spec(4))).toBe("unsupported");
    expect(tierFor(spec(7.5))).toBe("unsupported");
  });

  it("calls the middle band tight, which is where it runs but crawls", () => {
    expect(tierFor(spec(8))).toBe("tight");
    expect(tierFor(spec(12))).toBe("tight");
    expect(tierFor(spec(15))).toBe("tight");
  });

  it("is comfortable from 24 GB up", () => {
    expect(tierFor(spec(24))).toBe("comfortable");
    expect(tierFor(spec(64))).toBe("comfortable");
  });

  // 8B + 32k + Local VM does not fit a 16 GB laptop with headroom. A nominal
  // 16 GB machine reports about 15.7 and is tight on purpose.
  it("counts a nominal 16 GB machine, which reports under, as tight", () => {
    expect(tierFor(spec(15.7))).toBe("tight");
  });
});

describe("modelForTier", () => {
  it("offers Thinking 8B on both runnable tiers, and nothing below that", () => {
    expect(modelForTier("comfortable")).toBe("qwen3-vl:8b");
    expect(modelForTier("tight")).toBe("qwen3-vl:8b");
    expect(modelForTier("unsupported")).toBeNull();
  });
});

describe("hasRoomOnDisk", () => {
  it("wants the model plus headroom for the runtime and the unpack", () => {
    expect(diskNeededBytes(APPROX_MODEL_BYTES)).toBe(APPROX_MODEL_BYTES + 5 * GB);
  });

  it("refuses when the drive cannot hold it", () => {
    expect(hasRoomOnDisk(spec(32, 4), APPROX_MODEL_BYTES)).toBe(false);
  });

  it("allows it when there is room", () => {
    expect(hasRoomOnDisk(spec(32, 40), APPROX_MODEL_BYTES)).toBe(true);
  });

  // A filesystem we could not query is not a reason to block someone; the
  // download reports its own failure well enough.
  it("does not block when free space is unknown", () => {
    expect(hasRoomOnDisk(spec(32, null), APPROX_MODEL_BYTES)).toBe(true);
  });
});

describe("runtimeEnv", () => {
  const env = runtimeEnv({ modelsDir: "/data/local-models", contextTokens: DEFAULT_CONTEXT_TOKENS });

  // The two defaults that actually hurt: three resident models, held five
  // minutes each.
  it("holds one model, briefly", () => {
    expect(env.OLLAMA_MAX_LOADED_MODELS).toBe("1");
    expect(env.OLLAMA_KEEP_ALIVE).toBe("60s");
  });

  it("keeps the weights where uninstalling can reclaim them", () => {
    expect(env.OLLAMA_MODELS).toBe("/data/local-models");
  });

  it("caps the context at 32k on both RAM tiers", () => {
    expect(env.OLLAMA_CONTEXT_LENGTH).toBe("32768");
    expect(runtimeEnv({ modelsDir: "/d", contextTokens: TIGHT_CONTEXT_TOKENS }).OLLAMA_CONTEXT_LENGTH).toBe("32768");
  });

  it("compresses the cache and serves one request at a time", () => {
    expect(env.OLLAMA_KV_CACHE_TYPE).toBe("q8_0");
    expect(env.OLLAMA_NUM_PARALLEL).toBe("1");
  });

  it("omits Vulkan keys unless asked, so NVIDIA keeps CUDA", () => {
    expect("OLLAMA_VULKAN" in env).toBe(false);
    expect("GGML_VK_VISIBLE_DEVICES" in env).toBe(false);
    const forced = runtimeEnv({ modelsDir: "/d", contextTokens: 32768, disableVulkan: true });
    expect("OLLAMA_VULKAN" in forced ? forced.OLLAMA_VULKAN : undefined).toBe("0");
    expect("GGML_VK_VISIBLE_DEVICES" in forced ? forced.GGML_VK_VISIBLE_DEVICES : undefined).toBe("-1");
  });
});

describe("shouldDisableOllamaVulkan", () => {
  it("leaves Vulkan alone off Windows", () => {
    expect(
      shouldDisableOllamaVulkan({
        platform: "linux",
        systemRoot: "C:\\Windows",
        exists: () => false,
      }),
    ).toBe(false);
  });

  it("disables Vulkan on Windows when nvcuda.dll is missing", () => {
    expect(
      shouldDisableOllamaVulkan({
        platform: "win32",
        systemRoot: "C:\\Windows",
        exists: () => false,
      }),
    ).toBe(true);
  });

  it("leaves Vulkan alone on Windows when nvcuda.dll is present", () => {
    expect(
      shouldDisableOllamaVulkan({
        platform: "win32",
        systemRoot: "C:\\Windows",
        exists: (path) => path.endsWith("nvcuda.dll"),
      }),
    ).toBe(false);
  });
});
