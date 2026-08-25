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
// Product name, default skin, and the named hides come from brand/profile.ts.
// Vite inlines the VITE_* values at build time; there is nothing to read at
// runtime and nothing a user can change. An unset VITE_* keeps the pack.
//
// Two knobs deliberately live elsewhere, because they are not read in the
// window:
//   - OMB_DEFAULT_ENGINE — the engine a new bot prefers, read by
//     defaultSelection() in server/index.ts.
//   - productName as the OS sees it (installer, dock, Start menu) — that is
//     brand/electron-builder.yml, applied at packaging time rather than to a
//     running window.
//
// Anything that identifies the app to *itself* is out of scope and must not be
// added here: data directories, localStorage keys, OMB_* variable names, the
// appId, the openmausbot:// scheme, the _openmausbot._tcp service, and the MCP
// server names are compatibility surfaces. Renaming one does not rebrand the
// product, it strands existing installs.
import { brandProfile, isUnset } from "../../brand/profile";
import { INSTALL_PATHS, type InstallPath, parseInstallPaths } from "./install-path";
import { SKIN_IDS, type SkinId } from "./skins";

/** The parts of a build that a distribution may set. */
export interface Distribution {
  /** Name shown to the user inside the window. */
  productName: string;
  /** Phone companion name. Falls back to productName while that slot is unset. */
  companionName: string;
  /** Skin applied when the user has not picked one. */
  defaultSkin: SkinId;
  /** PostHog project key. Empty — the default — disables analytics outright. */
  analyticsKey: string;
  /** PostHog ingestion host. */
  analyticsHost: string;
  /** First-run paths this build offers, in the order shown. A build sold to a
   * customer who only ever wants their own key ships just that one. */
  installPaths: InstallPath[];
  /** Community team catalog. `"off"` hides the Teams menu and skips the fetch. */
  teamLibrary: "off" | string;
  /** When false, the update banner does not offer Download. */
  showUpdateDownload: boolean;
  /** Public docs origin, or empty while the slot is unset. */
  docsBaseUrl: string;
}

/** Build-time overrides. Vite inlines these as string literals or not at all. */
export interface DistributionEnv {
  VITE_PRODUCT_NAME?: string;
  VITE_ANALYTICS_KEY?: string;
  VITE_ANALYTICS_HOST?: string;
  VITE_INSTALL_PATHS?: string;
}

function skinId(value: string, fallback: SkinId): SkinId {
  for (const id of SKIN_IDS) {
    if (id === value) return id;
  }
  return fallback;
}

const DEFAULTS: Distribution = {
  productName: brandProfile.productName,
  companionName: isUnset(brandProfile.companionName)
    ? brandProfile.productName
    : brandProfile.companionName,
  defaultSkin: skinId(brandProfile.defaultSkin, "midnight"),
  analyticsKey: "",
  analyticsHost: "https://us.i.posthog.com",
  installPaths: [...INSTALL_PATHS],
  teamLibrary: brandProfile.teamLibrary === "off" ? "off" : brandProfile.teamLibrary,
  showUpdateDownload: brandProfile.showUpdateDownload,
  docsBaseUrl: isUnset(brandProfile.docsBaseUrl) ? "" : brandProfile.docsBaseUrl,
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
    companionName: DEFAULTS.companionName,
    defaultSkin: DEFAULTS.defaultSkin,
    analyticsKey: text(env.VITE_ANALYTICS_KEY, DEFAULTS.analyticsKey),
    analyticsHost: text(env.VITE_ANALYTICS_HOST, DEFAULTS.analyticsHost),
    installPaths: parseInstallPaths(env.VITE_INSTALL_PATHS),
    teamLibrary: DEFAULTS.teamLibrary,
    showUpdateDownload: DEFAULTS.showUpdateDownload,
    docsBaseUrl: DEFAULTS.docsBaseUrl,
  };
}

/** Join a docs path onto this build's docs origin, or null while unset. */
export function docsUrl(relativePath: string, origin: string = DEFAULTS.docsBaseUrl): string | null {
  const base = origin.trim();
  if (!base) return null;
  return `${base.replace(/\/$/, "")}/${relativePath.replace(/^\//, "")}`;
}

export function teamLibraryEnabled(distribution: Distribution): boolean {
  return distribution.teamLibrary !== "off";
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
  VITE_INSTALL_PATHS: import.meta.env.VITE_INSTALL_PATHS,
});
