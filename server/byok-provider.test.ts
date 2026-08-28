import { describe, expect, it } from "vitest";

import {
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDERS,
  byokConfigPatch,
  byokCredentialName,
  byokWorkspacePatch,
  detectByokProvider,
  isByokProviderId,
} from "../shared/byok-provider.ts";

describe("isByokProviderId", () => {
  it("accepts only the declared ids", () => {
    expect(BYOK_PROVIDER_IDS.every(isByokProviderId)).toBe(true);
    expect(isByokProviderId("deepseek")).toBe(false);
    expect(isByokProviderId("xaiApiKey")).toBe(false);
  });
});

describe("byokConfigPatch", () => {
  it("saves an xAI key on the xAI slot", () => {
    expect(byokConfigPatch("xai", "xai-secret")).toEqual({ xai: { key: "xai-secret" } });
    expect(byokCredentialName("xai")).toBe("xaiApiKey");
    expect(byokWorkspacePatch("xai")).toEqual({});
  });

  it("saves every other major key on the OpenAI-compatible slot with that provider's URL", () => {
    expect(byokConfigPatch("openai", "sk-secret")).toEqual({
      openaiCompat: { key: "sk-secret", url: "https://api.openai.com/v1" },
    });
    expect(byokCredentialName("anthropic")).toBe("openaiCompatApiKey");
    expect(byokWorkspacePatch("google")).toEqual({
      openaiCompat: { url: BYOK_PROVIDERS.google.url },
    });
  });
});

describe("detectByokProvider", () => {
  it("does not treat an Anthropic or OpenRouter key as OpenAI", () => {
    expect(detectByokProvider("sk-ant-api03-xyz")).toBe("anthropic");
    expect(detectByokProvider("sk-or-v1-xyz")).toBe("openrouter");
    expect(detectByokProvider("sk-xyz")).toBe("openai");
  });
});
