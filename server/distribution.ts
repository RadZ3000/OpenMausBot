// What a distribution may change about the engine a new bot starts on.
//
// Set by the build rather than the user: electron/distribution.mjs reads the
// values baked into a packaged app and forwards them here as environment. A
// build that ships its own local stack wants that stack chosen rather than
// whichever cloud CLI the machine happens to have lying around.
//
// Both are preferences, never requirements. Neither can produce a bot that
// cannot answer, which is the invariant defaultSelection() exists to protect:
// an engine that is not installed still loses to one that is, and a model the
// chosen engine does not offer is ignored. A typo therefore costs nothing.
import type { ModelCatalog } from "./contracts.ts";
import { RECOMMENDED_MODEL } from "./local-model.ts";

/** Name shown to the user and to models. Packaged builds get this from
 * extraMetadata via OMB_PRODUCT_NAME; unpackaged `pnpm dev:server` matches
 * brand/profile.ts so the two stamps cannot drift in development. */
export const PRODUCT_NAME = process.env.OMB_PRODUCT_NAME?.trim() || "FlowDesk";

/** HTTP User-Agent for outbound fetches this process makes. While the brand
 * slot is unset the historical value stays; check:brand lists it. */
export const HTTP_USER_AGENT = process.env.OMB_HTTP_USER_AGENT?.trim() || "OpenMausBot-skills";

/** driverKind a new bot prefers, e.g. "hermesAgent". */
export const PREFERRED_ENGINE = process.env.OMB_DEFAULT_ENGINE?.trim() || "claudeAgent";

/** Model id a new bot prefers. Unpackaged `pnpm dev:server` falls back to
 * first-run Thinking 8B so a new bot picks it once Hermes lists it. A missing
 * catalog id is still ignored — see startingModel. */
export const PREFERRED_MODEL = process.env.OMB_DEFAULT_MODEL?.trim() || `ollama::${RECOMMENDED_MODEL}`;

/** The model a new bot starts on for a given engine.
 *
 * The preference is honoured only if this engine actually lists it. Local
 * catalogs are discovered at runtime — a model the user has not pulled yet is
 * simply absent — so a configured id that is missing means "not here", not
 * "not valid", and the engine's own default is the right answer either way. */
export function startingModel(models: ModelCatalog, preferred: string = PREFERRED_MODEL): string {
  if (preferred && models.options.some((option) => option.id === preferred)) return preferred;
  return models.default ?? "";
}
