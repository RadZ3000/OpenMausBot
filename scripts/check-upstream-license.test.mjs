import { describe, expect, it } from "vitest";

import {
  assessUpstreamLicense,
  findLastCleanCommit,
  formatUpstreamLicenseAlert,
  namesApache,
  parseRefFlag,
  refNeedsUpstreamRemote,
  restrictionHits,
  restrictionNamesFromSpdx,
  spdxFromPackageJson,
} from "./check-upstream-license.mjs";

const APACHE_HEADER = `Apache License
Version 2.0, January 2004
http://www.apache.org/licenses/`;

const MIT_TEXT = `MIT License

Permission is hereby granted, free of charge, to any person obtaining a copy`;

const AGPL_TEXT = `GNU AFFERO GENERAL PUBLIC LICENSE
Version 3, 19 November 2007`;

const GPL_TEXT = `GNU GENERAL PUBLIC LICENSE
Version 3, 29 June 2007`;

describe("restrictionHits", () => {
  it("does not flag Apache 2.0 boilerplate", () => {
    expect(restrictionHits(APACHE_HEADER)).toEqual([]);
  });

  it("names AGPL, GPL, SSPL, and extra terms", () => {
    expect(restrictionHits(AGPL_TEXT)).toEqual(["AGPL"]);
    expect(restrictionHits(GPL_TEXT)).toEqual(["GPL"]);
    expect(restrictionHits("Server Side Public License")).toEqual(["SSPL"]);
    expect(restrictionHits("Apache 2.0 with the Commons Clause")).toEqual(["Commons Clause"]);
    expect(restrictionHits("licensed under the Business Source License")).toEqual(["Business Source"]);
    expect(restrictionHits("Elastic License 2.0")).toEqual(["Elastic License"]);
    expect(restrictionHits("PolyForm Noncommercial License 1.0.0")).toEqual(["PolyForm Noncommercial"]);
    expect(restrictionHits("Creative Commons Attribution-NonCommercial 4.0")).toEqual(["CC NonCommercial"]);
  });

  it("reports each name once when two patterns match", () => {
    expect(restrictionHits("GNU Affero General Public License (AGPL)")).toEqual(["AGPL"]);
  });
});

describe("restrictionNamesFromSpdx", () => {
  it("prefers AGPL over the GPL substring", () => {
    expect(restrictionNamesFromSpdx("AGPL-3.0-only")).toEqual(["AGPL"]);
    expect(restrictionNamesFromSpdx("GPL-3.0")).toEqual(["GPL"]);
  });
});

describe("namesApache", () => {
  it("recognises Apache-2.0 in a plain or dual SPDX", () => {
    expect(namesApache("Apache-2.0")).toBe(true);
    expect(namesApache("MIT OR Apache-2.0")).toBe(true);
    expect(namesApache("MIT")).toBe(false);
  });
});

describe("spdxFromPackageJson", () => {
  it("reads a string license field", () => {
    expect(spdxFromPackageJson('{"license":"Apache-2.0"}')).toBe("Apache-2.0");
  });

  it("reads license.type and licenses arrays", () => {
    expect(spdxFromPackageJson('{"license":{"type":"MIT"}}')).toBe("MIT");
    expect(spdxFromPackageJson('{"licenses":[{"type":"MIT"},{"type":"Apache-2.0"}]}')).toBe(
      "MIT OR Apache-2.0",
    );
  });

  it("returns null for missing or invalid JSON", () => {
    expect(spdxFromPackageJson("{")).toBeNull();
    expect(spdxFromPackageJson("{}")).toBeNull();
    expect(spdxFromPackageJson('{"license":""}')).toBeNull();
  });
});

