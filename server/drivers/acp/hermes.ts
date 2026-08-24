// Hermes Agent — Nous Research's `hermes acp` CLI. Custom-only: Hermes is
// a BYOK/local harness. ACP ignores `hermes -m` (cmd_acp does not forward
// it), and setting OPENAI_API_KEY makes provider:auto resolve to OpenRouter
// without an OpenRouter key — that is the "HTTP 401: Missing Authentication
// header" failure. Inject writes providers.<host>, selects model.provider,
// and session/set_model `custom:<host>:<model>`. `session/new` reads the
// selected provider before set_model can arrive.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

import type { ModelCatalog } from "../../contracts.ts";
import { compactObserveImageForModel } from "../../compact-computer-observe.ts";
import { decodeInjectId, hostApiKey, INJECT_SEP, localHost, mergeLocalInject } from "../local-inject.ts";
import { createAcpDriver, type AcpSupport } from "./core.ts";

const EMPTY: ModelCatalog = { default: "", options: [] };

/** Directory Hermes actually reads. The Windows installer sets
 * `HERMES_HOME=%LOCALAPPDATA%\hermes`; `~/.hermes` is the POSIX (and WSL)
 * layout. Prefer an existing config.yaml so a machine that still uses
 * `~/.hermes` is not rewritten into an empty LocalAppData profile. */
export function resolveHermesHome(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
): string {
  if (env.HERMES_HOME) return env.HERMES_HOME;
  const home = env.HOME || env.USERPROFILE || homedir();
  const posix = join(home, ".hermes");
  if (platform !== "win32") return posix;
  const native = join(env.LOCALAPPDATA || join(home, "AppData", "Local"), "hermes");
  if (existsSync(join(native, "config.yaml"))) return native;
  if (existsSync(join(posix, "config.yaml"))) return posix;
  return native;
}

function hermesHome(env: Record<string, string | undefined>): string {
  return resolveHermesHome(env);
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

function yamlLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

/** Replace uncommented `provider:` in every top-level `model:` block.
 *
 * YAML last-key-wins. A CRLF stock config used to miss `model:` (exact
 * `"model:"` vs `"model:\r"`), so we prepended a stub and left the real
 * `provider: "auto"` in place — session/new still saw auto.
 * `supports_vision` is Nous's escape hatch for custom VL endpoints that
 * are missing from models.dev; Granite must not inherit a sticky true. */
function upsertHermesModelProvider(text: string, hostId: string, seesImages: boolean): string {
  const quoted = quoteYaml(hostId);
  const vision = seesImages ? "true" : "false";
  const lines = yamlLines(text);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "model:") starts.push(i);
  }
  if (starts.length === 0) {
    const prefix = `model:\n  provider: ${quoted}\n  supports_vision: ${vision}\n`;
    const body = lines.join("\n");
    return body ? `${prefix}${body.endsWith("\n") ? body : `${body}\n`}` : prefix;
  }
  for (let s = starts.length - 1; s >= 0; s--) {
    const modelStart = starts[s]!;
    let modelEnd = modelStart + 1;
    while (modelEnd < lines.length) {
      const line = lines[modelEnd]!;
      if (line !== "" && /^\S/.test(line)) break;
      modelEnd++;
    }
    const keys = [
      { prefix: "  provider:", line: `  provider: ${quoted}` },
      { prefix: "  supports_vision:", line: `  supports_vision: ${vision}` },
    ];
    for (const key of keys) {
      let at = -1;
      for (let i = modelStart + 1; i < modelEnd; i++) {
        if (lines[i]!.startsWith(key.prefix)) {
          at = i;
          break;
        }
      }
      if (at >= 0) lines[at] = key.line;
      else {
        lines.splice(modelStart + 1, 0, key.line);
        modelEnd++;
      }
    }
  }
  return lines.join("\n");
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
  const next = upsertHermesModelProvider(text, inject.host, compactObserveImageForModel(modelId));
  if (next !== text) writeFileSync(path, next);
  return hermesAcpModelId(modelId) ?? modelId;
}

/** ACP session/set_model id. Hermes parse_model_input treats `custom:name:model`. */
export function hermesAcpModelId(modelId: string | null | undefined): string | null {
  const inject = decodeInjectId(modelId);
  if (inject) return `custom:${inject.host}:${inject.model}`;
  // Hermes' own ACP ids are `<provider>:<model>` (`openrouter:qwen/qwen3.8-max`).
  // They are not inject ids and must be forwarded untouched; returning null here
  // is what limited the picker to locally injected hosts.
  const native = typeof modelId === "string" ? modelId.trim() : "";
  if (native && !native.includes(INJECT_SEP) && /^[a-z0-9_-]+:[\w./:-]+$/i.test(native)) return native;
  return null;
}

function isWslBashLauncher(path: string): boolean {
  const normalized = path.replaceAll("/", "\\").toLowerCase();
  return (
    normalized.endsWith("\\system32\\bash.exe") ||
    normalized.endsWith("\\sysnative\\bash.exe") ||
    normalized.includes("\\windowsapps\\bash.exe")
  );
}

const BASH_PROBE_STDIN_MARK = "openmausbot-b24";
const COMPUTER_DISABLES_WEB_MARK = "openmausbot-b24a";
const COMPUTER_TOOLS_EAGER_MARK = "openmausbot-b24a-eager";
const COMPUTER_SHORT_NAMES_MARK = "openmausbot-b24a-short";
const MCP_IMAGE_ENVELOPE_MARK = "openmausbot-eyes-mcp";
const LOCAL_CATALOG_MARK = "openmausbot-b24a-catalog";
const ACP_MCP_WAIT_MARK = "openmausbot-b24a-mcpwait";
const ACP_MCP_REBIND_MARK = "openmausbot-b24a-rebind";
const BRIDGE_NO_CALL_MARK = "openmausbot-b24a-nocall";
const BRIDGE_UNWRAP_MARK = "openmausbot-b24a-unwrap";

