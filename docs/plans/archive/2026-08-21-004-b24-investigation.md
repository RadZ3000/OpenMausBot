# B-24 investigation

Status: **(b) fixed; (a) Granite issues `vm_open`; compact-computer-mcp binds Cua's existing Chromium (image layer 7: Chromium + `--grant existing-profile`).** Written 2026-08-21.
Defect: [`docs/known-bugs.md`](../../known-bugs.md) B-24.
Current snapshot: [`docs/agent-status.md`](../../agent-status.md).
Walk log: [`2026-08-21-005-path-a-live-walk.md`](2026-08-21-005-path-a-live-walk.md).

## check-upstream-first

Fetched `upstream/main` 2026-08-21; this branch was **0 commits behind**.
Upstream has no Hermes local-path MCP fix. Their MCP work is Claude/Codex
comms and computer mounts, not this bug.

## What we can already prove from our code

ACP `session/new` only attaches MCP servers the turn actually mounted
(`server/drivers/acp/core.ts` `acpMcpServers`):

| Server | Mounted when |
|---|---|
| `agents` | `agentsMcp` **and** at least one other visible bot (`index.ts` ~1660) |
| `composio` | bot has not turned it off **and** a key is configured |
| `computer` | Local VM / box / VPS, or host Cua. Host Auto is **darwin-only** (`shouldMountLocalComputer`) |
| `image` | image-gen configured and the bot did not turn it off |