describe("assessUpstreamLicense", () => {
  it("accepts Apache-2.0 with Apache LICENSE text", () => {
    const result = assessUpstreamLicense({
      spdx: "Apache-2.0",
      licenseText: APACHE_HEADER,
      noticeText: "",
    });
    expect(result.ok).toBe(true);
    expect(result.notes).toEqual([]);
  });

  it("accepts MIT with a note that Apache notices may no longer apply", () => {
    const result = assessUpstreamLicense({
      spdx: "MIT",
      licenseText: MIT_TEXT,
      noticeText: "",
    });
    expect(result.ok).toBe(true);
    expect(result.notes[0]).toMatch(/MIT/);
  });

  it("rejects AGPL SPDX", () => {
    const result = assessUpstreamLicense({
      spdx: "AGPL-3.0-only",
      licenseText: AGPL_TEXT,
      noticeText: "",
    });
    expect(result.ok).toBe(false);
    expect(result.restrictions).toEqual(["AGPL"]);
  });

  it("rejects Apache SPDX plus Commons Clause in LICENSE", () => {
    const result = assessUpstreamLicense({
      spdx: "Apache-2.0",
      licenseText: `${APACHE_HEADER}\n\nThe Commons Clause is attached.`,
      noticeText: "",
    });
    expect(result.ok).toBe(false);
    expect(result.restrictions).toEqual(["Commons Clause"]);
  });

  it("rejects extra terms that live only in NOTICE", () => {
    const result = assessUpstreamLicense({
      spdx: "Apache-2.0",
      licenseText: APACHE_HEADER,
      noticeText: "Additional terms: the Commons Clause.",
    });
    expect(result.ok).toBe(false);
    expect(result.restrictions).toEqual(["Commons Clause"]);
  });

  it("elects Apache from a dual SPDX even when LICENSE contains GPL text", () => {
    const result = assessUpstreamLicense({
      spdx: "Apache-2.0 OR GPL-3.0",
      licenseText: `${APACHE_HEADER}\n\n${GPL_TEXT}`,
      noticeText: "",
    });
    expect(result.ok).toBe(true);
  });

  it("rejects AND with copyleft", () => {
    const result = assessUpstreamLicense({
      spdx: "Apache-2.0 AND GPL-3.0",
      licenseText: APACHE_HEADER,
      noticeText: "",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects a missing SPDX and an empty LICENSE", () => {
    expect(
      assessUpstreamLicense({ spdx: null, licenseText: APACHE_HEADER, noticeText: "" }).ok,
    ).toBe(false);
    expect(
      assessUpstreamLicense({ spdx: "Apache-2.0", licenseText: "  ", noticeText: "" }).ok,
    ).toBe(false);
  });
});

describe("findLastCleanCommit", () => {
  it("returns the newest commit that still passes", () => {
    const clean = findLastCleanCommit([
      {
        sha: "agplnow",
        spdx: "AGPL-3.0-only",
        licenseText: AGPL_TEXT,
        noticeText: "",
      },
      {
        sha: "stillok",
        spdx: "Apache-2.0",
        licenseText: APACHE_HEADER,
        noticeText: "",
      },
    ]);
    expect(clean).toEqual({ sha: "stillok", spdx: "Apache-2.0" });
  });

  it("returns null when nothing in the walk passes", () => {
    expect(
      findLastCleanCommit([
        {
          sha: "agplnow",
          spdx: "AGPL-3.0-only",
          licenseText: AGPL_TEXT,
          noticeText: "",
        },
      ]),
    ).toBeNull();
  });
});

describe("parseRefFlag", () => {
  it("defaults to upstream/main", () => {
    expect(parseRefFlag([])).toEqual({ ok: true, ref: "upstream/main" });
  });

  it("reads --ref", () => {
    expect(parseRefFlag(["--ref", "abc123"])).toEqual({ ok: true, ref: "abc123" });
  });

  it("rejects a missing or flagged --ref value", () => {
    expect(parseRefFlag(["--ref"]).ok).toBe(false);
    expect(parseRefFlag(["--ref", "--other"]).ok).toBe(false);
    expect(parseRefFlag(["--unknown"]).ok).toBe(false);
    expect(parseRefFlag(["HEAD"]).ok).toBe(false);
  });
});

describe("refNeedsUpstreamRemote", () => {
  it("is true for the default remote-tracking ref", () => {
    expect(refNeedsUpstreamRemote("upstream/main")).toBe(true);
    expect(refNeedsUpstreamRemote("upstream/dev")).toBe(true);
    expect(refNeedsUpstreamRemote("HEAD")).toBe(false);
  });
});

describe("formatUpstreamLicenseAlert", () => {
  it("names the license and the two allowed replies", () => {
    const text = formatUpstreamLicenseAlert({
      ref: "upstream/main",
      sha: "deadbeef",
      lastClean: { sha: "cafebabe", spdx: "Apache-2.0" },
      assessment: {
        ok: false,
        spdx: "AGPL-3.0-only",
        reasons: ["package.json license AGPL-3.0-only is not a permissive SPDX we can sell under"],
        notes: [],
        restrictions: ["AGPL"],
      },
    });
    expect(text).toContain("UPSTREAM LICENSE GATE FAILED");
    expect(text).toContain("I acknowledge AGPL. Freeze at cafebabe.");
    expect(text).toContain("I acknowledge AGPL. Merge anyway despite AGPL.");
    expect(text).toContain("NOT acknowledgment");
    expect(text).toContain("do not count");
  });
});
