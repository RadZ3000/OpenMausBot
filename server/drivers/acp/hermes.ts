// Hermes Agent — Nous Research's `hermes acp` CLI. Custom-only: Hermes is
// a BYOK/local harness. ACP ignores `hermes -m` (cmd_acp does not forward
// it), and setting OPENAI_API_KEY makes provider:auto resolve to OpenRouter
// without an OpenRouter key — that is the "HTTP 401: Missing Authentication
// header" failure. Inject writes providers.<host>, selects model.provider,
// and session/set_model `custom:<host>:<model>`. `session/new` reads the
// selected provider before set_model can arrive.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ModelCatalog } from "../../contracts.ts";
import { decodeInjectId, hostApiKey, localHost, mergeLocalInject } from "../local-inject.ts";
import { createAcpDriver, type AcpSupport } from "./core.ts";

const EMPTY: ModelCatalog = { default: "", options: [] };

function hermesHome(env: Record<string, string | undefined>): string {
  return env.HERMES_HOME || join(env.HOME || env.USERPROFILE || homedir(), ".hermes");
}

function quoteYaml(value: string): string {
  if (/^[\w./:+-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function upsertHermesProvider(text: string, hostId: string, baseUrl: string, apiKey: string): string {
  const block = [`  ${hostId}:`, `    base_url: ${quoteYaml(baseUrl)}`, `    api_key: ${quoteYaml(apiKey)}`, ""].join(
    "\n",
  );
  if (/^providers:\s*$/m.test(text)) {
    const replaced = replaceHermesHostBlock(text, hostId, block);
    if (replaced !== null) return replaced;
    return text.replace(/^providers:\s*$/m, `providers:\n${block.trimEnd()}`);
  }
  const prefix = text && !text.endsWith("\n") ? `${text}\n` : text;
  return `${prefix}\nproviders:\n${block}`;
}

/** Replace `  hostId:` through the next sibling 2-space key or a top-level key. */
function replaceHermesHostBlock(text: string, hostId: string, block: string): string | null {
  const lines = text.split("\n");
  const start = lines.findIndex((line) => line === `  ${hostId}:`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end]!;
    if (/^  \S/.test(line) || /^\S/.test(line)) break;
    end++;
  }
  while (end > start + 1 && lines[end - 1] === "") end--;
  return [...lines.slice(0, start), ...block.replace(/\n$/, "").split("\n"), ...lines.slice(end)].join("\n");
}

function readHermesConfig(env: Record<string, string | undefined>) {
  const dir = hermesHome(env);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "config.yaml");
  let text = "";
  try {
    text = readFileSync(path, "utf8");
  } catch {
    text = "";
  }
  return { path, text };
}

/** Replace the uncommented `provider:` key inside the top-level `model:` block. */
function upsertHermesModelProvider(text: string, hostId: string): string {
  const quoted = quoteYaml(hostId);
  const lines = text.split("\n");
  const modelStart = lines.findIndex((line) => line === "model:");
  if (modelStart < 0) {
    const prefix = `model:\n  provider: ${quoted}\n`;
    return text ? `${prefix}${text.endsWith("\n") ? text : `${text}\n`}` : prefix;
  }
  let modelEnd = modelStart + 1;
  while (modelEnd < lines.length) {
    const line = lines[modelEnd]!;
    if (line !== "" && /^\S/.test(line)) break;
    modelEnd++;
  }
  const section = lines.slice(modelStart, modelEnd);
  const providerAt = section.findIndex((line) => /^  provider:\s*/.test(line));
  if (providerAt >= 0) section[providerAt] = `  provider: ${quoted}`;
  else section.splice(1, 0, `  provider: ${quoted}`);
  return [...lines.slice(0, modelStart), ...section, ...lines.slice(modelEnd)].join("\n");
}

/** Register an OpenAI-compatible host so ACP can `session/set_model custom:host:model`. */
export function ensureHermesInjectProvider(
  modelId: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const inject = decodeInjectId(modelId);
  if (!inject) return modelId;
  const host = localHost(inject.host);
  if (!host) return modelId;

  const { path, text } = readHermesConfig(env);
  const next = upsertHermesProvider(text, inject.host, host.baseUrl, hostApiKey(host, env));
  if (next !== text) writeFileSync(path, next);
  return hermesAcpModelId(modelId) ?? modelId;
}

/** Select the injected host so ACP `session/new` has a resolvable provider.
 *
 * Declaring `providers.<host>` is not enough: Hermes resolves a provider at
 * `session/new`, before `session/set_model` can arrive, and fails with
 * "No LLM provider configured" when `model.provider` is `auto`. Global flags
 * do not reach `hermes acp`. Pointing `HERMES_HOME` at a blank directory
 * selects the provider and then hangs building the agent — the only path
 * that returns a session id is writing `model.provider` into the config the
 * running CLI already uses. `model.default` is left alone; `session/set_model`
 * still pins the pick. */
export function selectHermesInjectProvider(
  modelId: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const inject = decodeInjectId(modelId);
  if (!inject) return modelId;
  if (!localHost(inject.host)) return modelId;

  const { path, text } = readHermesConfig(env);
  const next = upsertHermesModelProvider(text, inject.host);
  if (next !== text) writeFileSync(path, next);
  return hermesAcpModelId(modelId) ?? modelId;
}

/** ACP session/set_model id. Hermes parse_model_input treats `custom:name:model`. */
export function hermesAcpModelId(modelId: string | null | undefined): string | null {
  const inject = decodeInjectId(modelId);
  if (!inject) return null;
  return `custom:${inject.host}:${inject.model}`;
}

async function resolveModels(env: Record<string, string | undefined>): Promise<ModelCatalog> {
  const catalog = await mergeLocalInject(EMPTY, env);
  return { default: catalog.options[0]?.id ?? "", options: catalog.options };
}

async function applySetting(
  request: (method: string, params: unknown, timeoutMs?: number) => Promise<any>,
  method: string,
  params: Record<string, unknown>,
  what: string,
) {
  try {
    await request(method, params);
  } catch (e) {
    throw new Error(`Hermes rejected ${what} via ${method}: ${(e as Error).message}`);
  }
}

const support: AcpSupport = {
  driverKind: "hermesAgent",
  displayName: "Hermes",
  access: "custom",
  models: EMPTY,
  resolveModels,
  resolveTurnModel: (model, env) => {
    if (!model) return model;
    ensureHermesInjectProvider(model, env);
    selectHermesInjectProvider(model, env);
    return model;
  },
  defaultCli: "hermes",
  nativeSource: "hermes.acp",
  loginNote: "Hermes CLI is not installed",
  install: {
    command: {
      darwin: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
      linux: "curl -fsSL https://hermes-agent.nousresearch.com/install.sh | bash",
      win32: "iex (irm https://hermes-agent.nousresearch.com/install.ps1)",
    },
    docsUrl: "https://hermes-agent.nousresearch.com/docs/getting-started/quickstart",
    signInCommand: "hermes setup",
  },
  spawnArgs: () => ["acp"],
  transformEnv: (env) => {
    // A leftover OPENAI_API_KEY makes Hermes auto-resolve to OpenRouter and
    // send no Authorization header. ACP also reloads ~/.hermes/.env, so the
    // named custom provider + session/set_model is the real route.
    delete env.OPENAI_API_KEY;
    delete env.OPENROUTER_API_KEY;
  },
  pickAuthMethod: () => null,
  authFailure: "continue",
  isAuthenticated: () => true,
  async configureSession({ request, sessionId, turn }) {
    // Decode only — resolveTurnModel already wrote the named provider and
    // selected it using the instance HOME. Calling ensure*/select* again
    // here would hit process.env and rewrite the user's real config.yaml.
    const native = hermesAcpModelId(turn.model);
    if (!native) return;
    await applySetting(
      request,
      "session/set_model",
      { sessionId, modelId: native },
      `model "${native}"`,
    );
  },
  buildPromptText: (turn) => (turn.system ? `${turn.system}\n\n${turn.text}` : turn.text),
};

export const HermesAgentDriver = createAcpDriver(support);
