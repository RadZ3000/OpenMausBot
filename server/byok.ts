// Turn on the engine a pasted API key pays for.
//
// The wedge is a working bot without sysadmin work. xAI keys ride
// `server/drivers/grok.ts` (api.x.ai, no CLI). OpenAI / Anthropic / Google /
// OpenRouter / Groq keys reuse the existing OpenAI-compatible HTTP driver
// with that provider's base URL. Enabling has to write the *whole* fleet:
// `instanceConfigs` treats any configured map as complete, so a partial
// `{ grokApi }` would delete every other engine.
//
// Anthropic and OpenAI keys stay on `OPENAI_COMPAT_API_KEY`. They must never
// become `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` — those flip Claude/Codex
// off subscription login, and a leftover OpenAI key makes Hermes resolve to
// OpenRouter with no auth header.
//
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md.
import { z } from "zod";

import type { AppConfig } from "./config.ts";
import { injectedEnvironment, instanceConfigs } from "./config.ts";
import type { InstanceConfigMap, ModelSelection } from "./contracts.ts";
import {
  BYOK_PROVIDER_IDS,
  BYOK_PROVIDERS,
  type ByokProviderId,
} from "../shared/byok-provider.ts";

/** Distinct from the default `grok` instance, which rides `grokAgent` — the
 * CLI-and-subscription engine. Both can be present; they bill differently and
 * the picker labels this one "Grok (API)". */
export const API_KEY_INSTANCE_ID = "grokApi";
export const API_KEY_DRIVER = "grok";
export const OPENAI_COMPAT_INSTANCE_ID = "openaiCompat";
export const OPENAI_COMPAT_DRIVER = "openai-compat";

export const enableApiKeyBodySchema = z
  .object({
    provider: z.enum(BYOK_PROVIDER_IDS).optional(),
  })
  .strict();

function hasSecret(value: string | undefined): boolean {
  return (value ?? "").trim().length > 0;
}

/** Whether any Path B key has been saved. An engine enabled without one
 * exists and cannot answer — `defaultSelection()` refuses to create that,
 * and we should not create it by another door. */
export function apiKeyConfigured(cfg: AppConfig): boolean {
  return hasSecret(cfg.xai?.key) || hasSecret(cfg.openaiCompat?.key);
}

export function apiKeyConfiguredFor(cfg: AppConfig, provider: ByokProviderId): boolean {
  const spec = BYOK_PROVIDERS[provider];
  if (spec.instanceId === "grokApi") return hasSecret(cfg.xai?.key);
  return hasSecret(cfg.openaiCompat?.key);
}

export function resolveApiKeyProvider(cfg: AppConfig, requested: ByokProviderId | undefined): ByokProviderId | null {
  if (requested) return requested;
  if (hasSecret(cfg.xai?.key)) return "xai";
  return null;
}

export function apiKeyEngineEnabled(cfg: AppConfig): boolean {
  return instanceConfigs(cfg)[API_KEY_INSTANCE_ID]?.driver === API_KEY_DRIVER;
}

export function byokSelection(provider: ByokProviderId): ModelSelection {
  const spec = BYOK_PROVIDERS[provider];
  return { instanceId: spec.instanceId, model: spec.defaultModel };
}

export { byokWorkspacePatch } from "../shared/byok-provider.ts";

/** `instanceConfigs()` builds the map for the *live* fleet, which means it has
 * already merged each driver's credentials into its entry's `environment`.
 * Writing that to disk would copy the xAI key, the Box token and the OpenCode
 * key in plaintext into the instances section of config.json. `withInstanceCli`
 * strips them back out for exactly this reason; so does this.
 *
 * Only values that match what would be injected are removed, because an entry's
 * `environment` may also hold something a user put there by hand. */
function persistable(cfg: AppConfig, map: InstanceConfigMap): InstanceConfigMap {
  for (const entry of Object.values(map)) {
    if (!entry.environment) continue;
    const injected = injectedEnvironment(cfg, entry.driver);
    for (const [key, value] of Object.entries(entry.environment)) {
      if (injected.get(key) === value) delete entry.environment[key];
    }
    if (!Object.keys(entry.environment).length) delete entry.environment;
  }
  return map;
}

/** The whole fleet, plus the API-key engine this paste pays for, safe to persist.
 *
 * It has to be the *whole* fleet. `saveConfig` merges instances per id, but
 * `instanceConfigs` treats any configured map as the complete fleet — so
 * persisting `{ grokApi }` on its own does not add an engine, it deletes every
 * other one. Starting from `instanceConfigs(cfg)` resolves the default fleet
 * first, which also keeps the map carrying `grok`/`claude`/`codex` so upstream's
 * PRODUCT_FLEET_ADDITIONS still merges newly shipped engines later.
 *
 * Default `provider` is xAI so existing callers keep adding `grokApi`. */
export function withApiKeyEngine(cfg: AppConfig, provider: ByokProviderId = "xai"): InstanceConfigMap {
  // clone the config, not the result: instanceConfigs() assigns `environment`
  // onto the entry objects it was handed, and when a fleet is configured those
  // are the live cfg.instances objects — so calling it on cfg would write the
  // injected credentials straight into the running config. withInstanceCli
  // clones first for the same reason.
  const next = structuredClone(cfg);
  const map = persistable(next, instanceConfigs(next));
  const spec = BYOK_PROVIDERS[provider];
  // spread, not replace: enabling twice, or enabling an entry someone already
  // gave a proxy or a cli override, must not throw that away
  if (spec.instanceId === "grokApi") {
    map[API_KEY_INSTANCE_ID] = { ...map[API_KEY_INSTANCE_ID], driver: API_KEY_DRIVER };
    return map;
  }
  map[OPENAI_COMPAT_INSTANCE_ID] = {
    ...map[OPENAI_COMPAT_INSTANCE_ID],
    driver: OPENAI_COMPAT_DRIVER,
    displayName: spec.label,
    config: { url: spec.url },
  };
  return map;
}
