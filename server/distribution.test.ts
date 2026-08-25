import { describe, expect, it } from "vitest";

import { HTTP_USER_AGENT, PREFERRED_MODEL, PRODUCT_NAME, startingModel } from "./distribution.ts";
import type { ModelCatalog } from "./contracts.ts";
import { RECOMMENDED_MODEL } from "./local-model.ts";

const catalog = (defaultId: string, ...ids: string[]): ModelCatalog => ({
  default: defaultId,
  options: ids.map((id) => ({ id, label: id })),
});

describe("product name", () => {
  it("matches the brand pack when the environment does not override it", () => {
    expect(PRODUCT_NAME).toBe("FlowDesk");
  });

  it("keeps the historical skills User-Agent while that slot is unset", () => {
    expect(HTTP_USER_AGENT).toBe("OpenMausBot-skills");
  });
});

describe("startingModel", () => {
  it("uses the engine's own default when the build states no preference", () => {
    expect(startingModel(catalog("sonnet", "sonnet", "opus"), "")).toBe("sonnet");
  });

  it("honours a preference the engine offers", () => {
    expect(startingModel(catalog("sonnet", "sonnet", "opus"), "opus")).toBe("opus");
  });

  // The failure this protects against: a bot configured onto a model that is
  // not there looks ready and then fails on send — the same trap the empty
  // selection in defaultSelection() exists to avoid.
  it("ignores a preference the engine does not offer", () => {
    expect(startingModel(catalog("sonnet", "sonnet", "opus"), "ollama::qwen3:4b")).toBe("sonnet");
  });

  it("matches a local model id exactly, host prefix included", () => {
    const local = catalog("ollama::llama3.2:3b", "ollama::llama3.2:3b", "ollama::qwen3:4b");
    expect(startingModel(local, "ollama::qwen3:4b")).toBe("ollama::qwen3:4b");
    expect(startingModel(local, "qwen3:4b")).toBe("ollama::llama3.2:3b");
  });

  it("returns an empty model when the engine has no default either", () => {
    expect(startingModel({ default: "", options: [] }, "opus")).toBe("");
  });

  it("prefers first-run Thinking 8B when Hermes lists it", () => {
    const wanted = `ollama::${RECOMMENDED_MODEL}`;
    expect(PREFERRED_MODEL).toBe(wanted);
    const local = catalog("ollama::llama3.2:3b", "ollama::llama3.2:3b", wanted);
    expect(startingModel(local)).toBe(wanted);
  });

  it("falls back to the engine default when Thinking 8B is not in the catalog yet", () => {
    expect(startingModel(catalog("sonnet", "sonnet", "opus"))).toBe("sonnet");
  });
});
