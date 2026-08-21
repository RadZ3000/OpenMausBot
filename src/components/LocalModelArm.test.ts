import { describe, expect, it } from "vitest";

import { pathAPane } from "./LocalModelArm";

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

  it("is ready once the Hermes binary is on disk, even if Ollama blipped", () => {
    expect(
      pathAPane({ runtimeUp: false, modelReady: false, agentInstanceId: "", agentReady: true }),
    ).toBe("ready");
  });

  it("is ready once the registry has a Hermes instance", () => {
    expect(pathAPane({ runtimeUp: true, modelReady: true, agentInstanceId: "hermes" })).toBe("ready");
  });
});
