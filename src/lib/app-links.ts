import { distribution, docsUrl } from "./distribution";

// Outward links the app offers from the profile menu and the About dialog.
// Docs, GitHub, and releases stay unset until Phase D plugs real URLs.
// Never default at the project this fork came from.
export const APP_NAME = distribution.productName;
export const APP_REPOSITORY: string | null = null;
export const DOCS_URL: string | null = distribution.docsBaseUrl.trim() || null;
export const HELP_CENTER_URL = DOCS_URL;
export const APPROVAL_LEVELS_URL = docsUrl("docs/approval-levels.md");
export const FEEDBACK_URL = "https://discord.gg/9Wb8MEpXRs";
export const RELEASES_URL: string | null = null;
export const LICENSE_URL: string | null = null;

/** The version Vite inlined from package.json; "dev" when the define is
 * missing (a bare `tsc`/test run outside the bundler). */
export function appVersion(): string {
  return typeof __APP_VERSION__ === "string" ? __APP_VERSION__ : "dev";
}

const PLATFORM_NAMES: Record<string, string> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
};

/** "macOS", "Windows", "Linux" — or nothing at all in the browser, where the
 * host OS is not ours to claim. */
export function platformLabel(platform?: string): string | null {
  return (platform && PLATFORM_NAMES[platform]) ?? null;
}

/** Hands a link to the default browser through the preload bridge, falling
 * back to a new tab when the app runs in a plain browser. */
export async function openExternalLink(url: string): Promise<void> {
  if (window.ogb?.openExternal) {
    await window.ogb.openExternal(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
