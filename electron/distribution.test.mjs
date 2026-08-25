import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FALLBACK_PRODUCT_NAME, distributionEnv, readDistributionMetadata, resolveProductName } from "./distribution.mjs";

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

  it("forwards the product name the overlay baked in", () => {
    expect(distributionEnv({ productName: "FlowDesk" }, {}).OMB_PRODUCT_NAME).toBe("FlowDesk");
  });

  it("does not forward unset brand slots", () => {
    expect(
      distributionEnv(
        {
          dataDirectoryName: "unset",
          composioBrokerUrl: "unset",
          companionName: "unset",
          httpUserAgent: "unset",
          controlPlaneUrl: "unset",
        },
        {},
      ),
    ).toEqual({});
  });

  it("forwards the phone name without stealing the computer's Bonjour label", () => {
    expect(distributionEnv({ companionName: "FlowDesk Phone" }, {}).OMB_PHONE_NAME).toBe("FlowDesk Phone");
    expect(distributionEnv({ companionName: "FlowDesk Phone" }, {}).OMB_COMPANION_NAME).toBeUndefined();
  });

  it("forwards team library off so the server does not fetch upstream", () => {
    expect(distributionEnv({ teamLibrary: "off" }, {}).OMB_TEAM_LIBRARY).toBe("off");
  });

  it("forwards the control-plane origin only when plugged", () => {
    expect(distributionEnv({ controlPlaneUrl: "https://accounts.example.com" }, {}).OMB_CONTROL_PLANE_URL).toBe(
      "https://accounts.example.com",
    );
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

  it("falls back to the brand pack name, not the upstream name", () => {
    expect(FALLBACK_PRODUCT_NAME).toBe("FlowDesk");
    expect(resolveProductName({}, {})).toBe("FlowDesk");
    expect(resolveProductName({ productName: "Acme" }, {})).toBe("Acme");
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
