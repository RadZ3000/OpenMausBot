import { describe, expect, it } from "vitest";

import {
  chosenPath,
  choosePath,
  firstRunStep,
  forgetPath,
  type InstallPathStorage,
  parseInstallPaths,
} from "./install-path";

function fakeStorage(initial: Record<string, string> = {}): InstallPathStorage {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
  };
}

describe("parseInstallPaths", () => {
  it("offers everything when a build says nothing", () => {
    expect(parseInstallPaths(undefined)).toEqual(["local", "byok", "hosted"]);
    expect(parseInstallPaths("")).toEqual(["local", "byok", "hosted"]);
  });

  it("narrows to what a build names, in the order given", () => {
    expect(parseInstallPaths("byok,local")).toEqual(["byok", "local"]);
  });

  it("tolerates the whitespace a hand-edited env file arrives with", () => {
    expect(parseInstallPaths(" byok , hosted \n")).toEqual(["byok", "hosted"]);
  });

  it("drops a repeat rather than showing the same arm twice", () => {
    expect(parseInstallPaths("byok,byok")).toEqual(["byok"]);
  });

  // A typo here would otherwise ship a product with no way to get started, so
  // the fallback is deliberately the widest option rather than the narrowest.
  it("falls back to everything when nothing in the list is a real path", () => {
    expect(parseInstallPaths("byok-typo,nonsense")).toEqual(["local", "byok", "hosted"]);
  });

  it("keeps the valid half of a partly mistyped list", () => {
    expect(parseInstallPaths("byok,nonsense")).toEqual(["byok"]);
  });
});

describe("remembering the choice", () => {
  it("round-trips a path", () => {
    const storage = fakeStorage();
    expect(chosenPath(storage)).toBeNull();
    choosePath(storage, "byok");
    expect(chosenPath(storage)).toBe("byok");
  });

  it("forgets it, so first run can be walked again", () => {
    const storage = fakeStorage({ "omb-install-path": "byok" });
    forgetPath(storage);
    expect(chosenPath(storage)).toBeNull();
  });

  it("ignores a stored value that is not a path", () => {
    expect(chosenPath(fakeStorage({ "omb-install-path": "sideways" }))).toBeNull();
  });
});

describe("firstRunStep", () => {
  const all = ["local", "byok", "hosted"] as const;

  it("asks when there is more than one arm and nothing picked", () => {
    expect(firstRunStep(fakeStorage(), [...all])).toEqual({ kind: "choose", options: [...all] });
  });

  it("skips the menu when a build offers exactly one arm", () => {
    expect(firstRunStep(fakeStorage(), ["byok"])).toEqual({ kind: "setup", path: "byok" });
  });

  it("is done once a path has been picked", () => {
    const storage = fakeStorage({ "omb-install-path": "byok" });
    expect(firstRunStep(storage, [...all])).toEqual({ kind: "done" });
  });

  // Reconfiguring a build to drop an arm must not strand an install on a route
  // it can no longer take.
  it("re-asks when the picked arm is no longer offered", () => {
    const storage = fakeStorage({ "omb-install-path": "hosted" });
    expect(firstRunStep(storage, ["local", "byok"])).toEqual({
      kind: "choose",
      options: ["local", "byok"],
    });
  });

  it("treats an empty offer list as every arm rather than a dead end", () => {
    expect(firstRunStep(fakeStorage(), [])).toEqual({ kind: "choose", options: [...all] });
  });
});
