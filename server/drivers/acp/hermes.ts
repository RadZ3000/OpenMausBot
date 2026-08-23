// Hermes Agent — Nous Research's `hermes acp` CLI. Custom-only: Hermes is
// a BYOK/local harness. ACP ignores `hermes -m` (cmd_acp does not forward
// it), and setting OPENAI_API_KEY makes provider:auto resolve to OpenRouter
// without an OpenRouter key — that is the "HTTP 401: Missing Authentication
// header" failure. Inject writes providers.<host>, selects model.provider,
// and session/set_model `custom:<host>:<model>`. `session/new` reads the
// selected provider before set_model can arrive.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ModelCatalog } from "../../contracts.ts";
import { decodeInjectId, hostApiKey, localHost, mergeLocalInject } from "../local-inject.ts";
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
 * `provider: "auto"` in place — session/new still saw auto. */
function upsertHermesModelProvider(text: string, hostId: string): string {
  const quoted = quoteYaml(hostId);
  const lines = yamlLines(text);
  const starts: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i] === "model:") starts.push(i);
  }
  if (starts.length === 0) {
    const prefix = `model:\n  provider: ${quoted}\n`;
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
    let providerAt = -1;
    for (let i = modelStart + 1; i < modelEnd; i++) {
      if (/^  provider:\s*/.test(lines[i]!)) {
        providerAt = i;
        break;
      }
    }
    if (providerAt >= 0) lines[providerAt] = `  provider: ${quoted}`;
    else lines.splice(modelStart + 1, 0, `  provider: ${quoted}`);
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
