import { describe, expect, it } from "vitest";

import { UNSET, brandProfile, isUnset } from "./profile";

const SLOTS = [
  "productName",
  "companyName",
  "companionName",
  "defaultSkin",
  "appId",
  "dataDirectoryName",
  "protocolDisplayName",
  "protocolScheme",
  "executableName",
  "speechHelperName",
  "recorderHelperName",
  "httpUserAgent",
  "homepage",
  "authorName",
  "authorEmail",
  "docsBaseUrl",
  "publish",
  "composioBrokerUrl",
  "teamLibrary",
  "showUpdateDownload",
  "iconsDir",
  "mascotDir",
] as const;

describe("brand profile", () => {
  it("names every slot the pack owns", () => {
    expect(Object.keys(brandProfile).sort()).toEqual([...SLOTS].sort());
  });

  it("keeps unset distinct from the upstream product name", () => {
    expect(UNSET).toBe("unset");
    expect(UNSET).not.toBe("OpenMausBot");
    expect(isUnset(UNSET)).toBe(true);
    expect(isUnset("FlowDesk")).toBe(false);
    expect(isUnset("OpenMausBot")).toBe(false);
  });

  it("ships working names and leaves lock-once identity unset", () => {
    expect(brandProfile.productName).toBe("FlowDesk");
    expect(brandProfile.companyName).toBe("Flow Enterprises");
    expect(brandProfile.defaultSkin).toBe("foundry");
    expect(brandProfile.appId).toBe(UNSET);
    expect(brandProfile.dataDirectoryName).toBe(UNSET);
    expect(brandProfile.publish).toBeNull();
    expect(brandProfile.teamLibrary).toBe("off");
    expect(brandProfile.showUpdateDownload).toBe(false);
    expect(brandProfile.composioBrokerUrl).toBe(UNSET);
  });
});