/** Hermes native toolsets a 3B local model can hold with the compact computer
 * list. `hermes-acp` is the editor bundle (~30 tools) and does not fit in 8k. */
export const LOCAL_HERMES_ACP_TOOLSETS = ["file", "terminal"];

/** Child-env grant for the session.py expander. `applyTurnEnv` sets it;
 * `transformEnv` clears it so catalog refresh / a leaked shell overlay
 * cannot shrink a cloud Hermes bot. */
export const LOCAL_HERMES_ACP_TOOLSETS_ENV = "OPENMAUSBOT_ACP_TOOLSETS";

const COMPUTER_DISABLES_WEB_NEEDLE =
  "disabled_toolsets = getattr(state.agent, \"disabled_toolsets\", None)";

const COMPUTER_TOOLS_EAGER_NEEDLE = "if name in BRIDGE_TOOL_NAMES:\n        return False\n    if name in _core_tool_names():";
const COMPUTER_TOOLS_EAGER_NEEDLE_CRLF =
  "if name in BRIDGE_TOOL_NAMES:\r\n        return False\r\n    if name in _core_tool_names():";

/** Hermes 0.20.x `_bash_starts` on this machine. */
export function hermesAgentLocalPyPath(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (platform !== "win32") return undefined;
  const local = env.LOCALAPPDATA || join(env.HOME || env.USERPROFILE || homedir(), "AppData", "Local");
  const path = join(local, "hermes", "hermes-agent", "tools", "environments", "local.py");
  return existsSync(path) ? path : undefined;
}

/** Insert `stdin=DEVNULL` on Hermes `_bash_starts`. Pure; used by tests. */
export function patchHermesBashProbeSource(text: string): string {
  if (text.includes(BASH_PROBE_STDIN_MARK)) return text;
  if (!text.includes("def _bash_starts") || !text.includes("_BASH_EXTERNAL_PROGRAM_PROBE")) return text;
  const probe = '[bash, "--noprofile", "--norc", "-c", _BASH_EXTERNAL_PROGRAM_PROBE]';
  const probeAt = text.indexOf(probe);
  if (probeAt < 0) return text;
  const window = text.slice(probeAt, probeAt + 400);
  if (window.includes("stdin=subprocess.DEVNULL")) return text;
  const match = window.match(
    /(\[bash, "--noprofile", "--norc", "-c", _BASH_EXTERNAL_PROGRAM_PROBE\],\r?\n)([ \t]*)(capture_output=True,)/,
  );
  if (!match) return text;
  const indent = match[2] ?? "            ";
  const nl = match[1]?.includes("\r\n") ? "\r\n" : "\n";
  const insertion = `${match[1]}${indent}stdin=subprocess.DEVNULL,  # ${BASH_PROBE_STDIN_MARK}${nl}${indent}${match[3]}`;
  return text.slice(0, probeAt) + window.replace(match[0], insertion) + text.slice(probeAt + window.length);
}

/** Close stdin on the Git Bash probe. `detached: true` does not leave Chromium's
 * job, so MSYS `true`/`cat` still inherit ACP stdin and deadlock (Nous #80952). */
export function ensureHermesBashProbeClosesStdin(
  env: Record<string, string | undefined> = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== "win32") return false;
  const path = hermesAgentLocalPyPath(env, platform);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesBashProbeSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

/** Hermes 0.20.x ACP server that registers session MCP servers. */
export function hermesAcpServerPyPath(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const path = join(resolveHermesHome(env), "hermes-agent", "acp_adapter", "server.py");
  return existsSync(path) ? path : undefined;
}

/** When ACP mounts a `computer` MCP server, drop Hermes native web/browser
 * tools so a local model cannot satisfy "open this URL" via `web_extract`.
 * Cua's `vm_*` tools stay. Pure; used by tests. */
export function patchHermesComputerDisablesWebSource(text: string): string {
  if (text.includes(COMPUTER_DISABLES_WEB_MARK)) return text;
  if (!text.includes("_register_session_mcp_servers") || !text.includes(COMPUTER_DISABLES_WEB_NEEDLE)) {
    return text;
  }
  const needleAt = text.indexOf(COMPUTER_DISABLES_WEB_NEEDLE);
  if (needleAt < 0) return text;
  const lineStart = text.lastIndexOf("\n", needleAt) + 1;
  const indent = text.slice(lineStart, needleAt);
  const afterNeedle = text.indexOf("\n", needleAt);
  if (afterNeedle < 0) return text;
  const nl = text.slice(needleAt, afterNeedle + 1).includes("\r\n") ? "\r\n" : "\n";
  const insertion =
    `${indent}if any(getattr(server, "name", None) == "computer" for server in mcp_servers):  # ${COMPUTER_DISABLES_WEB_MARK}${nl}` +
    `${indent}    extra = ["web", "browser"]${nl}` +
    `${indent}    disabled_toolsets = list(disabled_toolsets or []) + extra${nl}` +
    `${indent}    state.agent.disabled_toolsets = disabled_toolsets${nl}`;
  return text.slice(0, afterNeedle + 1) + insertion + text.slice(afterNeedle + 1);
}

