import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, expect, it } from "vitest";

import { brandLeaks, evaluateBrand, parseBrandProfile } from "./check-brand.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("brandLeaks", () => {
  it("finds the upstream product and their endpoints", () => {
    const hits = brandLeaks(
      [
        'productName: "OpenMausBot"',
        "Open OpenMausMobile",
        "an OpenMaus team file",
        "    owner: milind-soni",
        "    repo: openmausbot-releases",
        'const BROKER = "https://openmausbot-composio.milindsoni201.workers.dev";',
        'export const TEAM = "https://github.com/example/openmausbot-teams";',
        "<div>🐭</div>",
      ].join("\n"),
    );
    expect(hits.map((hit) => hit.what)).toEqual([
      "upstream product name",
      "upstream companion name",
      "upstream short name",
      "upstream's GitHub account",
      "upstream's release feed",
      "upstream's workers.dev subdomain",
      "upstream's team library",
      "crash-page mouse",
    ]);
  });

  it("leaves wire ids and the team format alone", () => {
    const text = [
      'if (root.format !== "openmaus.team") throw new Error("not a team file");',
      'return json(res, 200, { app: "openmausbot" });',
      'localStorage.getItem("omb-skin");',
      "process.env.OMB_PRODUCT_NAME",
      'if (url.protocol === "openmausbot:") handlePair(url);',
    ].join("\n");
    expect(brandLeaks(text)).toEqual([]);
  });

  it("skips comment-only lines", () => {
    expect(brandLeaks("// OpenMausBot server — the harness host.")).toEqual([]);
  });

  it("treats ~/.openmausbot as a leak only after the data-dir slot is set", () => {
    const line = 'return join(home, ".openmausbot");';
    expect(brandLeaks(line)).toEqual([]);
    expect(brandLeaks(line, { dataDirectorySet: true }).map((hit) => hit.what)).toEqual([
      "historical data-dir default",
    ]);
  });

  it("does not treat openmaus.team as the short name", () => {
    expect(brandLeaks('format: "openmaus.team"')).toEqual([]);
  });

  it("treats leftover openmausbot:// as a leak only after a different scheme is plugged", () => {
    const line = 'app.setAsDefaultProtocolClient("openmausbot://pair");';
    expect(brandLeaks(line)).toEqual([]);
    expect(brandLeaks(line, { inheritedProtocol: true }).map((hit) => hit.what)).toEqual([
      "inherited protocol scheme",
    ]);
  });
});

describe("parseBrandProfile", () => {
  it("reads set values and the unset sentinel", () => {
    const profile = parseBrandProfile(`
export const brandProfile = {
  productName: "FlowDesk",
  appId: UNSET,
  publish: null,
  teamLibrary: "off",
  showUpdateDownload: false,
};
`);
    expect(profile.productName).toBe("FlowDesk");
    expect(profile.appId).toBe("unset");
    expect(profile.publish).toBeNull();
    expect(profile.teamLibrary).toBe("off");
    expect(profile.showUpdateDownload).toBe(false);
  });
});

describe("evaluateBrand", () => {
  it("matches overlay productName to the profile and lists remaining slots", () => {
    const result = evaluateBrand(repoRoot);
    expect(result.profile.productName).toBe("FlowDesk");
    expect(result.failures).toEqual([]);
    expect(result.incomplete.length).toBeGreaterThan(0);
  });

  it("fails --release while icons, lock-once slots, and listed leaks remain", () => {
    const result = evaluateBrand(repoRoot, { release: true });
    expect(result.failures.some((failure) => /incomplete/i.test(failure))).toBe(true);
    expect(result.failures.some((failure) => /icons/.test(failure) || /appId/.test(failure))).toBe(true);
  });
});
