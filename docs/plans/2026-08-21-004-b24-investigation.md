# B-24 investigation

Status: **in progress — no real-CLI loop yet.** Written 2026-08-21.
Defect: [`docs/known-bugs.md`](../known-bugs.md) B-24.
Handoff order: [`2026-08-21-001-local-path-handoff.md`](2026-08-21-001-local-path-handoff.md) §4.

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