/** Hide Hermes `web_extract` / native browser tools when the Local VM is mounted. */
export function ensureHermesComputerDisablesWeb(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesAcpServerPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesComputerDisablesWebSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

const ACP_MCP_WAIT_NEEDLE =
  "            return\n\n        try:\n            from model_tools import get_tool_definitions";
const ACP_MCP_WAIT_NEEDLE_CRLF = ACP_MCP_WAIT_NEEDLE.replaceAll("\n", "\r\n");

/** After ACP `register_mcp_servers` returns, wait until those servers have
 * actually registered tools, then the existing get_tool_definitions refresh
 * runs. Cua's tools/list often lands a few seconds after session/new would
 * otherwise return, so the first prompt used to go to Ollama with only
 * native file/terminal tools. Pure; used by tests. */
export function patchHermesAcpMcpWaitSource(text: string): string {
  if (text.includes(ACP_MCP_WAIT_MARK)) return text;
  const crlf = text.includes(ACP_MCP_WAIT_NEEDLE_CRLF);
  const needle = crlf ? ACP_MCP_WAIT_NEEDLE_CRLF : ACP_MCP_WAIT_NEEDLE;
  const needleAt = text.indexOf(needle);
  if (needleAt < 0) return text;
  const nl = crlf ? "\r\n" : "\n";
  const extra =
    `            return${nl}` +
    `${nl}` +
    `        try:${nl}` +
    `            import time as _omb_mcp_time${nl}` +
    `            from tools.mcp_tool import get_registered_mcp_server_names as _omb_mcp_have${nl}` +
    `            _omb_wanted = [server.name for server in mcp_servers]${nl}` +
    `            _omb_deadline = _omb_mcp_time.monotonic() + 30${nl}` +
    `            while _omb_wanted and _omb_mcp_time.monotonic() < _omb_deadline:  # ${ACP_MCP_WAIT_MARK}${nl}` +
    `                if all(name in _omb_mcp_have() for name in _omb_wanted):${nl}` +
    `                    break${nl}` +
    `                await asyncio.sleep(0.2)${nl}` +
    `        except Exception:${nl}` +
    `            logger.debug("Session %s: ACP MCP wait skipped", state.session_id, exc_info=True)${nl}` +
    `${nl}` +
    `        try:${nl}` +
    `            from model_tools import get_tool_definitions`;
  return text.slice(0, needleAt) + extra + text.slice(needleAt + needle.length);
}

/** Hold session/new until ACP-mounted MCP servers (computer, composio, …)
 * have registered tools, so the first prompt's Ollama tools array includes them. */
export function ensureHermesAcpMcpWait(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesAcpServerPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesAcpMcpWaitSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

const ACP_MCP_REBIND_NEEDLE =
  "            current_api_mode = None if provider_changed else getattr(state.agent, \"api_mode\", None)\n            state.agent = self.session_manager._make_agent(\n                session_id=session_id,\n                cwd=state.cwd,\n                model=resolved_model,\n                requested_provider=requested_provider,\n                base_url=current_base_url,\n                api_mode=current_api_mode,\n            )\n            self.session_manager.save_session(session_id)";
const ACP_MCP_REBIND_NEEDLE_CRLF = ACP_MCP_REBIND_NEEDLE.replaceAll("\n", "\r\n");

/** Hermes `session/set_model` rebuilds the AIAgent and drops the MCP snapshot
 * from session/new. Re-attach registered MCP toolsets (and the previous
 * disabled list) so Path A computer tools survive the inject pin. Pure. */
export function patchHermesAcpMcpRebindSource(text: string): string {
  if (text.includes(ACP_MCP_REBIND_MARK)) return text;
  const crlf = text.includes(ACP_MCP_REBIND_NEEDLE_CRLF);
  const needle = crlf ? ACP_MCP_REBIND_NEEDLE_CRLF : ACP_MCP_REBIND_NEEDLE;
  const needleAt = text.indexOf(needle);
  if (needleAt < 0) return text;
  const nl = crlf ? "\r\n" : "\n";
  const extra =
    `            current_api_mode = None if provider_changed else getattr(state.agent, "api_mode", None)${nl}` +
    `            _omb_prev_enabled = list(getattr(state.agent, "enabled_toolsets", None) or [])${nl}` +
    `            _omb_prev_disabled = getattr(state.agent, "disabled_toolsets", None)${nl}` +
    `            state.agent = self.session_manager._make_agent(${nl}` +
    `                session_id=session_id,${nl}` +
    `                cwd=state.cwd,${nl}` +
    `                model=resolved_model,${nl}` +
    `                requested_provider=requested_provider,${nl}` +
    `                base_url=current_base_url,${nl}` +
    `                api_mode=current_api_mode,${nl}` +
    `            )${nl}` +
    `            self.session_manager.save_session(session_id)${nl}` +
    `            try:  # ${ACP_MCP_REBIND_MARK}${nl}` +
    `                from tools.mcp_tool import refresh_agent_mcp_tools, get_registered_mcp_server_names${nl}` +
    `                _omb_enabled = list(getattr(state.agent, "enabled_toolsets", None) or [])${nl}` +
    `                for _ts in _omb_prev_enabled:${nl}` +
    `                    if _ts not in _omb_enabled:${nl}` +
    `                        _omb_enabled.append(_ts)${nl}` +
    `                for _name in get_registered_mcp_server_names():${nl}` +
    `                    _ts = f"mcp-{_name}"${nl}` +
    `                    if _ts not in _omb_enabled:${nl}` +
    `                        _omb_enabled.append(_ts)${nl}` +
    `                refresh_agent_mcp_tools(${nl}` +
    `                    state.agent,${nl}` +
    `                    enabled_override=_omb_enabled,${nl}` +
    `                    disabled_override=_omb_prev_disabled,${nl}` +
    `                    quiet_mode=True,${nl}` +
    `                )${nl}` +
    `            except Exception:${nl}` +
    `                logger.debug("Session %s: MCP rebind after set_model skipped", session_id, exc_info=True)`;
  return text.slice(0, needleAt) + extra + text.slice(needleAt + needle.length);
}

/** Keep ACP-mounted computer tools after Hermes rebuilds the agent on set_model. */
export function ensureHermesAcpMcpRebind(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesAcpServerPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesAcpMcpRebindSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

/** Hermes 0.20.x tool_search — MCP tools are otherwise hidden behind the bridge. */
export function hermesToolSearchPyPath(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const path = join(resolveHermesHome(env), "hermes-agent", "tools", "tool_search.py");
  return existsSync(path) ? path : undefined;
}

const COMPUTER_TOOLS_EAGER_LINE = `if name.startswith("mcp__computer__") or name.startswith("vm_"):  # ${COMPUTER_TOOLS_EAGER_MARK}`;

/** Keep Cua computer tools on the model-facing list. Hermes defers every
 * `mcp-*` toolset the moment Composio (or any MCP server) is attached. Pure. */
export function patchHermesComputerToolsEagerSource(text: string): string {
  if (text.includes('name.startswith("vm_")') && text.includes(COMPUTER_TOOLS_EAGER_MARK)) return text;
  if (text.includes(COMPUTER_TOOLS_EAGER_MARK)) {
    const upgraded = text.replace(
      /if name\.startswith\("mcp__computer__"\):  # openmausbot-b24a-eager/,
      COMPUTER_TOOLS_EAGER_LINE,
    );
    return upgraded;
  }
  if (!text.includes("def is_deferrable_tool_name")) return text;
  const crlf = text.includes(COMPUTER_TOOLS_EAGER_NEEDLE_CRLF);
  const needle = crlf ? COMPUTER_TOOLS_EAGER_NEEDLE_CRLF : COMPUTER_TOOLS_EAGER_NEEDLE;
  const needleAt = text.indexOf(needle);
  if (needleAt < 0) return text;
  const nl = crlf ? "\r\n" : "\n";
  const extra = `    ${COMPUTER_TOOLS_EAGER_LINE}${nl}        return False${nl}`;
  const split = crlf
    ? "if name in BRIDGE_TOOL_NAMES:\r\n        return False\r\n"
    : "if name in BRIDGE_TOOL_NAMES:\n        return False\n";
  return text.slice(0, needleAt + split.length) + extra + text.slice(needleAt + split.length);
}

/** Surface computer tools (`mcp__computer__*` or `vm_*`) instead of hiding them in tool_search. */
export function ensureHermesComputerToolsEager(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesToolSearchPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesComputerToolsEagerSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

const BRIDGE_NO_CALL_NEEDLE =
  "    result = visible + bridge\n    # Tier 1 = per-tool listing for at least part of the catalog (full,";
const BRIDGE_NO_CALL_NEEDLE_CRLF = BRIDGE_NO_CALL_NEEDLE.replaceAll("\n", "\r\n");

/** Local-inject Granite treats Hermes' bridge tool named `tool_call` as
 * "the way to open a URL" and passes `{url}` with no `name`. Drop that
 * name from the model-facing array when the small catalog is granted;
 * `vm_open` stays eager. Composio stays listed via `tool_search`. Pure. */
export function patchHermesBridgeNoCallSource(text: string): string {
  if (text.includes(BRIDGE_NO_CALL_MARK)) return text;
  const crlf = text.includes(BRIDGE_NO_CALL_NEEDLE_CRLF);
  const needle = crlf ? BRIDGE_NO_CALL_NEEDLE_CRLF : BRIDGE_NO_CALL_NEEDLE;
  const needleAt = text.indexOf(needle);
  if (needleAt < 0) return text;
  const nl = crlf ? "\r\n" : "\n";
  const extra =
    `    result = visible + bridge${nl}` +
    `    try:  # ${BRIDGE_NO_CALL_MARK}${nl}` +
    `        import os as _omb_os${nl}` +
    `        if _omb_os.environ.get("OPENMAUSBOT_ACP_TOOLSETS"):${nl}` +
    `            result = [td for td in result if (td.get("function") or {}).get("name") != TOOL_CALL_NAME]${nl}` +
    `    except Exception:${nl}` +
    `        pass${nl}` +
    `    # Tier 1 = per-tool listing for at least part of the catalog (full,`;
  return text.slice(0, needleAt) + extra + text.slice(needleAt + needle.length);
}

/** Hide the `tool_call` bridge name from local-inject models. */
export function ensureHermesBridgeNoCall(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesToolSearchPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesBridgeNoCallSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

/** Hermes 0.20.x chat-completions dispatcher. */
export function hermesModelToolsPyPath(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const path = join(resolveHermesHome(env), "hermes-agent", "model_tools.py");
  return existsSync(path) ? path : undefined;
}

const BRIDGE_UNWRAP_NEEDLE =
  "        if function_name == _ts_mod.TOOL_CALL_NAME:\n            underlying_name, underlying_args, err = _ts_mod.resolve_underlying_call(function_args or {})";
const BRIDGE_UNWRAP_NEEDLE_CRLF = BRIDGE_UNWRAP_NEEDLE.replaceAll("\n", "\r\n");

/** If Granite still hits the bridge with `{url}` (or `name: vm_*`), unwrap
 * onto the eager computer tool. `vm_open` is not deferrable, so stock
 * resolve_underlying_call rejects it. Pure. */
export function patchHermesBridgeUnwrapSource(text: string): string {
  if (text.includes(BRIDGE_UNWRAP_MARK)) return text;
  const crlf = text.includes(BRIDGE_UNWRAP_NEEDLE_CRLF);
  const needle = crlf ? BRIDGE_UNWRAP_NEEDLE_CRLF : BRIDGE_UNWRAP_NEEDLE;
  const needleAt = text.indexOf(needle);
  if (needleAt < 0) return text;
  const nl = crlf ? "\r\n" : "\n";
  const extra =
    `        if function_name == _ts_mod.TOOL_CALL_NAME:${nl}` +
    `            try:  # ${BRIDGE_UNWRAP_MARK}${nl}` +
    `                _fa = function_args or {}${nl}` +
    `                _nm = str(_fa.get("name") or "").strip()${nl}` +
    `                _vis = {(td.get("function") or {}).get("name") for td in current_defs if isinstance(td, dict)}${nl}` +
    `                _eager = None${nl}` +
    `                _eargs = None${nl}` +
    `                if _nm.startswith("vm_") and _nm in _vis:${nl}` +
    `                    _raw = _fa.get("arguments")${nl}` +
    `                    if _raw is None:${nl}` +
    `                        _eargs = {k: v for k, v in _fa.items() if k != "name"}${nl}` +
    `                    elif isinstance(_raw, str):${nl}` +
    `                        try:${nl}` +
    `                            _raw = json.loads(_raw)${nl}` +
    `                        except Exception:${nl}` +
    `                            _raw = {}${nl}` +
    `                    if isinstance(_raw, dict) and _eargs is None:${nl}` +
    `                        _eargs = _raw${nl}` +
    `                    _eager = _nm${nl}` +
    `                elif not _nm:${nl}` +
    `                    _url = _fa.get("url")${nl}` +
    `                    if isinstance(_url, str) and _url.strip() and "vm_open" in _vis:${nl}` +
    `                        _eager = "vm_open"${nl}` +
    `                        _eargs = {"url": _url.strip()}${nl}` +
    `                if _eager and isinstance(_eargs, dict):${nl}` +
    `                    return handle_function_call(${nl}` +
    `                        function_name=_eager,${nl}` +
    `                        function_args=_eargs,${nl}` +
    `                        task_id=task_id,${nl}` +
    `                        tool_call_id=tool_call_id,${nl}` +
    `                        session_id=session_id,${nl}` +
    `                        turn_id=turn_id,${nl}` +
    `                        api_request_id=api_request_id,${nl}` +
    `                        user_task=user_task,${nl}` +
    `                        enabled_tools=enabled_tools,${nl}` +
    `                        skip_pre_tool_call_hook=skip_pre_tool_call_hook,${nl}` +
    `                        skip_tool_request_middleware=skip_tool_request_middleware,${nl}` +
    `                        skip_tool_execution_middleware=skip_tool_execution_middleware,${nl}` +
    `                        tool_request_middleware_trace=tool_request_middleware_trace,${nl}` +
    `                        enabled_toolsets=enabled_toolsets,${nl}` +
    `                        disabled_toolsets=disabled_toolsets,${nl}` +
    `                    )${nl}` +
    `            except Exception:${nl}` +
    `                pass${nl}` +
    `            underlying_name, underlying_args, err = _ts_mod.resolve_underlying_call(function_args or {})`;
  return text.slice(0, needleAt) + extra + text.slice(needleAt + needle.length);
}

/** Route a mistaken `tool_call({url})` onto `vm_open`. */
export function ensureHermesBridgeUnwrap(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesModelToolsPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesBridgeUnwrapSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

const COMPUTER_SHORT_NAMES_NEEDLE =
  "    safe_tool = sanitize_mcp_name_component(tool_name)\n    return f\"{MCP_TOOL_NAME_PREFIX}{safe_server}{_MCP_NAME_DELIM}{safe_tool}\"";
const COMPUTER_SHORT_NAMES_NEEDLE_CRLF = COMPUTER_SHORT_NAMES_NEEDLE.replaceAll("\n", "\r\n");

/** Hermes 0.20.x MCP prefix helper. */
export function hermesMcpToolPyPath(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const path = join(resolveHermesHome(env), "hermes-agent", "tools", "mcp_tool.py");
  return existsSync(path) ? path : undefined;
}

/** Register Cua `vm_*` tools under that short name instead of
 * `mcp__computer__vm_open`. Granite issues real ACP calls for `extract` /
 * `write_file`; the dunder prefix is what turned computer tools into chat JSON.
 * Pure; used by tests. */
export function patchHermesComputerShortNamesSource(text: string): string {
  if (text.includes(COMPUTER_SHORT_NAMES_MARK)) return text;
  if (!text.includes("def mcp_prefixed_tool_name")) return text;
  const crlf = text.includes(COMPUTER_SHORT_NAMES_NEEDLE_CRLF);
  const needle = crlf ? COMPUTER_SHORT_NAMES_NEEDLE_CRLF : COMPUTER_SHORT_NAMES_NEEDLE;
  const needleAt = text.indexOf(needle);
  if (needleAt < 0) return text;
  const nl = crlf ? "\r\n" : "\n";
  const extra =
    `    if safe_server == "computer" and safe_tool.startswith("vm_"):  # ${COMPUTER_SHORT_NAMES_MARK}${nl}` +
    `        return safe_tool${nl}`;
  const split = crlf
    ? "    safe_tool = sanitize_mcp_name_component(tool_name)\r\n"
    : "    safe_tool = sanitize_mcp_name_component(tool_name)\n";
  return text.slice(0, needleAt + split.length) + extra + text.slice(needleAt + split.length);
}

/** Stop Hermes prefixing Path A computer tools as `mcp__computer__*`. */
export function ensureHermesComputerShortNames(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesMcpToolPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesComputerShortNamesSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

const MCP_IMAGE_PARTS_NEEDLE = "            parts: List[str] = []\n            for block in (result.content or []):";
const MCP_IMAGE_PARTS_NEEDLE_CRLF = MCP_IMAGE_PARTS_NEEDLE.replaceAll("\n", "\r\n");
const MCP_IMAGE_TAG_NEEDLE =
  "                image_tag = _cache_mcp_image_block(block)\n                if image_tag:\n                    parts.append(image_tag)\n                    continue";
const MCP_IMAGE_TAG_NEEDLE_CRLF = MCP_IMAGE_TAG_NEEDLE.replaceAll("\n", "\r\n");
const MCP_IMAGE_TRUNCATE_NEEDLE = "            text_result = _truncate_mcp_text_result(text_result)\n";
const MCP_IMAGE_TRUNCATE_NEEDLE_CRLF = MCP_IMAGE_TRUNCATE_NEEDLE.replaceAll("\n", "\r\n");

/** Hermes 0.20.5 flattens MCP ImageContent to MEDIA:path. Return the same
 * `_multimodal` envelope vision_analyze already uses so Ollama gets pixels. */
export function patchHermesMcpImageEnvelopeSource(text: string): string {
  if (text.includes(MCP_IMAGE_ENVELOPE_MARK)) return text;
  const crlf = text.includes(MCP_IMAGE_TAG_NEEDLE_CRLF);
  const nl = crlf ? "\r\n" : "\n";
  const partsNeedle = crlf ? MCP_IMAGE_PARTS_NEEDLE_CRLF : MCP_IMAGE_PARTS_NEEDLE;
  const tagNeedle = crlf ? MCP_IMAGE_TAG_NEEDLE_CRLF : MCP_IMAGE_TAG_NEEDLE;
  const truncateNeedle = crlf ? MCP_IMAGE_TRUNCATE_NEEDLE_CRLF : MCP_IMAGE_TRUNCATE_NEEDLE;
  if (!text.includes(partsNeedle) || !text.includes(tagNeedle) || !text.includes(truncateNeedle)) return text;
  const py = (lines: string[]) => lines.join(nl);
  const urlsDecl = py([
    "            parts: List[str] = []",
    `            _omb_image_urls: List[str] = []  # ${MCP_IMAGE_ENVELOPE_MARK}`,
    "            for block in (result.content or []):",
  ]);
  const tagBlock = py([
    "                image_tag = _cache_mcp_image_block(block)",
    "                if image_tag:",
    '                    _omb_data = getattr(block, "data", None)',
    '                    _omb_mime = str(mcp_field(block, "mime_type", "mimeType") or "image/png").split(";", 1)[0].strip() or "image/png"',
    "                    if _omb_data:",
    '                        _omb_url = _omb_data if str(_omb_data).startswith("data:") else ("data:%s;base64,%s" % (_omb_mime, _omb_data))',
    "                        _omb_image_urls.append(_omb_url)",
    "                    else:",
    "                        parts.append(image_tag)",
    "                    continue",
  ]);
  const envelope =
    py([
      "            text_result = _truncate_mcp_text_result(text_result)",
      `            if _omb_image_urls:  # ${MCP_IMAGE_ENVELOPE_MARK}`,
      '                _omb_note = text_result.strip() or "Screenshot attached."',
      '                _omb_content = [{"type": "text", "text": _omb_note}]',
      "                for _omb_url in _omb_image_urls:",
      '                    _omb_content.append({"type": "image_url", "image_url": {"url": _omb_url}})',
      '                return {"_multimodal": True, "content": _omb_content, "text_summary": _omb_note}',
    ]) + nl;
  return text.replace(partsNeedle, urlsDecl).replace(tagNeedle, tagBlock).replace(truncateNeedle, envelope);
}

/** Keep MCP screenshots as pixels instead of MEDIA:path. */
export function ensureHermesMcpImageEnvelope(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesMcpToolPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesMcpImageEnvelopeSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

const LOCAL_CATALOG_NEEDLE =
  '    """Return ACP toolsets plus explicit MCP server toolsets for this session."""\n    expanded: List[str] = []\n    for name in list(toolsets or ["hermes-acp"]):';
const LOCAL_CATALOG_NEEDLE_CRLF = LOCAL_CATALOG_NEEDLE.replaceAll("\n", "\r\n");

/** Hermes 0.20.x ACP session expander — every ACP tool list goes through here. */
export function hermesAcpSessionPyPath(
  env: Record<string, string | undefined> = process.env,
): string | undefined {
  const path = join(resolveHermesHome(env), "hermes-agent", "acp_adapter", "session.py");
  return existsSync(path) ? path : undefined;
}

/** When `OPENMAUSBOT_ACP_TOOLSETS` is set, replace the hardcoded `hermes-acp`
 * default with those named toolsets (MCP names still append). Pure. */
export function patchHermesLocalCatalogSource(text: string): string {
  if (text.includes(LOCAL_CATALOG_MARK)) return text;
  if (!text.includes("def _expand_acp_enabled_toolsets")) return text;
  const crlf = text.includes(LOCAL_CATALOG_NEEDLE_CRLF);
  const needle = crlf ? LOCAL_CATALOG_NEEDLE_CRLF : LOCAL_CATALOG_NEEDLE;
  const needleAt = text.indexOf(needle);
  if (needleAt < 0) return text;
  const nl = crlf ? "\r\n" : "\n";
  const extra =
    `    override = os.environ.get("${LOCAL_HERMES_ACP_TOOLSETS_ENV}", "").strip()${nl}` +
    `    if override and "hermes-acp" in list(toolsets or ["hermes-acp"]):  # ${LOCAL_CATALOG_MARK}${nl}` +
    `        named = [n.strip() for n in override.split(",") if n.strip()]${nl}` +
    `        if named:${nl}` +
    `            toolsets = named + [n for n in list(toolsets or []) if n != "hermes-acp"]${nl}`;
  const split = crlf
    ? '    """Return ACP toolsets plus explicit MCP server toolsets for this session."""\r\n'
    : '    """Return ACP toolsets plus explicit MCP server toolsets for this session."""\n';
  return text.slice(0, needleAt + split.length) + extra + text.slice(needleAt + split.length);
}

/** Point ACP's tool expander at the small named toolsets for local-inject. */
export function ensureHermesLocalCatalog(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const path = hermesAcpSessionPyPath(env);
  if (!path) return false;
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return false;
  }
  const next = patchHermesLocalCatalogSource(text);
  if (next === text) return false;
  try {
    writeFileSync(path, next);
  } catch {
    return false;
  }
  return true;
}

/** Grant or revoke the local ACP toolset list on a child env. */
export function applyLocalHermesAcpToolsets(
  env: Record<string, string | undefined>,
  model?: string,
): void {
  if (!decodeInjectId(model)) {
    delete env[LOCAL_HERMES_ACP_TOOLSETS_ENV];
    return;
  }
  env[LOCAL_HERMES_ACP_TOOLSETS_ENV] = LOCAL_HERMES_ACP_TOOLSETS.join(",");
}

/** Git-for-Windows bash.exe, never WSL's `System32\\bash.exe`.
 *
 * Hermes `_find_bash` still probes this path; pinning it stops the probe from
 * falling through to WSL after a job-object timeout (Nous #80952). */
export function resolveHermesGitBashPath(
  env: Record<string, string | undefined>,
  platform: NodeJS.Platform = process.platform,
): string | undefined {
  if (platform !== "win32") return undefined;
  const pinned = env.HERMES_GIT_BASH_PATH;
  if (pinned && existsSync(pinned) && !isWslBashLauncher(pinned)) return pinned;
  const home = env.HOME || env.USERPROFILE || homedir();
  const local = env.LOCALAPPDATA || join(home, "AppData", "Local");
  const programFiles = env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  const candidates = [
    join(local, "hermes", "git", "bin", "bash.exe"),
    join(local, "hermes", "git", "usr", "bin", "bash.exe"),
    join(programFiles, "Git", "bin", "bash.exe"),
    join(programFilesX86, "Git", "bin", "bash.exe"),
    join(local, "Programs", "Git", "bin", "bash.exe"),
  ];
  return candidates.find((path) => existsSync(path));
}

/** The id used when Hermes should run on the provider its own config names.
 *
 * Deliberately not an inject id: `hermesAcpModelId` returns null for it, so
 * `configureSession` sends no `session/set_model` and Hermes falls through to
 * the model in its own `config.yaml`. `spawnArgs` passes no `-m` either (ACP
 * ignores it), so nothing overrides that choice.
 */
export const HERMES_CONFIG_MODEL_ID = "hermes-default";

function nonEmptyDotenvValue(text: string, name: string): string | null {
  const match = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=[ \\t]*([^\\r\\n]*)$`, "m").exec(text);
  if (!match) return null;
  const raw = match[1].trim();
  if (!raw || raw.startsWith("#")) return null;
  const quote = raw[0];
  if (quote === '"' || quote === "'") {
    const closing = raw.indexOf(quote, 1);
    if (closing < 0) return null;
    const trailing = raw.slice(closing + 1).trim();
    if (trailing && !trailing.startsWith("#")) return null;
    return raw.slice(1, closing).trim() || null;
  }
  return raw.replace(/[ \t]+#.*$/, "").trim() || null;
}

const HERMES_HOSTED_PROVIDER_KEYS = [
  "OPENROUTER_API_KEY",
  "GLM_API_KEY",
  "ZAI_API_KEY",
  "Z_AI_API_KEY",
] as const;

const HERMES_LOCAL_CONFIG_PROVIDERS = new Set(["custom", "lmstudio", "ollama", "vllm", "llamacpp"]);

function yamlString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Read the model/provider forms accepted by Hermes' `_normalize_root_model_keys`:
 * a scalar `model`, or a mapping whose id is `default`, `model`, or `name`.
 * Those id fields may themselves be `{ provider, model/default }` mappings.
 * An explicit outer provider wins, except `auto`, where the nested provider is
 * the more specific routing choice. Root-level `provider` is Hermes' legacy
 * fallback. YAML parsing also handles quotes and trailing comments correctly.
 */
function hermesConfigDefault(text: string): { model: string; provider: string } | null {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch {
    return null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const config = raw as Record<string, unknown>;
  const rootProvider = yamlString(config.provider);
  if (typeof config.model === "string") {
    const model = config.model.trim();
    return model ? { model, provider: rootProvider } : null;
  }
  if (!config.model || typeof config.model !== "object" || Array.isArray(config.model)) return null;

  const modelConfig = config.model as Record<string, unknown>;
  const outerProvider = yamlString(modelConfig.provider) || rootProvider;
  for (const key of ["default", "model", "name"] as const) {
    const candidate = modelConfig[key];
    const scalar = yamlString(candidate);
    if (scalar) return { model: scalar, provider: outerProvider };
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) continue;
    const nested = candidate as Record<string, unknown>;
    const nestedModel = yamlString(nested.model) || yamlString(nested.default);
    if (!nestedModel) continue;
    const nestedProvider = yamlString(nested.provider);
    const provider = !outerProvider || outerProvider === "auto" ? nestedProvider || outerProvider : outerProvider;
    return { model: nestedModel, provider };
  }
  return null;
}

/** Detect whether Hermes has a hosted provider configured.
 *
 * Hermes supports multiple auth methods:
 * - OpenRouter API key in `~/.hermes/.env` (OPENROUTER_API_KEY)
 * - Nous Portal OAuth (tokens stored in `~/.hermes/` — the default for
 *   `hermes setup` / `hermes login`)
 * - Z.AI / GLM keys in `~/.hermes/.env`
 *
 * Previously only OPENROUTER_API_KEY was checked, so a Nous Portal user
 * — logged in via OAuth, no OpenRouter key — saw "No local models found"
 * despite Hermes being installed, authenticated, and serving 100+ models.
 *
 * Read-only on purpose. `ensureHermesInjectProvider` writes `config.yaml`,
 * and doing that from a catalog probe would rewrite the user's real Hermes
 * config as a side effect of opening a menu.
 *
 * Returns null when no hosted provider is configured, which leaves the
 * catalog exactly as it was for local-only setups.
 */
export function hermesConfiguredModel(
  env: Record<string, string | undefined> = process.env,
): { id: string; label: string; custom: true } | null {
  const dir = hermesHome(env);
  let secrets = "";
  try {
    secrets = readFileSync(join(dir, ".env"), "utf8");
  } catch {
    /* .env may not exist — check OAuth below */
  }

  const hasHostedProviderKey = HERMES_HOSTED_PROVIDER_KEYS.some((name) => nonEmptyDotenvValue(secrets, name));

  // `hermes login` / `hermes setup` records the selected default in
  // config.yaml while the OAuth token lives in Hermes' auth store. An explicit
  // local/custom provider must not trigger the hosted catalog probe.
  let configuredDefault: { model: string; provider: string } | null = null;
  try {
    configuredDefault = hermesConfigDefault(readFileSync(join(dir, "config.yaml"), "utf8"));
  } catch {
    /* config may not exist or may be unreadable */
  }

  const configuredProvider = configuredDefault?.provider.toLowerCase() ?? "";
  // The model/provider selected in config.yaml is the user's explicit routing
  // choice. A stale hosted key must not override an explicitly local setup.
  const configIsLocal =
    HERMES_LOCAL_CONFIG_PROVIDERS.has(configuredProvider) || configuredProvider.startsWith("custom:");
  if (configuredDefault && configIsLocal) return null;

  const configIsHosted = configuredDefault !== null;
  if (!hasHostedProviderKey && !configIsHosted) return null;

  const model = configuredDefault?.model ?? "";
  // `custom: true` is not cosmetic. ModelPicker renders a custom-only agent's
  // *custom* pane exclusively, and that pane lists only options carrying this
  // flag; anything without it lands in the "official" bucket the pane never
  // shows. Omitting it puts the option in the API response while leaving the
  // picker saying "No local models found" — present, but unselectable.
  return {
    id: HERMES_CONFIG_MODEL_ID,
    label: model ? `${model} (Hermes config)` : "Hermes default (config)",
    custom: true as const,
  };
}

/** Ask a short-lived `hermes acp` session what models it can actually run.
 *
 * Hermes advertises its full catalog on `session/new` — every model its
 * configured providers expose, ids shaped `openrouter:qwen/qwen3.8-max`. There
 * is no `hermes models` subcommand, so a throwaway session is the only way to
 * read it, and it is worth the spawn: without it the picker can only offer
 * locally injected hosts, which is a fraction of what the user is paying for.
 *
 * Failure is non-fatal and returns [] — a catalog probe must never be the
 * reason an agent becomes unselectable.
 */
async function fetchHermesAcpModels(
  cli: string,
  env: Record<string, string | undefined>,
): Promise<{ id: string; label: string; custom: true }[]> {
  return await new Promise((resolve) => {
    let child: ReturnType<typeof spawn>;
    try {
      child = spawn(cli, ["acp"], { stdio: ["pipe", "pipe", "ignore"], env: env as NodeJS.ProcessEnv });
    } catch {
      return resolve([]);
    }
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let hardKillTimer: ReturnType<typeof setTimeout> | undefined;
    const done = (out: { id: string; label: string; custom: true }[]) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try {
        if (child.kill()) {
          hardKillTimer = setTimeout(() => {
            try {
              child.kill("SIGKILL");
            } catch {
              /* already gone */
            }
          }, 1_000);
          hardKillTimer.unref?.();
        }
      } catch {
        /* already gone */
      }
      resolve(out);
    };
    timer = setTimeout(() => done([]), 5_000);
    child.once("error", () => done([]));
    child.once("close", () => {
      if (hardKillTimer) clearTimeout(hardKillTimer);
      done([]);
    });

    let buf = "";
    let id = 0;
    const send = (method: string, params: unknown) => {
      id += 1;
      try {
        if (!child.stdin?.writable) {
          done([]);
          return 0;
        }
        child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`, (error) => {
          if (error) done([]);
        });
      } catch {
        done([]);
        return 0;
      }
      return id;
    };
    let initId = 0;
    let sessionId = 0;
    child.stdout?.on("data", (chunk) => {
      buf += String(chunk);
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 1);
        let msg: any;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg?.id === initId) {
          if (!msg.result) return done([]);
          sessionId = send("session/new", { cwd: env.HOME || env.USERPROFILE || homedir(), mcpServers: [] });
        } else if (sessionId && msg?.id === sessionId) {
          const list = Array.isArray(msg.result?.models?.availableModels)
            ? msg.result.models.availableModels
            : [];
          done(
            list
              .filter((m: any) => typeof m?.modelId === "string" && m.modelId)
              .map((m: any) => ({
                id: m.modelId as string,
                // Hermes labels these "OpenRouter · <model>"; keep its wording.
                label: (typeof m.name === "string" && m.name.trim()) || (m.modelId as string),
                custom: true as const,
              })),
          );
        }
      }
    });
    initId = send("initialize", {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    });
  });
}

