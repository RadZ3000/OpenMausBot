import { describe, expect, it } from "vitest";

import { resolveDistribution } from "./distribution";

describe("an unconfigured build", () => {
  it("ships the defaults it has today", () => {
    const distribution = resolveDistribution({});
    expect(distribution.productName).toBe("OpenMausBot");
    expect(distribution.analyticsHost).toBe("https://us.i.posthog.com");
  });

  it("has no analytics destination, which is what keeps it silent", () => {
    expect(resolveDistribution({}).analyticsKey).toBe("");
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
      analyticsKey: "phc_acme",
      analyticsHost: "https://analytics.acme.test",
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
    expect(resolveDistribution({ VITE_PRODUCT_NAME: "" }).productName).toBe("OpenMausBot");
    expect(resolveDistribution({ VITE_PRODUCT_NAME: "   " }).productName).toBe("OpenMausBot");
    expect(resolveDistribution({ VITE_ANALYTICS_HOST: "\n" }).analyticsHost).toBe("https://us.i.posthog.com");
  });

  it("trims a stray newline rather than shipping it into a title bar", () => {
    expect(resolveDistribution({ VITE_PRODUCT_NAME: " Acme Agents\n" }).productName).toBe("Acme Agents");
  });
});
