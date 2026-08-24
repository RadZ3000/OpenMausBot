// Skip-Hermes probe for Qwen3-VL Thinking at 32k.
//
// Path A first-run is Thinking 8B at 32k
// (docs/plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md). This module
// stays a 4B skip-Hermes `/api/chat` probe — the 8k combined Hermes turn on
// `qwen3-vl:4b` filled the window with thoughts
// (docs/plans/2026-08-23-006-qwen3vl-replace-granite-plan.md). A pass here is
// not the Path A gold turn. Do not flip RECOMMENDED_MODEL from here.
import { z } from "zod";

import { OLLAMA_ORIGIN } from "./local-model.ts";

/** Unsuffixed 4B is Thinking (same blob as `4b-thinking`). Not Instruct. */
export const QWEN3VL_THINKING_MODEL = "qwen3-vl:4b";

export const QWEN3VL_INSTRUCT_MODEL = "qwen3-vl:4b-instruct";

export const QWEN3VL_CONTEXT_32K = 32768;

/** Combined turn that truncated at 8k on Hermes: file + echo + open a URL. */
export const THINKING_AGENT_PROMPT =
  "Write a file named omb-tee.txt containing 8241, run echo OMB-TEE-OK in the terminal, and open https://example.com. Use tools. Do not only think.";

const ollamaPropertySchema = z.object({
  type: z.enum(["string", "number"]),
  description: z.string().optional(),
});

export const ollamaFunctionToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.object({
      type: z.literal("object"),
      properties: z.record(z.string(), ollamaPropertySchema),
      required: z.array(z.string()).optional(),
    }),
  }),
});

export type OllamaFunctionTool = z.infer<typeof ollamaFunctionToolSchema>;

function tool(
  name: string,
  description: string,
  properties: z.infer<typeof ollamaFunctionToolSchema>["function"]["parameters"]["properties"],
  required?: string[],
): OllamaFunctionTool {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: { type: "object", properties, required },
    },
  };
}

/** Compact Path A catalog plus file/terminal — not Cua's ~60 tools. */
export const THINKING_AGENT_TOOLS: OllamaFunctionTool[] = [
  tool(
    "write_file",
    "Write a text file on disk.",
    {
      path: { type: "string", description: "File path to write." },
      content: { type: "string", description: "Full file contents." },
    },
    ["path", "content"],
  ),
  tool(
    "terminal",
    "Run a shell command and return stdout.",
    { command: { type: "string", description: "Command to run." } },
    ["command"],
  ),
  tool("vm_apps", "List installed and running apps in the Linux VM.", {}),
  tool("vm_windows", "List top-level windows in the Linux VM.", {}),
  tool("vm_window", "Read named buttons, links, and text in the front window.", {}),
  tool("vm_desktop", "Read the VM desktop screenshot and open windows.", {}),
  tool(
    "vm_launch",
    "Launch an app in the Linux VM by name.",
    { name: { type: "string", description: "App name to launch." } },
  ),
  tool(
    "vm_click",
    "Click one numbered item from the last window reading.",
    { index: { type: "number", description: "Number from the last window reading." } },
    ["index"],
  ),
  tool(
    "vm_keys",
    "Type into the focused VM window.",
    { text: { type: "string", description: "Text to type." } },
  ),
  tool(
    "vm_open",
    "Open a http(s) URL in Chromium on the Linux desktop.",
    { url: { type: "string", description: "http or https URL." } },
    ["url"],
  ),
];

export function thinkingAgentChatBody(contextTokens: number = QWEN3VL_CONTEXT_32K) {
  return {
    model: QWEN3VL_THINKING_MODEL,
    stream: false as const,
    options: { num_ctx: contextTokens },
    tools: THINKING_AGENT_TOOLS,
    messages: [{ role: "user" as const, content: THINKING_AGENT_PROMPT }],
  };
}

const toolCallSchema = z
  .object({
    function: z.object({ name: z.string() }).passthrough(),
  })
  .passthrough();

