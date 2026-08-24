import { describe, expect, it } from "vitest";

import { runtimeUp } from "./local-model.ts";
import {
  QWEN3VL_CONTEXT_32K,
  QWEN3VL_INSTRUCT_MODEL,
  QWEN3VL_THINKING_MODEL,
  fetchThinkingAgentTurn,
  isQwen3vlThinkingTag,
  loadedQwen3vlThinking,
  qwen3vlThinkingPulled,
  scoreThinkingAgentTurn,
  thinkingAgentChatBody,
} from "./qwen3vl-context.ts";

describe("isQwen3vlThinkingTag", () => {
  it("accepts the unsuffixed 4B Thinking tags only", () => {
    expect(isQwen3vlThinkingTag("qwen3-vl:4b")).toBe(true);
    expect(isQwen3vlThinkingTag("qwen3-vl:4b-thinking")).toBe(true);
    expect(isQwen3vlThinkingTag("library/qwen3-vl:4b")).toBe(true);
    expect(isQwen3vlThinkingTag(QWEN3VL_INSTRUCT_MODEL)).toBe(false);
    expect(isQwen3vlThinkingTag("ibm/granite4.1:3b")).toBe(false);
  });
});

describe("thinkingAgentChatBody", () => {
  it("asks Ollama for Qwen3-VL Thinking at 32k, not Instruct", () => {
    const body = thinkingAgentChatBody();
    expect(body.model).toBe(QWEN3VL_THINKING_MODEL);
    expect(body.model).not.toBe(QWEN3VL_INSTRUCT_MODEL);
    expect(body.options.num_ctx).toBe(QWEN3VL_CONTEXT_32K);
    expect(body.tools.map((row) => row.function.name)).toContain("vm_open");
    expect(body.tools.map((row) => row.function.name)).toContain("write_file");
  });
});

describe("scoreThinkingAgentTurn", () => {
  it("fails the 8k miss: window full, thoughts only", () => {
    const score = scoreThinkingAgentTurn(
      {
        done_reason: "length",
        truncated: true,
        prompt_eval_count: 8191,
        eval_count: 400,
        message: { content: "", thinking: "..." },
      },
      8192,
    );
    expect(score.ok).toBe(false);
    expect(score.truncated).toBe(true);
    expect(score.toolNames).toEqual([]);
  });

  it("passes when Thinking emits a tool call at 32k", () => {
    const score = scoreThinkingAgentTurn(
      {
        done_reason: "stop",
        prompt_eval_count: 4200,
        eval_count: 80,
        message: {
          tool_calls: [{ function: { name: "write_file" } }, { function: { name: "vm_open" } }],
        },
      },
      QWEN3VL_CONTEXT_32K,
    );
    expect(score.ok).toBe(true);
    expect(score.truncated).toBe(false);
    expect(score.toolNames).toEqual(["write_file", "vm_open"]);
  });
});

const live = process.env.OMB_LIVE_QWEN3VL === "1";

describe.skipIf(!live)("qwen3-vl:4b Thinking at 32k (live Ollama)", () => {
  it(
    "emits a tool call on the combined file+echo+vm_open prompt",
    async () => {
      expect(await runtimeUp()).toBe(true);
      expect(await qwen3vlThinkingPulled()).toBe(true);

      const chat = await fetchThinkingAgentTurn(QWEN3VL_CONTEXT_32K, fetch, undefined, AbortSignal.timeout(600_000));
      const score = scoreThinkingAgentTurn(chat, QWEN3VL_CONTEXT_32K);
      const loaded = await loadedQwen3vlThinking();
      expect(
        score.ok,
        `${score.reason}; prompt=${score.promptTokens} eval=${score.evalTokens} vram=${loaded?.size_vram ?? "n/a"} ctx=${loaded?.context_length ?? "n/a"}`,
      ).toBe(true);
    },
    600_000,
  );
});
