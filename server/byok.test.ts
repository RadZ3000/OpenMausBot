import { describe, expect, it } from "vitest";

import { API_KEY_DRIVER, API_KEY_INSTANCE_ID, apiKeyConfigured, apiKeyEngineEnabled, withApiKeyEngine } from "./byok.ts";
import type { AppConfig } from "./config.ts";

describe("apiKeyConfigured", () => {
  it("is false before anyone pastes a key", () => {
    expect(apiKeyConfigured({})).toBe(false);
    expect(apiKeyConfigured({ xai: {} })).toBe(false);
  });

  // An empty string is what a cleared field and a tombstoned Electron
  // credential both look like on the way through.
  it("treats a blank key as no key", () => {
    expect(apiKeyConfigured({ xai: { key: "" } })).toBe(false);
    expect(apiKeyConfigured({ xai: { key: "   " } })).toBe(false);
  });

  it("is true once a key is there", () => {
    expect(apiKeyConfigured({ xai: { key: "xai-abc" } })).toBe(true);
  });
});

describe("withApiKeyEngine", () => {
  it("adds the API engine on top of the default fleet", () => {
    const fleet = withApiKeyEngine({});
    expect(fleet[API_KEY_INSTANCE_ID]).toEqual({ driver: API_KEY_DRIVER });
  });

  // The whole point: instanceConfigs treats any configured map as the complete
  // fleet, so a partial write deletes engines rather than adding one.
  it("keeps every engine the fleet already had", () => {
    const before = Object.keys(withApiKeyEngine({})).filter((id) => id !== API_KEY_INSTANCE_ID);
    expect(before).toContain("claude");
    expect(before).toContain("codex");
    expect(before.length).toBeGreaterThan(5);
  });

  it("leaves the CLI-backed grok instance alone", () => {
    const fleet = withApiKeyEngine({});
    expect(fleet.grok).toEqual({ driver: "grokAgent" });
    expect(fleet[API_KEY_INSTANCE_ID]).toEqual({ driver: API_KEY_DRIVER });
  });

  it("preserves an explicitly configured fleet instead of reimposing defaults", () => {
    const cfg: AppConfig = { instances: { claude: { driver: "claudeAgent" }, grok: { driver: "grokAgent" } } };
    const fleet = withApiKeyEngine(cfg);
    expect(fleet.claude).toEqual({ driver: "claudeAgent" });
    expect(fleet[API_KEY_INSTANCE_ID]).toEqual({ driver: API_KEY_DRIVER });
  });

  it("is idempotent — enabling twice is enabling once", () => {
    const once = withApiKeyEngine({});
    expect(withApiKeyEngine({ instances: once })).toEqual(once);
  });

  // instanceConfigs() merges each driver's credentials into its entry for the
  // LIVE fleet. This map gets written to config.json, so anything left behind
  // is a secret in plaintext on disk — the trap withInstanceCli documents.
  it("never carries a credential into the map it persists", () => {
    const cfg: AppConfig = { xai: { key: "xai-secret" }, box: { token: "box-secret" } };
    const serialised = JSON.stringify(withApiKeyEngine(cfg));
    expect(serialised).not.toContain("xai-secret");
    expect(serialised).not.toContain("box-secret");
  });

  it("leaves an environment entry a user set by hand alone", () => {
    const cfg: AppConfig = {
      xai: { key: "xai-secret" },
      instances: { grokApi: { driver: "grok", environment: { HTTPS_PROXY: "http://proxy.test" } } },
    };
    expect(withApiKeyEngine(cfg).grokApi.environment).toEqual({ HTTPS_PROXY: "http://proxy.test" });
  });
});

describe("apiKeyEngineEnabled", () => {
  it("is false on a fleet that never had it", () => {
    expect(apiKeyEngineEnabled({})).toBe(false);
  });

  it("is true once the entry is in the configured fleet", () => {
    expect(apiKeyEngineEnabled({ instances: withApiKeyEngine({}) })).toBe(true);
  });
});
