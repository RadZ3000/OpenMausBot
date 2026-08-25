// Turn on the engine Path C bills to us.
//
// The desktop is untrusted for billing and must never hold our provider key.
// This module only enables a distinct openai-compat instance that talks to
// *our* Worker, with the per-install bearer already in process env (Electron
// registration → credentials.bin → child env / parent-port sync). The Worker
// is the router: capability first, credits as a ceiling.
//
// Distinct from the default `openaiCompat` instance, which a later OpenRouter
// BYOK row would otherwise share a URL with. See
// docs/plans/2026-08-25-001-path-c-hosted-trial-plan.md.
import { z } from "zod";

import type { AppConfig } from "./config.ts";
import { injectedEnvironment, instanceConfigs } from "./config.ts";
import type { InstanceConfigMap, ModelSelection } from "./contracts.ts";

export const HOSTED_INFERENCE_INSTANCE_ID = "hostedInference";
export const HOSTED_INFERENCE_DRIVER = "openai-compat";
export const HOSTED_INFERENCE_MODEL = "openmausbot/auto";
export const HOSTED_INFERENCE_API_KEY_ENV = "OMB_INFERENCE_BROKER_TOKEN";
export const HOSTED_INFERENCE_MESSAGE_TYPE = "openmausbot:managed-inference";

const TOKEN = /^[0-9a-f]{64}$/;

let managedAccess: { url: string; token: string } | null | undefined;

const managedMessageSchema = z.record(z.string(), z.unknown());

export function normalizeInferenceBrokerUrl(value: string): string {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash) {
    throw new Error("The hosted-inference URL must not include credentials, a query, or a fragment");
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) {
    throw new Error("The hosted-inference service must use HTTPS");
  }
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
}

export function inferenceAccess(): { url: string; token: string } | null {
  if (managedAccess !== undefined) return managedAccess;
  const url = process.env.OMB_INFERENCE_BROKER_URL?.trim();
  const token = process.env.OMB_INFERENCE_BROKER_TOKEN?.trim();
  if (!url || !token) return null;
  if (!TOKEN.test(token)) throw new Error("The hosted-inference token is invalid");
  return { url: normalizeInferenceBrokerUrl(url), token };
}

export function hostedInferenceConfigured(): boolean {
  try {
    return inferenceAccess() !== null;
  } catch {
    return false;
  }
}

export function hostedInferenceEngineEnabled(cfg: AppConfig): boolean {
  return cfg.instances?.[HOSTED_INFERENCE_INSTANCE_ID]?.driver === HOSTED_INFERENCE_DRIVER;
}

export function hostedInferenceStatus(cfg: AppConfig): {
  available: boolean;
  registered: boolean;
  enabled: boolean;
} {
  const url = process.env.OMB_INFERENCE_BROKER_URL?.trim() || (managedAccess === undefined ? "" : (managedAccess?.url ?? ""));
  return {
    available: Boolean(url),
    registered: hostedInferenceConfigured(),
    enabled: hostedInferenceEngineEnabled(cfg),
  };
}

export function hostedInferenceSelection(): ModelSelection {
  return { instanceId: HOSTED_INFERENCE_INSTANCE_ID, model: HOSTED_INFERENCE_MODEL };
}

export function applyManagedInferenceMessage(message: unknown): boolean {
  const parsed = managedMessageSchema.safeParse(message);
  if (
    !parsed.success ||
    parsed.data.type !== HOSTED_INFERENCE_MESSAGE_TYPE ||
    !Object.hasOwn(parsed.data, "access")
  ) {
    return false;
  }
  setManagedInferenceAccess(parsed.data.access);
  return true;
}

export function setManagedInferenceAccess(access: unknown): void {
  if (access === null) {
    managedAccess = null;
    delete process.env.OMB_INFERENCE_BROKER_URL;
    delete process.env.OMB_INFERENCE_BROKER_TOKEN;
    return;
  }
  const parsed = z.object({ url: z.string().url(), token: z.string().regex(TOKEN) }).strict().parse(access);
  const url = normalizeInferenceBrokerUrl(parsed.url);
  managedAccess = { url, token: parsed.token };
  process.env.OMB_INFERENCE_BROKER_URL = url;
  process.env.OMB_INFERENCE_BROKER_TOKEN = parsed.token;
}

/** Tests: forget a parent-port override so the next case reads process.env. */
export function resetManagedInferenceAccess(): void {
  managedAccess = undefined;
}

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

/** The whole fleet, plus the hosted engine, safe to persist.
 *
 * Same whole-fleet rule as `withApiKeyEngine`: a partial instances write
 * deletes every other engine. The bearer stays in process env — writing it
 * onto the entry would put our install token in plaintext config.json. */
export function withHostedInferenceEngine(cfg: AppConfig): InstanceConfigMap {
  const access = inferenceAccess();
  if (!access) throw new Error("hosted inference is not registered on this install");
  const next = structuredClone(cfg);
  const map = persistable(next, instanceConfigs(next));
  map[HOSTED_INFERENCE_INSTANCE_ID] = {
    ...map[HOSTED_INFERENCE_INSTANCE_ID],
    driver: HOSTED_INFERENCE_DRIVER,
    displayName: "Hosted",
    config: {
      url: `${access.url}/v1`,
      apiKeyEnv: HOSTED_INFERENCE_API_KEY_ENV,
    },
  };
  return map;
}
