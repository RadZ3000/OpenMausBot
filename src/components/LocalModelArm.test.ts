import { describe, expect, it } from "vitest";

import { localComputerLabel, pathAPane, pathAShownVmProblem, pathAVmLead, pathAVmNext } from "./LocalModelArm";

describe("pathAPane", () => {
  it("starts at the runtime until Ollama answers", () => {
    expect(pathAPane({ runtimeUp: false, modelReady: false, agentInstanceId: "" })).toBe("runtime");
  });

  it("asks for the model once the runtime is up", () => {
    expect(pathAPane({ runtimeUp: true, modelReady: false, agentInstanceId: "" })).toBe("model");
  });

  it("asks for Hermes once the model is here", () => {
    expect(pathAPane({ runtimeUp: true, modelReady: true, agentInstanceId: "" })).toBe("agent");
  });

  it("moves to the Local computer once Hermes is on disk", () => {
    expect(
      pathAPane({ runtimeUp: false, modelReady: false, agentInstanceId: "", agentReady: true }),
    ).toBe("vm");
  });

  it("moves to the Local computer once the registry has a Hermes instance", () => {
    expect(pathAPane({ runtimeUp: true, modelReady: true, agentInstanceId: "hermes" })).toBe("vm");
  });

  it("is ready only after the Local computer is running", () => {
    expect(
      pathAPane({
        runtimeUp: true,
        modelReady: true,
        agentInstanceId: "hermes",
        vmReady: true,
      }),
    ).toBe("ready");
  });
});

describe("pathAVmNext", () => {
  it("asks Windows first when WSL is missing", () => {
    expect(pathAVmNext({ wslReady: false, vmReady: false })).toBe("wsl");
  });

  it("starts the guest once WSL is present", () => {
    expect(pathAVmNext({ wslReady: true, vmReady: false, virtKind: "ready" })).toBe("vm");
  });

  it("asks for a restart when Windows is waiting on one", () => {
    expect(pathAVmNext({ wslReady: true, vmReady: false, virtKind: "reboot-pending" })).toBe("reboot");
  });

  it("turns on Windows features when they are off", () => {
    expect(pathAVmNext({ wslReady: true, vmReady: false, virtKind: "enable-features" })).toBe(
      "enable-features",
    );
  });

  it("does not try to flip firmware from the app", () => {
    expect(pathAVmNext({ wslReady: true, vmReady: false, virtKind: "firmware-off" })).toBe("firmware");
  });

  it("is done when the guest is running", () => {
    expect(pathAVmNext({ wslReady: true, vmReady: true })).toBe("none");
  });
});

describe("localComputerLabel", () => {
  it("does not call the row optional", () => {
    expect(
      localComputerLabel({ wslReady: false, vmReady: false, vmProblem: null }),
    ).toBe("Local computer — not set up");
    expect(
      localComputerLabel({ wslReady: true, vmReady: false, vmProblem: null, virtKind: "ready" }),
    ).toBe("Local computer — not running");
    expect(
      localComputerLabel({
        wslReady: true,
        vmReady: false,
        vmProblem: null,
        virtKind: "reboot-pending",
      }),
    ).toBe("Local computer — restart required");
    expect(
      localComputerLabel({ wslReady: true, vmReady: true, vmProblem: null }),
    ).toBe("Local computer");
  });
});

describe("pathAShownVmProblem", () => {
  it("hides the Settings container-runtime line on Path A", () => {
    expect(
      pathAShownVmProblem({ vmProblem: "Install a supported container runtime first" }),
    ).toBeNull();
  });

  it("hides leftover VM problems when Windows still needs a restart", () => {
    expect(
      pathAShownVmProblem({
        vmProblem: "Start podman first",
        virtKind: "reboot-pending",
      }),
    ).toBeNull();
  });
});

describe("pathAVmLead", () => {
  it("asks for a restart instead of sending people to BIOS", () => {
    expect(
      pathAVmLead({
        model: "ibm/granite4.1:3b",
        runtimeUp: true,
        modelReady: true,
        virtKind: "reboot-pending",
      }),
    ).toMatch(/needs a restart/i);
  });
});
