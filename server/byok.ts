// Turn on the engine a pasted API key pays for.
//
// The wedge is a working bot without sysadmin work, and this is the shortest
// route to one: `server/drivers/grok.ts` is an HTTP driver that streams from
// api.x.ai directly, so it needs no CLI, no terminal and no OAuth. Everything it
// needs already exists — `xai.key` is in the config schema, syncCredentialEnv
// maps it to XAI_API_KEY, injectedEnvironment hands that to the `grok` driver
// and to no other child process, and Electron already stores the key in the
// OS-encrypted credential file. The one missing piece is an instance running the
// driver, which is what this file adds.
//
// Upstream leaves it out deliberately (server/config.ts, on the default fleet):
// "that key is a credential Milind doesn't want to manage; an `instances` entry
// brings it back anytime." Managing that credential is precisely what this fork
// sells, so the entry is ours to add.
//
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md.
import type { AppConfig } from "./config.ts";
import { injectedEnvironment, instanceConfigs } from "./config.ts";
import type { InstanceConfigMap } from "./contracts.ts";

/** Distinct from the default `grok` instance, which rides `grokAgent` — the
 * CLI-and-subscription engine. Both can be present; they bill differently and
 * the picker labels this one "Grok (API)". */
export const API_KEY_INSTANCE_ID = "grokApi";
export const API_KEY_DRIVER = "grok";

/** Whether a key has been saved. The driver reads it from the instance
 * environment at create time, so enabling the engine without one produces an
 * instance that exists and cannot answer — the failure mode `defaultSelection()`
 * refuses to create, and we should not create it by another door. */
export function apiKeyConfigured(cfg: AppConfig): boolean {
  return (cfg.xai?.key ?? "").trim().length > 0;
}

export function apiKeyEngineEnabled(cfg: AppConfig): boolean {
  return instanceConfigs(cfg)[API_KEY_INSTANCE_ID]?.driver === API_KEY_DRIVER;
}

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

/** The whole fleet, plus the API-key engine, safe to persist.
 *
 * It has to be the *whole* fleet. `saveConfig` merges instances per id, but
 * `instanceConfigs` treats any configured map as the complete fleet — so
 * persisting `{ grokApi }` on its own does not add an engine, it deletes every
 * other one. Starting from `instanceConfigs(cfg)` resolves the default fleet
 * first, which also keeps the map carrying `grok`/`claude`/`codex` so upstream's
 * PRODUCT_FLEET_ADDITIONS still merges newly shipped engines later. */
export function withApiKeyEngine(cfg: AppConfig): InstanceConfigMap {
  // clone the config, not the result: instanceConfigs() assigns `environment`
  // onto the entry objects it was handed, and when a fleet is configured those
  // are the live cfg.instances objects — so calling it on cfg would write the
  // injected credentials straight into the running config. withInstanceCli
  // clones first for the same reason.
  const next = structuredClone(cfg);
  const map = persistable(next, instanceConfigs(next));
  // spread, not replace: enabling twice, or enabling an entry someone already
  // gave a proxy or a cli override, must not throw that away
  map[API_KEY_INSTANCE_ID] = { ...map[API_KEY_INSTANCE_ID], driver: API_KEY_DRIVER };
  return map;
}
