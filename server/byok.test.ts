import { describe, expect, it } from "vitest";

import {
  API_KEY_DRIVER,
  API_KEY_INSTANCE_ID,
  OPENAI_COMPAT_DRIVER,
  OPENAI_COMPAT_INSTANCE_ID,
  apiKeyConfigured,
  apiKeyConfiguredFor,
  apiKeyEngineEnabled,
  byokSelection,
  enableApiKeyBodySchema,
  resolveApiKeyProvider,
  withApiKeyEngine,
} from "./byok.ts";
import type { AppConfig } from "./config.ts";
import { BYOK_PROVIDER_IDS, BYOK_PROVIDERS, detectByokProvider } from "../shared/byok-provider.ts";

describe("detectByokProvider", () => {
  it("classifies the major prefixes", () => {
    expect(detectByokProvider("sk-proj-abc")).toBe("openai");
    expect(detectByokProvider("sk-live-abc")).toBe("openai");
    expect(detectByokProvider("  sk-abc  ")).toBe("openai");
    expect(detectByokProvider("sk-ant-api03-abc")).toBe("anthropic");
    expect(detectByokProvider("sk-or-v1-abc")).toBe("openrouter");
    expect(detectByokProvider("gsk_abc")).toBe("groq");
    expect(detectByokProvider("AIzaSyAbc")).toBe("google");
    expect(detectByokProvider("xai-abc")).toBe("xai");
  });

  it("does not guess an unrecognized key", () => {
    expect(detectByokProvider("")).toBeNull();
    expect(detectByokProvider("   ")).toBeNull();
    expect(detectByokProvider("ak_composio")).toBeNull();
    expect(detectByokProvider("not-a-key")).toBeNull();
  });
});

describe("BYOK_PROVIDERS", () => {
  it("gives every OpenAI-compatible provider a URL and leaves xAI on grokApi", () => {
    expect(BYOK_PROVIDERS.xai.instanceId).toBe("grokApi");
    for (const id of BYOK_PROVIDER_IDS) {
      if (id === "xai") continue;
      const spec = BYOK_PROVIDERS[id];
      expect(spec.instanceId).toBe("openaiCompat");
      expect("url" in spec && spec.url.startsWith("https://")).toBe(true);
    }
  });
});

describe("apiKeyConfigured", () => {
  it("is false before anyone pastes a key", () => {
    expect(apiKeyConfigured({})).toBe(false);
    expect(apiKeyConfigured({ xai: {} })).toBe(false);
    expect(apiKeyConfigured({ openaiCompat: {} })).toBe(false);
  });

  // An empty string is what a cleared field and a tombstoned Electron
  // credential both look like on the way through.
  it("treats a blank key as no key", () => {
    expect(apiKeyConfigured({ xai: { key: "" } })).toBe(false);
    expect(apiKeyConfigured({ xai: { key: "   " } })).toBe(false);
    expect(apiKeyConfigured({ openaiCompat: { key: "" } })).toBe(false);
  });

  it("is true once a Path B key is there", () => {
    expect(apiKeyConfigured({ xai: { key: "xai-abc" } })).toBe(true);
    expect(apiKeyConfigured({ openaiCompat: { key: "sk-abc" } })).toBe(true);
  });

  it("matches the provider the paste was for", () => {
    expect(apiKeyConfiguredFor({ xai: { key: "xai-abc" } }, "xai")).toBe(true);
    expect(apiKeyConfiguredFor({ xai: { key: "xai-abc" } }, "openai")).toBe(false);
    expect(apiKeyConfiguredFor({ openaiCompat: { key: "sk-abc" } }, "openai")).toBe(true);
    expect(apiKeyConfiguredFor({ openaiCompat: { key: "sk-abc" } }, "xai")).toBe(false);
  });
});

describe("resolveApiKeyProvider", () => {
  it("keeps an explicit provider", () => {
    expect(resolveApiKeyProvider({}, "anthropic")).toBe("anthropic");
  });

  it("defaults a body-less enable to xAI when that key is saved", () => {
    expect(resolveApiKeyProvider({ xai: { key: "xai-abc" } }, undefined)).toBe("xai");
  });

  it("refuses to guess when only an OpenAI-compatible key is saved", () => {
    expect(resolveApiKeyProvider({ openaiCompat: { key: "sk-abc" } }, undefined)).toBeNull();
  });
});

describe("enableApiKeyBodySchema", () => {
  it("accepts a known provider or an empty body", () => {
    expect(enableApiKeyBodySchema.parse({})).toEqual({});
    expect(enableApiKeyBodySchema.parse({ provider: "openai" })).toEqual({ provider: "openai" });
  });

  it("rejects an unknown provider", () => {
    expect(enableApiKeyBodySchema.safeParse({ provider: "deepseek" }).success).toBe(false);
  });
});

describe("byokSelection", () => {
  it("pins empty bots to the engine this paste pays for", () => {
    expect(byokSelection("xai")).toEqual({ instanceId: API_KEY_INSTANCE_ID, model: "grok-4" });
    expect(byokSelection("openai")).toEqual({
      instanceId: OPENAI_COMPAT_INSTANCE_ID,
      model: "gpt-4o",
    });
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

  it("points the OpenAI-compatible instance at the pasted provider instead of adding grokApi", () => {
    const fleet = withApiKeyEngine({}, "openai");
    expect(fleet[API_KEY_INSTANCE_ID]).toBeUndefined();
    expect(fleet[OPENAI_COMPAT_INSTANCE_ID]).toEqual({
      driver: OPENAI_COMPAT_DRIVER,
      displayName: "OpenAI",
      config: { url: "https://api.openai.com/v1" },
    });
  });

  it("is idempotent for an OpenAI-compatible provider", () => {
    const once = withApiKeyEngine({}, "anthropic");
    expect(withApiKeyEngine({ instances: once }, "anthropic")).toEqual(once);
  });

  // instanceConfigs() merges each driver's credentials into its entry for the
  // LIVE fleet. This map gets written to config.json, so anything left behind
  // is a secret in plaintext on disk — the trap withInstanceCli documents.
  it("never carries a credential into the map it persists", () => {
    const cfg: AppConfig = {
      xai: { key: "xai-secret" },
      openaiCompat: { key: "sk-secret" },
      box: { token: "box-secret" },
    };
    const serialised = JSON.stringify(withApiKeyEngine(cfg, "openai"));
    expect(serialised).not.toContain("xai-secret");
    expect(serialised).not.toContain("sk-secret");
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
