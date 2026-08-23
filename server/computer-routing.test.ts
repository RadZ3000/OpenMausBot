import { describe, expect, it } from "vitest";

import { encodeInjectId } from "./drivers/local-inject.ts";
import {
  isHostDesktopComputerTool,
  isLocalInjectComputerTool,
  localInjectCannotAutoDriveComputer,
  windowsHostComputerMustCard,
} from "./computer-routing.ts";

describe("computer routing", () => {
  it("treats Path A vm_* as local-inject computer tools", () => {
    expect(isLocalInjectComputerTool("vm_open")).toBe(true);
    expect(isLocalInjectComputerTool("vm_click")).toBe(true);
    expect(isLocalInjectComputerTool("mcp__computer__vm_window")).toBe(true);
    expect(isLocalInjectComputerTool("Bash")).toBe(false);
    expect(isLocalInjectComputerTool("mcp__computer__click")).toBe(false);
  });

  it("names Qwen host-desktop builtins without treating them as the Local VM", () => {
    expect(isHostDesktopComputerTool("computer_use__click")).toBe(true);
    expect(isHostDesktopComputerTool("computer_use__list_windows")).toBe(true);
    expect(isHostDesktopComputerTool("vm_click")).toBe(false);
  });

  it("blocks Auto-approve for a local-inject model on the Local VM or VPS", () => {
    const model = encodeInjectId("ollama", "ibm/granite4.1:3b");
    expect(localInjectCannotAutoDriveComputer({ model, computer: "vm", autoApprove: true })).toBe(true);
    expect(
      localInjectCannotAutoDriveComputer({
        model,
        computer: "cloud",
        cloudBackend: "vps",
        autoApprove: true,
      }),
    ).toBe(true);
    expect(localInjectCannotAutoDriveComputer({ model, computer: "vm", autoApprove: false })).toBe(false);
    expect(localInjectCannotAutoDriveComputer({ model, computer: "off", autoApprove: true })).toBe(false);
    expect(
      localInjectCannotAutoDriveComputer({
        model,
        computer: "cloud",
        cloudBackend: "box",
        autoApprove: true,
      }),
    ).toBe(false);
    expect(
      localInjectCannotAutoDriveComputer({ model: "claude-sonnet-5", computer: "vm", autoApprove: true }),
    ).toBe(false);
  });

  it("cards Qwen host-desktop builtins on Windows, not on macOS", () => {
    expect(windowsHostComputerMustCard("computer_use__click", "win32")).toBe(true);
    expect(windowsHostComputerMustCard("computer_use__click", "darwin")).toBe(false);
    expect(windowsHostComputerMustCard("vm_click", "win32")).toBe(false);
  });
});