A Windows Path A first-run with **one** Hermes bot, no Composio key, and the
VM skipped therefore sends `mcpServers: []`. B-24(a) ("our MCP servers
suppress tool calls") is the **multi-bot / connected-apps / VM** path, not
the empty first-run path.

The original B-24(a) wire snippet already had `"name":"agents"`, so that
machine had another bot. This box has no Hermes install
(`%LOCALAPPDATA%\hermes` missing) and no `hermes.acp` native log.

## What Hermes's own source says (main, 2026-08-21)

**B-24(b) log line** is `tools/file_tools.py` just before
`_create_environment(...)`:

```
Creating new %s environment for task %s...
```

The observed `Creating new local environment for task default` means
`env_type=local`, `task_id=default`. It is their terminal/file sandbox
layer, not our MCP proxy. `hermes -z` did not hit it; ACP did. After
that log they call `_create_environment`; the matching "environment
ready" line never arrived in the 2026-08-20 probe.

**B-24(a) MCP path** is `acp_adapter/server.py`
`_register_session_mcp_servers`: `asyncio.to_thread(register_mcp_servers)`
then rebuild `state.agent.tools` with `_expand_acp_enabled_toolsets`.
Empty `mcp_servers` returns immediately. First-party issues
[#14986](https://github.com/NousResearch/hermes-agent/issues/14986) and
[#87559](https://github.com/NousResearch/hermes-agent/issues/87559)
describe ACP MCP tools not reaching the catalog — adjacent, not a proof
that attaching MCP *drops file tools*.

## Hypotheses (ranked, with a prediction each)

1. **Path A first-run is (b), not (a).** One-bot Windows `session/new` has
   no MCP. If X is true, a native dump of that turn shows `mcpServers: []`
   and Hermes still logs the local-environment create then hangs.
2. **(a) is schema bloat / truncation once any large MCP is attached**
   (Composio or Cua computer), not the three `agents` tools. If X is true,
   attaching only `agents` still issues a file tool; attaching `computer`
   or `composio` does not; Ollama `prompt_eval_count` is far below the
   prompt size.
3. **(a) is MCP registration mutating the ACP tool list** so `read_file`
   disappears. If X is true, the Hermes log
   `refreshed tool surface after ACP MCP registration (N tools)` has no
   file tool, and a dump of `state.agent.tools` after register lacks it.
4. **(b) is `_create_environment(local)` blocking on Windows** (cwd, HOME,
   Python, a lock). If X is true, a tiny `hermes acp` client with
   `mcpServers: []` hangs at the same log; `hermes -z` in the same cwd
   returns; `TERMINAL_ENV=local` is already set.
5. **(b) is an unanswered ACP server request** (`session/request_permission`
   or something we `-32601`). If X is true, the native tee shows a
   server→client request with no matching client result before the hang.

## Feedback loop we do not have yet

Diagnosing-bugs wants one command that drives the real path and asserts
the symptom. That command is the real `hermes acp` binary plus Granite.

**2026-08-21 later:** Path A on this box *did* install Hermes and Granite in a
throwaway `OMB_DATA_DIR`. The B-24 turn was **not** sent (Local VM skipped;
checkpoint). Next agent: Continue, prompt `what's in this folder`, read
`OMB_DATA_DIR/native/<threadId>.ndjson` and the Hermes log. Full walk:
[`2026-08-21-005-path-a-live-walk.md`](2026-08-21-005-path-a-live-walk.md).

Do not mock `child_process`. Do not point a test at real `~/.openmausbot`.

## 2026-08-22 NSIS walk — (a) is now measured with the VM

Path A finished (Ollama, Granite, Hermes, virt, Podman). Bot `computer: "vm"`.
User asked Hermes to open clashofclicks.com. Reply was a refusal plus a
**hallucinated** clicker-game homepage. The real site is a retro handheld shop.

Native tee (`~/.openmausbot/native/<thread>.ndjson`, Hermes 0.20.5):

- `session/new` `mcpServers`: `composio` (connector-proxy) **and** `computer`
  (`container-mcp.js` → `podman` `openmausbot-computer`). Not empty.
- `session/prompt` includes the Cua sandbox instructions.
- **No** `tool_call` / permission request. Events file is assistant text only.
- Task usage: **input 8196 / output 417**.

Owned Ollama context is `DEFAULT_CONTEXT_TOKENS` **8192**
(`server/local-runtime.ts`). Input tokens ≈ the window.

Hermes on this machine already expands ACP MCP toolsets
(`acp_adapter/session.py` `_expand_acp_enabled_toolsets` → `mcp-computer`,
`mcp-composio`). `%LOCALAPPDATA%\hermes\cache\mcp_schema_cache.json` has
**60 computer tools** plus **7 Composio** tools (~56 KB of schema JSON).
`mcp-stderr.log` shows both MCP servers started (cua-driver 0.20.0).

So (a) on this path is not “MCP failed to spawn” and not the old
`enabled_toolsets=["hermes-acp"]` hole (#14986, fixed in this Hermes).
It is **schema vs 8k context**: Cua’s tool catalog does not fit, Granite
never issues a tool call, and the system prompt still talks about a
desktop, so the model invents the page.

Hypothesis 1 (first-run is (b) with empty `mcpServers`) is **false** for
Path A once Local computer is on. (b) is still open for a turn with
`mcpServers: []`.

### Ranked next probes

1. **Context overflow.** If X is true, a turn with `computer: none` (and
   ideally no Composio) on the same Granite/8k window *does* call a file
   tool; restoring the VM without raising context does not.
2. **Composio is noise, Cua is the payload.** If X is true, VM-only MCP
   still fills the window (60 tool descriptions); dropping Composio is
   not enough.
3. **Raise `OLLAMA_CONTEXT_LENGTH` on comfortable RAM.** If X is true,
   16k/32k makes `launch_app` / `browser_navigate` appear in a native
   tee. Cost: KV cache on a 16 GB box that also runs a 6 GiB Podman
   guest — measure RSS before making this the default.
4. **(b) hang** still needs `mcpServers: []` + `what's in this folder`
   against a throwaway cwd, not the production data dir.

## 2026-08-22 probes (live Pebble, Hermes 0.20.5)

Prompt: list workspace files **using a file tool**; auto-allow edit cards;
interrupt at 180s. Throwaway runner, then deleted. Restored `computer: vm`
and `composio: true`.

| Probe | MCP on `session/new` | Tool call? | After allow | Hermes `inputTokens` / `used` |
|---|---|---|---|---|
| Morning clashofclicks | `composio,computer` | **none** (prose) | n/a | ACP stop `4098` in / `405` out (app usage said 8196) |
| Accidental send (patch JSON eaten) | `composio,computer` | none | n/a | `8196` in / `104` out, `end_turn` ~18s |
| **P1** `computer:off` `composio:false` | `(empty)` | **yes** `write_file` → Windows `MEMORY.md` (invented listing) | allow_once in 1s, then **silence until cancel** | `used` 10529 |
| **P2** `computer:vm` `composio:false` | `computer` | **yes** `write_file` → `/home/cua/workspace/MEMORY.md` (invented listing) | same hang | `used` 12204 |

Both hangs end on interrupt with Hermes `-32603` `'NoneType' object has no attribute 'startswith'`. Permission was **not** left unanswered.

Conclusions:

- **(a) is not “any MCP ⇒ zero tool calls.”** Empty MCP and computer-only both
  produced a `write_file` when the prompt demanded a file tool. The morning
  homepage prompt with both MCPs did not. Granite still did not use
  `browser_navigate` / `launch_app`; it wrote a fake listing into MEMORY.md.
- **(b) is the live hang:** after `allow_once`, `write_file` does not return.
  Same on Windows workspace path and on the Cua Linux path. Next: Hermes
  `write_file` / `_create_environment` after ACP approval, not a context bump.
- Do **not** raise `OLLAMA_CONTEXT_LENGTH` until (b) is settled; extra context
  will not finish a stuck write.
- Probe 3 (RSS / bigger context) **not run**.

## 2026-08-22 evening — (b) is Hermes Git Bash inside a Win32 job

P1 allow→cancel was **174s**, matching `terminal.timeout: 180` in
`%LOCALAPPDATA%\hermes\config.yaml`. `MEMORY.md` was unchanged, so
`_atomic_write` (`cat > tmp` via Git Bash) never finished.

Hermes 0.20.5 `_bash_starts` (`tools/environments/local.py`) still uses
`subprocess.run(..., timeout=15, capture_output=True)` with inherited stdin.
That is Nous [#80952](https://github.com/NousResearch/hermes-agent/issues/80952)
/ [#73403](https://github.com/NousResearch/hermes-agent/issues/73403): when
`hermes acp` is a descendant of a desktop host (Buzz, Electron) that places
children in a Win32 job, the MSYS `true`/`cat` probe deadlocks in
`communicate()` after kill. PR
[#69083](https://github.com/NousResearch/hermes-agent/pull/69083)
(`bounded_captured_run`) is **not** in 0.20.5.

Measured on this box:

- Every `OpenMausBot.exe` (main, GPU, renderer, `node.mojom.NodeService`)
  reports `IsProcessInJob=true`.
- Git Bash probe *outside* a job: **74ms**, exit 0.
- `HERMES_GIT_BASH_PATH` was already `C:\Program Files\Git\bin\bash.exe`;
  pinning it does not skip `_bash_starts`. Portable Git under
  `%LOCALAPPDATA%\hermes\git` is absent. `where bash` is WSL
  (`System32\bash.exe`).
- A runtime-compiled trampoline exe in `%TEMP%` is blocked by Application
  Control — do not ship csc.exe helpers.

`NoneType.startswith` on `session/cancel` is Hermes
`acp_adapter/server.py` ~2168 (`final_response` is None). Interrupt symptom,
not the hang.

In-tree mitigation (does not wait for a Hermes upgrade): spawn `hermes acp`
with `detached: true` on Windows so libuv does not `AssignProcessToJobObject`,
and pin `HERMES_GIT_BASH_PATH` to Git-for-Windows so a failed probe cannot
select WSL bash. `procs.ts` is left byte-identical to upstream.

## 2026-08-22 packaged overlay — `detached` is not enough

NSIS 0.1.27 overlay with `windowsDetachedSpawn: true` still hung. Mid-allow
dump of the live tree:

- Parent of `hermes.EXE acp` is `OpenMausBot.exe` `node.mojom.NodeService`.
- hermes, both Python wrappers, and Git Bash report `IsProcessInJob=true`.
- Stuck command is exactly `_bash_starts`:
  `bash.exe --noprofile --norc -c "/usr/bin/true; /usr/bin/cat --version >/dev/null"`
  still running 8s later (the 15s `subprocess.run` timeout never returns).

Chromium's job does not honour libuv `CREATE_BREAKAWAY_FROM_JOB` here, so
`detached: true` only skips libuv's own nested job.

**Fix that landed:** `ensureHermesBashProbeClosesStdin` inserts
`stdin=subprocess.DEVNULL  # openmausbot-b24` into installed
`%LOCALAPPDATA%\hermes\hermes-agent\tools\environments\local.py` (same as
Nous PR #69083's DEVNULL). Hermes `_run_bash` already used DEVNULL; only the
probe inherited ACP stdin. After that patch, empty-MCP `write_file` → allow
→ `MEMORY.md` on disk in **~5s**, `stopReason: end_turn` at 16:11:16Z (was
interrupt at ~180s). Keep `detached` + git-bash pin; they are not harmful.

## 2026-08-22 (a) — fewer Cua tools for local models

P2 already showed computer MCP does not *delete* file tools. Homepage
turns with 60 Cua schemas plus Composio still produced prose and
`inputTokens ≈ 8192`. Plan 005 / `docs/local-model-path.md`: expose fewer
tools to a local model rather than grow KV cache on a 16 GB box that also
runs the VM.

`compact-computer-mcp` is a new spawn in front of upstream `container-mcp`
(fingerprint includes args, so Hermes' schema cache misses). Allowlist is
launch/list/click/type plus the browser_* tools, with one-line blurbs.
`wrapComputerMcpForLocalModel` runs only when `decodeInjectId(model)` is
set. Compact catalog confirmed on this box (Hermes cache fingerprint
`4881e5595950492c`, 12 short tools). First live URL turn after the wrap
called Hermes native `extract` on example.com and quoted **Example Domain**
— real fetch, not a hallucination, but not the VM browser. Prompt now
tells Cua-backed computers to use `browser_navigate` / `launch_app` and
not extract. Hermes' own `browser_navigate` description tells the model
to prefer `web_extract`, so a prompt nudge is not enough: ACP
`_register_session_mcp_servers` now adds `web` and `browser` to
`disabled_toolsets` when an MCP server is named `computer`
(`ensureHermesComputerDisablesWeb`, marker `openmausbot-b24a`). Native
host Chromium and `extract` drop; Cua `mcp__computer__browser_navigate`
stays. A follow-up turn then wrote `**browser_navigate** https://example.com`
as markdown; naming the `mcp__computer__*` wire ids in the prompt made
Granite emit JSON as assistant text instead of a tool call. Do not put
those ids in the prompt. Computer tools are now eager
(`ensureHermesComputerToolsEager` / `openmausbot-b24a-eager`) so they
stay in the model-facing tools array while Composio stays behind
`tool_search`. Granite still did not issue those as ACP `tool_call`s: the
model-facing names were `mcp__computer__browser_navigate`, while the
calls that *do* work (`extract`, `write_file`) are short Hermes-native
names. Compact now rewrites the twelve tools to `vm_open` / `vm_launch`
/ … and maps `tools/call` back to Cua; Hermes
`mcp_prefixed_tool_name` returns those `vm_*` names unprefixed
(`ensureHermesComputerShortNames`, marker `openmausbot-b24a-short`).
`--wire=vm` on the compact spawn busts Hermes' schema cache. Do not put
`vm_open` or `mcp__computer__*` in the prompt.

**Live probe 2026-08-22 after short names:** `session/new` computer args
include `compact-computer-mcp.js` + `--wire=vm`. Hermes cache fingerprint
`0b9eb36c142d0365` lists the twelve `vm_*` tools (unprefixed). Fresh-task
URL turn still produced **zero** `tool_call`s — Granite refused in prose
("I don't have the ability to launch web browsers") in ~16s, `used ≈ 13847`
against owned Ollama 8192. Plumbing is on the extract/write_file channel;
the remaining miss is the 3B window, not the wire name.

**Local catalog (in tree, not yet live-probed):** ACP always started from
the `hermes-acp` editor bundle. Local-inject turns now set
`OPENMAUSBOT_ACP_TOOLSETS=file,terminal` on the child env
(`applyTurnEnv`); `_expand_acp_enabled_toolsets` swaps that in for
`hermes-acp` (marker `openmausbot-b24a-catalog`) and still appends
`mcp-*`. Cloud Hermes is unchanged. `config.yaml` is not rewritten.

**Live probe 2026-08-22 after the catalog swap:** same URL prompt, computer
on, Composio on, fresh task. `used ≈ 5018` (was ≈ 13847) against owned
8192 — the window holds. Still **zero** `tool_call`s: Granite refused in
prose ("I don't have a way to launch a browser from within this chat")
in ~18s. Catalog size is settled; the remaining miss is the model not
issuing `vm_open`.

## 2026-08-22 — why it never called `vm_open`

Two stacked drops, both measured on Pebble (`computer: vm`, Composio on,
Granite `ibm/granite4.1:3b`, 8192 left alone).

1. **`session/set_model` dropped the MCP snapshot.** ACP order is
   `session/new` → `configureSession`/`session/set_model` →
   `session/prompt`. Hermes `_make_agent` rebuilds from
   `OPENMAUSBOT_ACP_TOOLSETS=file,terminal` and does not rebind
   `mcp-computer`. A dump of the Ollama request had six names
   (`patch`…`write_file`) and no `vm_open`. Direct Ollama with the same
   prompt and `vm_open` on the wire *does* call it. Fix:
   `ensureHermesAcpMcpRebind` (`openmausbot-b24a-rebind`) plus the
   existing MCP wait (`openmausbot-b24a-mcpwait`). After rebind the
   Ollama dump is 21 names including `vm_open`.

2. **Hermes named a bridge tool `tool_call`.** Composio/agents stay
   deferred, so `tool_search` / `tool_describe` / `tool_call` sit next
   to `vm_open`. Granite invoked `tool_call` with
   `{url: "https://example.com"}` (native tee
   `3bac4014-d259-4b1b-8d6f-6841b306d1f1`). Stock Hermes replies
   `tool_call requires a 'name' argument`. Local-inject now drops
   `tool_call` from the model-facing array
   (`ensureHermesBridgeNoCall`, `openmausbot-b24a-nocall`) and unwraps
   a nameless `{url}` onto `vm_open` if the name is still present
   (`ensureHermesBridgeUnwrap`, `openmausbot-b24a-unwrap`).

**Live probe after both:** Ollama dump is 20 names (`vm_open` present,
`tool_call` absent). Native ACP: `vm_open({url})` then `vm_ready` then
`vm_launch({name: xdg-open, urls: [https://example.com]})`. Cua
`vm_open` still errors `the browser operation requires an explicit
session`; `vm_launch` returned "Opened 1 URL(s) via xdg-open."

**Facade (in tree):** `openVisibleUrl` in `compact-computer-open.ts`
follows Cua 0.20.0's bind contract: `start_session` with a **fresh**
public label (ended names such as `omb` stay `session_unavailable` on
this transport; `browser_navigate` refuses the implicit session),
`list_apps`, launch Chromium by `launch_path` if needed, `list_windows`
`{}` and bind the frontmost on-screen Chromium (`z_index`, not
`list_apps.windows[0]` / first window for a pid), `browser_prepare` with `strategy.kind=existing_profile`,
`get_browser_state` bind, then `browser_navigate` with the minted ids, then
`get_window_state` on that window so the model sees the tree. `vm_window`
with `{}` fills the same pid/window_id. Model-facing `vm_open` schema is
`{url}` only (`--wire=vm-look-3`). `launch_app` URL args take the same path so
xdg-open cannot open Firefox. Image layer **7** installs Debian `chromium`,
sets nested-container Chromium flags (`--no-sandbox`), and starts
`cua-driver serve --grant existing-profile` so standard mode may attach.
Cua's isolated-profile launch (`allow_launch` + `isolated_new`) SIGTRAPs in
this nested WSL2/Podman VM and is not used. Firefox ESR has no typed
browser route (`browser_route_unavailable`).

Do not ship a runtime `csc.exe` trampoline (Application Control blocked it).
