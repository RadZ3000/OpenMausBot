import { describe, expect, it } from "vitest";

import { diskNeededBytes, hasRoomOnDisk, modelForTier, tierFor } from "./machine.ts";
import { DEFAULT_CONTEXT_TOKENS, runtimeEnv, TIGHT_CONTEXT_TOKENS } from "./local-runtime.ts";

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
  });

  it("is comfortable from 15 GB up", () => {
    expect(tierFor(spec(15))).toBe("comfortable");
    expect(tierFor(spec(64))).toBe("comfortable");
  });

  // An OS reserves some of what is installed, so a nominal 16 GB machine
  // reports about 15.7. Testing against 16 put every one of them in the tight
  // tier and moved the comfortable tier's real start to 32 GB.
  it("counts a nominal 16 GB machine, which reports under, as comfortable", () => {
    expect(tierFor(spec(15.7))).toBe("comfortable");
  });
});

describe("modelForTier", () => {
  it("offers the small model where memory is tight, and nothing below that", () => {
    expect(modelForTier("comfortable")).toBe("qwen3:4b");
    expect(modelForTier("tight")).toBe("qwen3:1.7b");
    expect(modelForTier("unsupported")).toBeNull();
  });
});

describe("hasRoomOnDisk", () => {
  it("wants the model plus headroom for the runtime and the unpack", () => {
    expect(diskNeededBytes(2.5 * GB)).toBe(5.5 * GB);
  });

  it("refuses when the drive cannot hold it", () => {
    expect(hasRoomOnDisk(spec(32, 4), 2.5 * GB)).toBe(false);
  });

  it("allows it when there is room", () => {
    expect(hasRoomOnDisk(spec(32, 40), 2.5 * GB)).toBe(true);
  });

  // A filesystem we could not query is not a reason to block someone; the
  // download reports its own failure well enough.
  it("does not block when free space is unknown", () => {
    expect(hasRoomOnDisk(spec(32, null), 2.5 * GB)).toBe(true);
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

  it("caps the context, because the KV cache grows with the transcript", () => {
    expect(env.OLLAMA_CONTEXT_LENGTH).toBe("8192");
    expect(runtimeEnv({ modelsDir: "/d", contextTokens: TIGHT_CONTEXT_TOKENS }).OLLAMA_CONTEXT_LENGTH).toBe("4096");
  });

  it("compresses the cache and serves one request at a time", () => {
    expect(env.OLLAMA_KV_CACHE_TYPE).toBe("q8_0");
    expect(env.OLLAMA_NUM_PARALLEL).toBe("1");
  });
});
