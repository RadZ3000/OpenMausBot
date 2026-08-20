import { describe, expect, it } from "vitest";

import { stepIndex } from "./lightbox";

describe("stepIndex", () => {
  it("moves through the run", () => {
    expect(stepIndex(0, 3, 1)).toBe(1);
    expect(stepIndex(2, 3, -1)).toBe(1);
  });

  it("wraps at both ends", () => {
    expect(stepIndex(2, 3, 1)).toBe(0);
    expect(stepIndex(0, 3, -1)).toBe(2);
  });

  it("stays put when there is nothing to step through", () => {
    expect(stepIndex(0, 1, 1)).toBe(0);
    expect(stepIndex(0, 1, -1)).toBe(0);
    expect(stepIndex(0, 0, 1)).toBe(0);
  });
});
