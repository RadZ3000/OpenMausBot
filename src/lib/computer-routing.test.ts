import { describe, expect, it } from "vitest";

import {
  isLocalInjectModelId,
  localInjectCannotAutoDriveComputer,
} from "./computer-routing";

describe("computer routing (renderer)", () => {
  it("recognises Path A inject ids without treating cloud slugs as local", () => {
    expect(isLocalInjectModelId("ollama::ibm/granite4.1:3b")).toBe(true);
    expect(isLocalInjectModelId("claude-sonnet-5")).toBe(false);
    expect(isLocalInjectModelId(undefined)).toBe(false);
  });

  it("blocks Auto for a local model on the Local VM or an explicit VPS", () => {
    expect(
      localInjectCannotAutoDriveComputer({
        model: "ollama::ibm/granite4.1:3b",
        computer: "vm",
        autoApprove: true,
      }),
    ).toBe(true);
    expect(
      localInjectCannotAutoDriveComputer({
        model: "ollama::ibm/granite4.1:3b",
        computer: "cloud",
        cloudBackend: "vps",
        autoApprove: true,
      }),
    ).toBe(true);
    expect(
      localInjectCannotAutoDriveComputer({
        model: "ollama::ibm/granite4.1:3b",
        computer: "off",
        autoApprove: true,
      }),
    ).toBe(false);
  });
});
