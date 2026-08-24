import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { distributionEnv, readDistributionMetadata } from "./distribution.mjs";

describe("distributionEnv", () => {
  it("passes nothing when the build configures nothing", () => {
    expect(distributionEnv({}, {})).toEqual({});
  });

  it("carries a baked preference through to the server", () => {
    expect(distributionEnv({ defaultEngine: "hermesAgent", defaultModel: "ollama::qwen3-vl:8b" }, {})).toEqual({
      OMB_DEFAULT_ENGINE: "hermesAgent",
      OMB_DEFAULT_MODEL: "ollama::qwen3-vl:8b",
    });
  });

  it("lets the real environment override the baked value", () => {
    const env = { OMB_DEFAULT_ENGINE: "codexApp" };
    expect(distributionEnv({ defaultEngine: "hermesAgent" }, env).OMB_DEFAULT_ENGINE).toBe("codexApp");
  });

  it("carries an engine without a model, and a model without an engine", () => {
    expect(distributionEnv({ defaultEngine: "hermesAgent" }, {})).toEqual({ OMB_DEFAULT_ENGINE: "hermesAgent" });
    expect(distributionEnv({}, { OMB_DEFAULT_MODEL: "ollama::qwen3-vl:8b" })).toEqual({
      OMB_DEFAULT_MODEL: "ollama::qwen3-vl:8b",
    });
  });

  // An unset variable and one exported as "" are the same intent, and the
  // server distinguishes "absent" from "empty" — so neither may be forwarded.
  it("treats blank and whitespace as unconfigured rather than passing them on", () => {
    expect(distributionEnv({ defaultEngine: "  " }, { OMB_DEFAULT_ENGINE: "" })).toEqual({});
  });

  it("survives metadata that is missing entirely", () => {
    expect(distributionEnv(undefined, {})).toEqual({});
  });
});

describe("readDistributionMetadata", () => {
  let dir;
  beforeEach(() => void (dir = mkdtempSync(join(tmpdir(), "omb-distribution-"))));
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it("reads the block electron-builder baked in", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", distribution: { defaultEngine: "hermesAgent" } }));
    expect(readDistributionMetadata(dir)).toEqual({ defaultEngine: "hermesAgent" });
  });

  it("returns nothing for an ordinary manifest with no block", () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app", version: "1.0.0" }));
    expect(readDistributionMetadata(dir)).toEqual({});
  });

  // Startup runs before there is any window to report a failure in, so a
  // manifest that is absent or corrupt must degrade to defaults, not throw.
  it("degrades to defaults when the manifest is missing or malformed", () => {
    expect(readDistributionMetadata(join(dir, "nowhere"))).toEqual({});
    writeFileSync(join(dir, "package.json"), "{ this is not json");
    expect(readDistributionMetadata(dir)).toEqual({});
  });
});
