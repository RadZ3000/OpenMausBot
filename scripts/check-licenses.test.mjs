import { describe, expect, it } from "vitest";

import { permitted } from "./check-licenses.mjs";

describe("permitted", () => {
  it("accepts the plain permissive licenses", () => {
    for (const license of ["MIT", "ISC", "Apache-2.0", "BSD-3-Clause", "0BSD", "BlueOak-1.0.0"]) {
      expect(permitted(license)).toBe(true);
    }
  });

  it("rejects copyleft", () => {
    for (const license of ["GPL-3.0", "AGPL-3.0-only", "LGPL-3.0-or-later", "MPL-2.0", "SSPL-1.0"]) {
      expect(permitted(license)).toBe(false);
    }
  });

  // OR is a choice, so one permissive branch is enough — this is how dompurify
  // ships as (MPL-2.0 OR Apache-2.0) without needing a review entry
  it("elects the permissive side of an OR", () => {
    expect(permitted("MIT OR Apache-2.0")).toBe(true);
    expect(permitted("(MPL-2.0 OR Apache-2.0)")).toBe(true);
    expect(permitted("GPL-2.0 OR LGPL-3.0")).toBe(false);
  });

  // AND binds us to every operand, so one copyleft term taints the whole thing
  it("requires every side of an AND", () => {
    expect(permitted("(Apache-2.0 AND MIT)")).toBe(true);
    expect(permitted("Apache-2.0 AND LGPL-3.0-or-later")).toBe(false);
    expect(permitted("MIT AND MPL-2.0")).toBe(false);
  });

  it("keeps AND binding when it wraps an OR choice", () => {
    expect(permitted("(MIT OR GPL-3.0) AND ISC")).toBe(true);
    expect(permitted("(MIT OR ISC) AND GPL-3.0")).toBe(false);
  });

  it("does not let an unknown license through", () => {
    expect(permitted("SEE LICENSE IN LICENSE.md")).toBe(false);
    expect(permitted("")).toBe(false);
  });
});
