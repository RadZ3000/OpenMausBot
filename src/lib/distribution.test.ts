import { describe, expect, it } from "vitest";

import { docsUrl, resolveDistribution, teamLibraryEnabled } from "./distribution";

describe("an unconfigured build", () => {
  it("ships the brand pack defaults", () => {
    const distribution = resolveDistribution({});
    expect(distribution.productName).toBe("FlowDesk");
    expect(distribution.companionName).toBe("FlowDesk");
    expect(distribution.defaultSkin).toBe("foundry");
    expect(distribution.analyticsHost).toBe("https://us.i.posthog.com");
    expect(distribution.teamLibrary).toBe("off");
    expect(distribution.showUpdateDownload).toBe(false);
    expect(distribution.docsBaseUrl).toBe("");
  });

  it("has no analytics destination, which is what keeps it silent", () => {
    expect(resolveDistribution({}).analyticsKey).toBe("");
  });

  it("offers every first-run path", () => {
    expect(resolveDistribution({}).installPaths).toEqual(["local", "byok", "hosted"]);
  });
});

describe("a single-path build", () => {
  it("offers only the arm it was sold with", () => {
    expect(resolveDistribution({ VITE_INSTALL_PATHS: "byok" }).installPaths).toEqual(["byok"]);
  });
});

describe("a configured build", () => {
  it("takes the name and the destination it was given", () => {
    const distribution = resolveDistribution({
      VITE_PRODUCT_NAME: "Acme Agents",
      VITE_ANALYTICS_KEY: "phc_acme",
      VITE_ANALYTICS_HOST: "https://analytics.acme.test",
    });
    expect(distribution).toEqual({
      productName: "Acme Agents",
      companionName: "FlowDesk",
      defaultSkin: "foundry",
      analyticsKey: "phc_acme",
      analyticsHost: "https://analytics.acme.test",
      installPaths: ["local", "byok", "hosted"],
      teamLibrary: "off",
      showUpdateDownload: false,
      docsBaseUrl: "",
    });
  });

  it("may rename the product without opting into analytics", () => {
    expect(resolveDistribution({ VITE_PRODUCT_NAME: "Acme Agents" }).analyticsKey).toBe("");
  });
});

describe("values that arrive malformed", () => {
  // A variable set but left empty in a CI environment file, and one edited by
  // hand into a .env, are the two ways a "configured" build turns out not to be.
  it("treats blank and whitespace as unset", () => {
    expect(resolveDistribution({ VITE_PRODUCT_NAME: "" }).productName).toBe("FlowDesk");
    expect(resolveDistribution({ VITE_PRODUCT_NAME: "   " }).productName).toBe("FlowDesk");
    expect(resolveDistribution({ VITE_ANALYTICS_HOST: "\n" }).analyticsHost).toBe("https://us.i.posthog.com");
  });

  it("trims a stray newline rather than shipping it into a title bar", () => {
    expect(resolveDistribution({ VITE_PRODUCT_NAME: " Acme Agents\n" }).productName).toBe("Acme Agents");
  });
});

describe("named hides and docs", () => {
  it("treats teamLibrary off as hidden", () => {
    expect(teamLibraryEnabled(resolveDistribution({}))).toBe(false);
  });

  it("does not invent a docs URL while the slot is empty", () => {
    expect(docsUrl("docs/byo-vps.md")).toBeNull();
    expect(docsUrl("docs/byo-vps.md", "https://docs.example.test")).toBe(
      "https://docs.example.test/docs/byo-vps.md",
    );
  });
});