export const ollamaChatResultSchema = z
  .object({
    done_reason: z.string().optional(),
    truncated: z.boolean().optional(),
    prompt_eval_count: z.number().optional(),
    eval_count: z.number().optional(),
    message: z
      .object({
        content: z.string().optional(),
        thinking: z.string().optional(),
        tool_calls: z.array(toolCallSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type OllamaChatResult = z.infer<typeof ollamaChatResultSchema>;

export interface ThinkingTurnScore {
  ok: boolean;
  reason: string;
  toolNames: string[];
  truncated: boolean;
  promptTokens: number | null;
  evalTokens: number | null;
  doneReason: string;
}

export function isQwen3vlThinkingTag(name: string): boolean {
  const slash = name.lastIndexOf("/");
  const tag = slash < 0 ? name : name.slice(slash + 1);
  return tag === "qwen3-vl:4b" || tag === "qwen3-vl:4b-thinking";
}

export function scoreThinkingAgentTurn(chat: OllamaChatResult, contextTokens: number): ThinkingTurnScore {
  const toolNames = (chat.message?.tool_calls ?? []).map((call) => call.function.name);
  const promptTokens = chat.prompt_eval_count ?? null;
  const evalTokens = chat.eval_count ?? null;
  const doneReason = chat.done_reason ?? "";
  const truncated =
    chat.truncated === true ||
    doneReason === "length" ||
    (promptTokens !== null && promptTokens >= contextTokens);
  const ok = toolNames.length > 0;
  const reason = ok
    ? truncated
      ? `tools fired (${toolNames.join(", ")}) but the window was exhausted`
      : `tools fired (${toolNames.join(", ")})`
    : truncated
      ? "no tool calls; the window filled with thoughts"
      : "no tool calls";
  return { ok, reason, toolNames, truncated, promptTokens, evalTokens, doneReason };
}

const tagsSchema = z.object({
  models: z.array(z.object({ name: z.string() })).default([]),
});

export async function qwen3vlThinkingPulled(
  fetchImpl: typeof fetch = fetch,
  origin: string = OLLAMA_ORIGIN,
): Promise<boolean> {
  const response = await fetchImpl(`${origin}/api/tags`);
  if (!response.ok) return false;
  const parsed = tagsSchema.safeParse(await response.json());
  if (!parsed.success) return false;
  return parsed.data.models.some((row) => isQwen3vlThinkingTag(row.name));
}

export async function fetchThinkingAgentTurn(
  contextTokens: number = QWEN3VL_CONTEXT_32K,
  fetchImpl: typeof fetch = fetch,
  origin: string = OLLAMA_ORIGIN,
  signal?: AbortSignal,
): Promise<OllamaChatResult> {
  const response = await fetchImpl(`${origin}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(thinkingAgentChatBody(contextTokens)),
    signal,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(
      `Ollama chat refused Qwen3-VL Thinking (HTTP ${response.status}): ${detail}`,
    );
  }
  const parsed = ollamaChatResultSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error("Ollama chat returned an unexpected Qwen3-VL body");
  return parsed.data;
}

const loadedModelSchema = z.object({
  name: z.string(),
  size_vram: z.number().optional(),
  context_length: z.number().optional(),
});

const psSchema = z.object({
  models: z.array(loadedModelSchema).default([]),
});

export type LoadedQwen3vl = z.infer<typeof loadedModelSchema>;

export async function loadedQwen3vlThinking(
  fetchImpl: typeof fetch = fetch,
  origin: string = OLLAMA_ORIGIN,
): Promise<LoadedQwen3vl | null> {
  const response = await fetchImpl(`${origin}/api/ps`);
  if (!response.ok) return null;
  const parsed = psSchema.safeParse(await response.json());
  if (!parsed.success) return null;
  return parsed.data.models.find((row) => isQwen3vlThinkingTag(row.name)) ?? null;
}