async function resolveModels(
  env: Record<string, string | undefined>,
  config?: { cli?: string },
): Promise<ModelCatalog> {
  const catalog = await mergeLocalInject(EMPTY, env);
  const configured = hermesConfiguredModel(env);
  // Only probe when a hosted provider is configured; a local-only install has
  // nothing to gain from the spawn.
  const remote = configured ? await fetchHermesAcpModels(config?.cli || "hermes", env) : [];
  const seen = new Set<string>();
  const options = [...(configured ? [configured] : []), ...remote, ...catalog.options].filter((o) => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });
  return { default: options[0]?.id ?? "", options };
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
  windowsDetachedSpawn: true,
  transformEnv: (env) => {
    // A leftover OPENAI_API_KEY makes Hermes auto-resolve to OpenRouter and
    // send no Authorization header. ACP also reloads ~/.hermes/.env, so the
    // named custom provider + session/set_model is the real route.
    delete env.OPENAI_API_KEY;
    delete env.OPENROUTER_API_KEY;
    // Same directory we just wrote providers + model.provider into. Without
    // this, Windows hermes.exe still follows the installer HERMES_HOME while
    // we used to write ~/.hermes, and session/new never saw the selection.
    env.HERMES_HOME = resolveHermesHome(env);
    const gitBash = resolveHermesGitBashPath(env);
    if (gitBash) env.HERMES_GIT_BASH_PATH = gitBash;
    delete env[LOCAL_HERMES_ACP_TOOLSETS_ENV];
    ensureHermesBashProbeClosesStdin(env);
    ensureHermesComputerDisablesWeb(env);
    ensureHermesAcpMcpWait(env);
    ensureHermesAcpMcpRebind(env);
    ensureHermesComputerToolsEager(env);
    ensureHermesBridgeNoCall(env);
    ensureHermesBridgeUnwrap(env);
    ensureHermesComputerShortNames(env);
    ensureHermesMcpImageEnvelope(env);
    ensureHermesLocalCatalog(env);
  },
  applyTurnEnv: (env, { model, requestedModel }) => {
    applyLocalHermesAcpToolsets(env, requestedModel ?? model);
  },
  pickAuthMethod: () => null,
  authFailure: "continue",
  isAuthenticated: () => true,
  // LoadSessionResponse always includes `models`. `{}` is a miss — Hermes
  // returns None from load_session, the ACP SDK serializes that as success.
  sessionLoadLived: (result) => result != null && typeof result === "object" && "models" in result,
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
