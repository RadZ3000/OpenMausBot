/** Path B: one pasted key, billed to the customer's provider.
 *
 * Prefixes pick the engine. xAI rides the dedicated Grok HTTP driver; the
 * others reuse the existing OpenAI-compatible HTTP driver with that
 * provider's base URL. Claude and Codex CLIs are not in this path — they
 * keep subscription login, and a pasted Anthropic/OpenAI key must never
 * become `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` in a child env. */

export const BYOK_PROVIDER_IDS = [
  "openai",
  "anthropic",
  "google",
  "xai",
  "openrouter",
  "groq",
] as const;

export type ByokProviderId = (typeof BYOK_PROVIDER_IDS)[number];

type ByokProviderBase = {
  label: string;
  helpUrl: string;
  helpLabel: string;
  placeholder: string;
  defaultModel: string;
};

export type ByokProvider =
  | (ByokProviderBase & { instanceId: "grokApi" })
  | (ByokProviderBase & { instanceId: "openaiCompat"; url: string });

export const BYOK_PROVIDERS = {
  openai: {
    label: "OpenAI",
    helpUrl: "https://platform.openai.com/api-keys",
    helpLabel: "Get a key from platform.openai.com",
    placeholder: "sk-…",
    instanceId: "openaiCompat",
    defaultModel: "gpt-4o",
    url: "https://api.openai.com/v1",
  },
  anthropic: {
    label: "Anthropic",
    helpUrl: "https://console.anthropic.com/settings/keys",
    helpLabel: "Get a key from console.anthropic.com",
    placeholder: "sk-ant-…",
    instanceId: "openaiCompat",
    defaultModel: "claude-sonnet-4-5",
    url: "https://api.anthropic.com/v1",
  },
  google: {
    label: "Google",
    helpUrl: "https://aistudio.google.com/apikey",
    helpLabel: "Get a key from Google AI Studio",
    placeholder: "AIza…",
    instanceId: "openaiCompat",
    defaultModel: "gemini-2.5-flash",
    url: "https://generativelanguage.googleapis.com/v1beta/openai",
  },
  xai: {
    label: "xAI",
    helpUrl: "https://console.x.ai",
    helpLabel: "Get a key from console.x.ai",
    placeholder: "xai-…",
    instanceId: "grokApi",
    defaultModel: "grok-4",
  },
  openrouter: {
    label: "OpenRouter",
    helpUrl: "https://openrouter.ai/keys",
    helpLabel: "Get a key from openrouter.ai",
    placeholder: "sk-or-…",
    instanceId: "openaiCompat",
    defaultModel: "openai/gpt-4o",
    url: "https://openrouter.ai/api/v1",
  },
  groq: {
    label: "Groq",
    helpUrl: "https://console.groq.com/keys",
    helpLabel: "Get a key from console.groq.com",
    placeholder: "gsk_…",
    instanceId: "openaiCompat",
    defaultModel: "llama-3.3-70b-versatile",
    url: "https://api.groq.com/openai/v1",
  },
} as const satisfies Record<ByokProviderId, ByokProvider>;

export function isByokProviderId(value: string): value is ByokProviderId {
  return BYOK_PROVIDER_IDS.some((id) => id === value);
}

/** Longest prefixes first so `sk-ant-` / `sk-or-` are not classified as OpenAI. */
export function detectByokProvider(key: string): ByokProviderId | null {
  const secret = key.trim();
  if (!secret) return null;
  if (secret.startsWith("xai-")) return "xai";
  if (secret.startsWith("sk-ant-")) return "anthropic";
  if (secret.startsWith("sk-or-")) return "openrouter";
  if (secret.startsWith("gsk_")) return "groq";
  if (secret.startsWith("AIza")) return "google";
  if (secret.startsWith("sk-")) return "openai";
  return null;
}

export function byokCredentialName(provider: ByokProviderId): "xaiApiKey" | "openaiCompatApiKey" {
  return BYOK_PROVIDERS[provider].instanceId === "grokApi" ? "xaiApiKey" : "openaiCompatApiKey";
}

export function byokConfigPatch(provider: ByokProviderId, key: string) {
  const spec = BYOK_PROVIDERS[provider];
  if (spec.instanceId === "grokApi") return { xai: { key } };
  return { openaiCompat: { key, url: spec.url } };
}

export function byokWorkspacePatch(provider: ByokProviderId) {
  const spec = BYOK_PROVIDERS[provider];
  if (spec.instanceId === "grokApi") return {};
  return { openaiCompat: { url: spec.url } };
}
