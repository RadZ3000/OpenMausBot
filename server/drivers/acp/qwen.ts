// Qwen Code — Alibaba's `qwen --acp` CLI. Custom-only in OpenMausBot:
// the official pane has no Qwen Cloud catalog; live local hosts land in
// Custom and are written into ~/.qwen/settings.json modelProviders.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ModelCatalog } from "../../contracts.ts";
import { decodeInjectId, hostApiKey, localHost, mergeLocalInject } from "../local-inject.ts";
import { createAcpDriver, type AcpSupport } from "./core.ts";

const EMPTY: ModelCatalog = { default: "", options: [] };

function qwenHome(env: Record<string, string | undefined>): string {
  return join(env.HOME || env.USERPROFILE || homedir(), ".qwen");
}

function envKeyFor(hostId: string): string {
  return `OPENMAUSBOT_QWEN_${hostId.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}_API_KEY`;
}

/** Upsert an OpenAI-compatible provider row so `qwen -m` can reach the host. */
export function ensureQwenInjectModel(
  modelId: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const inject = decodeInjectId(modelId);
  if (!inject) return modelId;
  const host = localHost(inject.host);
  if (!host) return modelId;

  const dir = qwenHome(env);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, "settings.json");
  let settings: Record<string, unknown> = {};
  if (existsSync(path)) {
    try {
      settings = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    } catch {
      // Malformed user config — inject into a fresh object rather than fail the turn.
    }
  }
  const keyName = envKeyFor(inject.host);
  const key = hostApiKey(host, env);
  const envMap =
    settings.env && typeof settings.env === "object" && !Array.isArray(settings.env)
      ? { ...(settings.env as Record<string, unknown>) }
      : {};
  envMap[keyName] = key;
  settings.env = envMap;

  const providers =
    settings.modelProviders && typeof settings.modelProviders === "object" && !Array.isArray(settings.modelProviders)
      ? { ...(settings.modelProviders as Record<string, unknown>) }
      : {};
  const openai = Array.isArray(providers.openai) ? [...providers.openai] : [];
  const match = openai.find(
    (row) =>
      row &&
      typeof row === "object" &&
      (row as { id?: unknown }).id === inject.model &&
      (row as { baseUrl?: unknown }).baseUrl === host.baseUrl,
  );
  if (!match) {
    openai.push({
      id: inject.model,
      name: `${inject.model} (${host.label})`,
      baseUrl: host.baseUrl,
      envKey: keyName,
    });
    providers.openai = openai;
    settings.modelProviders = providers;
  }

  // Declaring the provider is not enough: without a selected auth type Qwen
  // Code asks the user to run /auth interactively and refuses the turn with
  // "Authentication required", which is precisely the cloud sign-in this path
  // exists to avoid. Its own docs are explicit — "without this, you'd need to
  // run /auth interactively".
  //
  // This does reach outside our turn: someone who normally runs `qwen` on
  // Qwen OAuth will find it switched to the openai protocol. That is the same
  // trade already made by writing modelProviders into their real settings
  // file, and the alternative is a local model that cannot answer at all.
  const security =
    settings.security && typeof settings.security === "object" && !Array.isArray(settings.security)
      ? { ...(settings.security as Record<string, unknown>) }
      : {};
  const auth =
    security.auth && typeof security.auth === "object" && !Array.isArray(security.auth)
      ? { ...(security.auth as Record<string, unknown>) }
      : {};
  auth.selectedType = "openai";
  security.auth = auth;
  settings.security = security;
  writeFileSync(path, `${JSON.stringify(settings, null, 2)}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600);
  } catch {
    // Windows ignores POSIX modes; keep the inject even if chmod is unsupported.
  }
  return inject.model;
}

async function resolveModels(env: Record<string, string | undefined>): Promise<ModelCatalog> {
  const catalog = await mergeLocalInject(EMPTY, env);
  return { default: catalog.options[0]?.id ?? "", options: catalog.options };
}

const support: AcpSupport = {
  driverKind: "qwenAgent",
  displayName: "Qwen",
  access: "custom",
  models: EMPTY,
  resolveModels,
  resolveTurnModel: (model, env) => (model ? ensureQwenInjectModel(model, env) : model),
  defaultCli: "qwen",
  nativeSource: "qwen.acp",
  loginNote: "Qwen Code CLI is not installed",
  install: {
    command: {
      darwin: "curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash",
      linux: "curl -fsSL https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.sh | bash",
      win32: "irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex",
    },
    docsUrl: "https://qwenlm.github.io/qwen-code-docs/en/users/overview/",
  },
  spawnArgs: (_config, turn) => ["--acp", ...(turn.model ? ["-m", turn.model] : [])],
  pickAuthMethod: () => null,
  authFailure: "continue",
  isAuthenticated: () => true,
  buildPromptText: (turn) => (turn.system ? `${turn.system}\n\n${turn.text}` : turn.text),
};

export const QwenAgentDriver = createAcpDriver(support);
