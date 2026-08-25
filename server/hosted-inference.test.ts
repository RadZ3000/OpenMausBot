import { afterEach, describe, expect, it } from "vitest";

import type { AppConfig } from "./config.ts";
import {
  HOSTED_INFERENCE_API_KEY_ENV,
  HOSTED_INFERENCE_DRIVER,
  HOSTED_INFERENCE_INSTANCE_ID,
  HOSTED_INFERENCE_MESSAGE_TYPE,
  HOSTED_INFERENCE_MODEL,
  applyManagedInferenceMessage,
  hostedInferenceConfigured,
  hostedInferenceEngineEnabled,
  hostedInferenceSelection,
  hostedInferenceStatus,
  resetManagedInferenceAccess,
  setManagedInferenceAccess,
  withHostedInferenceEngine,
} from "./hosted-inference.ts";

const TOKEN = "a".repeat(64);

afterEach(() => {
  resetManagedInferenceAccess();
  delete process.env.OMB_INFERENCE_BROKER_URL;
  delete process.env.OMB_INFERENCE_BROKER_TOKEN;
});

describe("hostedInferenceConfigured", () => {
  it("is false until both the broker URL and install token are present", () => {
    expect(hostedInferenceConfigured()).toBe(false);
    process.env.OMB_INFERENCE_BROKER_URL = "https://inference.example";
    expect(hostedInferenceConfigured()).toBe(false);
    process.env.OMB_INFERENCE_BROKER_TOKEN = TOKEN;
    expect(hostedInferenceConfigured()).toBe(true);
  });

  it("rejects an insecure remote URL and a malformed token", () => {
    process.env.OMB_INFERENCE_BROKER_URL = "http://inference.example";
    process.env.OMB_INFERENCE_BROKER_TOKEN = TOKEN;
    expect(hostedInferenceConfigured()).toBe(false);
    process.env.OMB_INFERENCE_BROKER_URL = "https://inference.example";
    process.env.OMB_INFERENCE_BROKER_TOKEN = "short";
    expect(hostedInferenceConfigured()).toBe(false);
  });
});

describe("parent-port credential sync", () => {
  it("accepts a complete credential and ignores a message without access", () => {
    expect(applyManagedInferenceMessage({ type: HOSTED_INFERENCE_MESSAGE_TYPE })).toBe(false);
    expect(
      applyManagedInferenceMessage({
        type: HOSTED_INFERENCE_MESSAGE_TYPE,
        access: { url: "https://inference.example/", token: TOKEN },
      }),
    ).toBe(true);
    expect(hostedInferenceConfigured()).toBe(true);
    expect(process.env.OMB_INFERENCE_BROKER_URL).toBe("https://inference.example");
    expect(process.env.OMB_INFERENCE_BROKER_TOKEN).toBe(TOKEN);

    expect(applyManagedInferenceMessage({ type: HOSTED_INFERENCE_MESSAGE_TYPE, access: null })).toBe(true);
    expect(hostedInferenceConfigured()).toBe(false);
  });

  it("refuses insecure or credential-bearing URLs", () => {
    expect(() => setManagedInferenceAccess({ url: "http://inference.example", token: TOKEN })).toThrow(/HTTPS/);
    for (const url of [
      "https://user:secret@inference.example/root",
      "https://inference.example/root?redirect=evil",
      "https://inference.example/root#fragment",
    ]) {
      expect(() => setManagedInferenceAccess({ url, token: TOKEN })).toThrow(/must not include/);
    }
  });
});

describe("withHostedInferenceEngine", () => {
  function withAccess() {
    process.env.OMB_INFERENCE_BROKER_URL = "https://inference.example/broker/";
    process.env.OMB_INFERENCE_BROKER_TOKEN = TOKEN;
  }

  it("adds a distinct hosted instance on top of the default fleet", () => {
    withAccess();
    const fleet = withHostedInferenceEngine({});
    expect(fleet[HOSTED_INFERENCE_INSTANCE_ID]).toEqual({
      driver: HOSTED_INFERENCE_DRIVER,
      displayName: "Hosted",
      config: { url: "https://inference.example/broker/v1", apiKeyEnv: HOSTED_INFERENCE_API_KEY_ENV },
    });
    expect(fleet.openaiCompat).toEqual({ driver: "openai-compat" });
    expect(fleet.claude?.driver).toBe("claudeAgent");
  });

  it("keeps every engine the fleet already had", () => {
    withAccess();
    const before = Object.keys(withHostedInferenceEngine({})).filter((id) => id !== HOSTED_INFERENCE_INSTANCE_ID);
    expect(before).toContain("claude");
    expect(before).toContain("openaiCompat");
    expect(before.length).toBeGreaterThan(5);
  });

  it("is idempotent — enabling twice is enabling once", () => {
    withAccess();
    const once = withHostedInferenceEngine({});
    expect(withHostedInferenceEngine({ instances: once })).toEqual(once);
  });

  it("never carries the install token into the map it persists", () => {
    withAccess();
    const cfg: AppConfig = { xai: { key: "xai-secret" }, box: { token: "box-secret" } };
    const serialised = JSON.stringify(withHostedInferenceEngine(cfg));
    expect(serialised).not.toContain(TOKEN);
    expect(serialised).not.toContain("xai-secret");
    expect(serialised).not.toContain("box-secret");
  });

  it("refuses to write an engine that cannot answer", () => {
    expect(() => withHostedInferenceEngine({})).toThrow(/not registered/);
  });
});

describe("hostedInferenceEngineEnabled", () => {
  it("is false on a fleet that never had it", () => {
    expect(hostedInferenceEngineEnabled({})).toBe(false);
  });

  it("is true once the entry is in the configured fleet", () => {
    process.env.OMB_INFERENCE_BROKER_URL = "https://inference.example";
    process.env.OMB_INFERENCE_BROKER_TOKEN = TOKEN;
    expect(hostedInferenceEngineEnabled({ instances: withHostedInferenceEngine({}) })).toBe(true);
  });
});

describe("hostedInferenceStatus", () => {
  it("reports a URL without a token as available but not registered", () => {
    process.env.OMB_INFERENCE_BROKER_URL = "https://inference.example";
    expect(hostedInferenceStatus({})).toEqual({ available: true, registered: false, enabled: false });
  });
});

describe("hostedInferenceSelection", () => {
  it("pins empty bots to the hosted catalog id, not a client-chosen SKU", () => {
    expect(hostedInferenceSelection()).toEqual({
      instanceId: HOSTED_INFERENCE_INSTANCE_ID,
      model: HOSTED_INFERENCE_MODEL,
    });
  });
});
