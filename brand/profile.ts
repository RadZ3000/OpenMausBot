// The brand pack this fork ships under. Window code reads it through
// src/lib/distribution.ts; the packager reads the sibling overlay YAML;
// the harness gets names via extraMetadata → OMB_*. Three toolchains, two
// stamps in this folder, and scripts/check-brand.mjs proves they match.
//
// `unset` is a distinct sentinel, not the string "OpenMausBot". An unset
// slot is legal on a development machine and illegal for `pnpm check:brand
// --release`. Working title (productName) may change until the first
// customer build; lock-once slots (appId, dataDirectoryName, protocolScheme)
// must be chosen together before that build, not invented to go green.

export const UNSET = "unset" as const;
export type Unset = typeof UNSET;

export function isUnset(value: string | Unset | null): value is Unset {
  return value === UNSET;
}

export type BrandPublish = null | { owner: string; repo: string };
export type BrandTeamLibrary = "off" | (string & {});

export interface BrandProfile {
  productName: string;
  companyName: string;
  companionName: string | Unset;
  defaultSkin: string;
  appId: string | Unset;
  dataDirectoryName: string | Unset;
  protocolDisplayName: string | Unset;
  protocolScheme: string | Unset;
  executableName: string | Unset;
  speechHelperName: string | Unset;
  recorderHelperName: string | Unset;
  httpUserAgent: string | Unset;
  homepage: string | Unset;
  authorName: string | Unset;
  authorEmail: string | Unset;
  docsBaseUrl: string | Unset;
  emailFromAddress: string | Unset;
  controlPlaneUrl: string | Unset;
  companionHostSuffix: string | Unset;
  publish: BrandPublish;
  composioBrokerUrl: string | Unset;
  teamLibrary: BrandTeamLibrary;
  showUpdateDownload: boolean;
  iconsDir: string;
  mascotDir: string;
}

export const brandProfile: BrandProfile = {
  productName: "FlowDesk",
  companyName: "Flow Enterprises",
  companionName: UNSET,
  defaultSkin: "foundry",
  appId: UNSET,
  dataDirectoryName: UNSET,
  protocolDisplayName: UNSET,
  protocolScheme: UNSET,
  executableName: UNSET,
  speechHelperName: UNSET,
  recorderHelperName: UNSET,
  httpUserAgent: UNSET,
  homepage: UNSET,
  authorName: UNSET,
  authorEmail: UNSET,
  docsBaseUrl: UNSET,
  emailFromAddress: UNSET,
  controlPlaneUrl: UNSET,
  companionHostSuffix: UNSET,
  publish: null,
  composioBrokerUrl: UNSET,
  teamLibrary: "off",
  showUpdateDownload: false,
  iconsDir: "brand/icons",
  mascotDir: "brand/mascot",
};
