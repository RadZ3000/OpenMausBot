// What is allowed to differ between one build of this app and another.
//
// This fork is sold, so it has to be able to ship under a different name and to
// a different analytics destination without anybody editing code. The failure
// mode being guarded against is specific and has already happened twice here: a
// value hardcoded upstream stays quietly pointed at whoever we forked from, and
// nothing in a normal review catches it because it is correct for them. Naming
// the whole set in one file means the answer to "what does this build phone
// home to" is one file, not a search.
//
// Every field has a default that is safe to ship exactly as it stands, so a
// build with no configuration at all behaves the way it does today. Vite inlines
// the VITE_* values at build time; there is nothing to read at runtime and
// nothing a user can change.
//
// Two knobs deliberately live elsewhere, because they are not read in the
// window:
//   - OMB_DEFAULT_ENGINE — the engine a new bot prefers, read by
//     defaultSelection() in server/index.ts.
//   - productName as the OS sees it (installer, dock, Start menu) — that is
//     electron-builder.yml, applied at packaging time rather than to a
//     running window.
//
// Anything that identifies the app to *itself* is out of scope and must not be
// added here: data directories, localStorage keys, OMB_* variable names, the
// appId, the openmausbot:// scheme, the _openmausbot._tcp service, and the MCP
// server names are compatibility surfaces. Renaming one does not rebrand the
// product, it strands existing installs.

/** The parts of a build that a distribution may set. */
export interface Distribution {
  /** Name shown to the user inside the window. */
  productName: string;
  /** PostHog project key. Empty — the default — disables analytics outright. */
  analyticsKey: string;
  /** PostHog ingestion host. */
  analyticsHost: string;
}

/** Build-time overrides. Vite inlines these as string literals or not at all. */
export interface DistributionEnv {
  VITE_PRODUCT_NAME?: string;
  VITE_ANALYTICS_KEY?: string;
  VITE_ANALYTICS_HOST?: string;
}

const DEFAULTS: Distribution = {
  productName: "OpenMausBot",
  analyticsKey: "",
  analyticsHost: "https://us.i.posthog.com",
};

// An unset VITE_* variable arrives as undefined, but one set to "" in a CI
// environment file arrives as an empty string, and a hand-edited one arrives
// with a trailing newline. All three mean "not configured".
function text(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? "").trim();
  return trimmed || fallback;
}

export function resolveDistribution(env: DistributionEnv): Distribution {
  return {
    productName: text(env.VITE_PRODUCT_NAME, DEFAULTS.productName),
    analyticsKey: text(env.VITE_ANALYTICS_KEY, DEFAULTS.analyticsKey),
    analyticsHost: text(env.VITE_ANALYTICS_HOST, DEFAULTS.analyticsHost),
  };
}

/** This build's distribution.
 *
 * Each variable is named as a literal member expression rather than handing the
 * whole `import.meta.env` over, because that literal form is what Vite swaps for
 * a string at build time. Passing the bag would compile, and then read undefined
 * in a production build. */
export const distribution = resolveDistribution({
  VITE_PRODUCT_NAME: import.meta.env.VITE_PRODUCT_NAME,
  VITE_ANALYTICS_KEY: import.meta.env.VITE_ANALYTICS_KEY,
  VITE_ANALYTICS_HOST: import.meta.env.VITE_ANALYTICS_HOST,
});
