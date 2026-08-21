# Handoff: the local-model path, 2026-08-21

Written at the end of a long session on one machine, for whoever picks this up on
another. Assume the next machine has **none** of the setup below installed.

Read in this order: this file, then
[`docs/local-model-path.md`](../local-model-path.md) (the standing register of
design decisions), then [`docs/known-bugs.md`](../known-bugs.md) (defects, ids
B-01…B-24), then
[plan 005](2026-08-20-005-three-path-first-run-plan.md) (what the arm is for).

## 0. First: nothing is committed

Branch `merge/upstream-0.1.27`, last commit `3bdfff1`. Everything from the
session is **uncommitted working-tree state** — roughly 16 modified files and 16
new ones. On a different machine you will need that work pushed or transferred
first; none of it exists anywhere else.

Two notes on the diff. `electron/vendor/electron-updater.cjs` shows as modified
after any `pnpm package:win` — it is a build output and the change is only
LF→CRLF, so `git checkout --` it. And `pnpm lint` exits non-zero on a clean
checkout for reasons that predate this work ([B-10](../known-bugs.md)); compare
against the upstream baseline for a file rather than trusting the count.

## 1. The story in one paragraph

The product's "run a model on this computer" path did not work. Over one session
it looked, in turn, like a small-model quality problem, a tool-count problem, a
context-length problem and an agent-CLI problem. **It was none of those.** The
model is fine: `ibm/granite4.1:3b` produced correct tool calls **18 times out of
18** when addressed directly, and issued a proper tool call through Hermes over
ACP. Every failure so far has traced to plumbing, and most of the plumbing is
ours.

## 2. The fault chain

**Fixed, with tests, in the working tree**

| Id | What | Where |
|---|---|---|
| B-13 | Qwen Code could not launch on Windows — `.cmd` shim forms our resolver did not recognise, ending in `spawn EINVAL` | `server/env-path.ts`, `server/env-path.test.ts` |
| B-14 | Qwen Code demanded a cloud login for a local model — the driver wrote a provider but never selected one | `server/drivers/acp/qwen.ts` |

**Confirmed by hand, not yet fixed in code — start here**

| Id | What |
|---|---|
| B-23 | The Hermes driver has the *same* bug as B-14: `ensureHermesInjectProvider` writes a `providers:` block and never selects it, so ACP `session/new` fails with `-32603 Internal error` / "No LLM provider configured". Hermes checks for a chosen provider *before* our `session/set_model` arrives. `droid`, `kimi`, `opencode-go` and `grok` write vendor config the same way and are unexercised. |

**Open, and the live question**

| Id | What |
|---|---|
| B-24 | Two separate faults. **(a)** With our MCP servers attached in `session/new` (the app's normal path), the model issues *no* tool call at all. **(b)** Without them, it *does* — and Hermes then hangs in its own "Creating new local environment" sandbox setup, indefinitely. |

**Resolved as not-a-problem** — B-22 (Hermes reading its own install directory) is
a one-shot-CLI quirk; the ACP path passes the bot's `cwd` correctly and it does
not reproduce in the app. B-18 (our `fs` capability declaration) is not the cause
either; Hermes reads files fine under the same declaration.

**Environmental, not a code bug but it broke everything early on:** Ollama's
default context is **4096 tokens**. An agent prompt is far larger — Qwen Code's
first request per turn measured **~31,185 tokens**, of which **91,011 characters
are tool schemas**. The overflow is silently truncated: a 7,246-token prompt was
evaluated as 2,050 tokens and the model picked the wrong tool as a direct result.
`server/local-runtime.ts` already holds the policy for this and is **inert**,
because it only applies to a runtime we launch and we do not launch one.

## 3. Reproducing the environment

The next machine needs all of this. None of it is in the repo.

```powershell
# 1. Ollama, then the model (~2 GB)
#    https://ollama.com/download/OllamaSetup.exe   (per-user, no admin)
ollama pull ibm/granite4.1:3b

# 2. Context, or you will re-discover the truncation bug
[Environment]::SetEnvironmentVariable("OLLAMA_CONTEXT_LENGTH", "32768", "User")
[Environment]::SetEnvironmentVariable("OLLAMA_KV_CACHE_TYPE",  "q8_0",  "User")
#    then FULLY restart Ollama from the tray — env is read at server start

# 3. An agent CLI. Qwen Code is the light install and is broken (B-21);
#    Hermes works and installs a great deal (see §5).
irm https://qwen-code-assets.oss-cn-hangzhou.aliyuncs.com/installation/install-qwen-standalone.ps1 | iex
iex (irm https://hermes-agent.nousresearch.com/install.ps1)

# 4. Building the app: if `corepack enable` fails with EPERM, drop a pnpm.cmd
#    shim containing `@echo off` / `corepack pnpm %*` somewhere on PATH.
#    package:win chains `pnpm build && …` and needs bare `pnpm` to resolve.
pnpm install; pnpm package:win        # ~3 minutes
```

Memory reality: the model is **2.33 GB** resident at default context and **3.39
GB** at 32768. On a 15.7 GB machine with normal applications open, free RAM sat
between 2.1 and 5 GB. An 8B model needs ~6 GB and **does not fit**; the tier
logic in `server/machine.ts` is built around this.

## 4. Next steps, in order

**1 — Fix B-23 in the Hermes driver.** The smallest, highest-certainty change,
and it is the same shape as the B-14 fix already in the tree: alongside the
`providers:` block, `ensureHermesInjectProvider` must select the provider (and
likely a default model) so `session/new` succeeds. Copy the merge-don't-clobber
approach used in `qwen.ts` and cover it the same way in
`local-inject-matrix.test.ts`. Then audit `droid`, `kimi`, `opencode-go` and
`grok` for the identical omission rather than waiting to hit each one.

**2 — Settle B-24(a): do our MCP servers suppress tool calls?** In the app,
`session/new` attaches two — `agents` and `composio`, both spawned as
`OpenMausBot.exe <script>` subprocesses of the agent. Every configuration where
the model reaches its tools has them absent; every configuration where it does
not has them attached. Turn the bot's Composio off (`bot.composio !== false`
gates it) and retest; if tool calls return, that is the answer and it is ours to
fix. Note `composio` is attached at all only because a packaged build
auto-registers with **upstream's** Composio Worker — itself a shipping blocker,
recorded in the `commercial-fork` skill.

**3 — Settle B-24(b): why does Hermes hang executing a tool?** With no MCP
servers, the model issued a tool call and Hermes stalled at
`tools.file_tools: Creating new local environment for task default`. Its config
has `backend: "local"` plus `container_*` and `docker_mount_cwd_to_workspace`
settings, so this is its execution-sandbox layer. `hermes -z` did not hit it.

**4 — Only then re-run the three-task test** in the app: working folder, read a
README, write a summary. A fresh workspace has no README, so the correct answer
to tasks two and three is to say so. Fabricating instead is the failure that
matters.

## 5. Decisions still open

**Which agent CLI to ship.** Qwen Code is a self-contained binary that installs
in seconds without admin — and is broken. Hermes works and installs managed
`uv`, a Python 3.11 virtualenv, a git clone, ripgrep and ffmpeg via winget, a
browser CLI, telemetry on by default, and a Cua computer-use driver registered as
a **scheduled task auto-starting at every logon with `RunLevel=Highest`**. Our
installer is currently one-click, per-user, no admin; bundling Hermes ends that.

**The third option, which the session accidentally proved viable.** Our own
probes drove the model to correct tool calls straight against Ollama's API with
no agent CLI at all. A **first-party local driver** — our code running the tool
loop, alongside the existing Claude and Codex drivers — would need nothing
installed, nothing elevated, and would be ours to test and stand behind. It is
the only option that satisfies plan 003's accountability argument rather than
arguing around it. Not yet sized.

**Whether the arm ships to everyone.** Plan 005's position is that this path's
buyer is the compliance customer, not the general non-technical user — which
would make Hermes' footprint tolerable (documented, not bundled) and keep the
no-admin installer intact. `VITE_INSTALL_PATHS` already exists to ship it as a
variant.

## 6. Traps that cost real time

- **PATH is frozen for a running process on Windows.** A CLI installed while the
  app is running stays invisible until a **full** restart, tray included. This
  looked like three different bugs before it was recognised ([B-12](../known-bugs.md)).
- **An ACP client must answer *every* server-initiated request**, not only
  `session/request_permission`. Ignoring one blocks the agent forever;
  `core.ts:351` says so and a hand-written probe still hung for exactly that.
- **PowerShell will corrupt files.** `>` writes UTF-16; `Set-Content -Encoding
  utf8` adds a BOM that Qwen Code rejects as invalid JSON; `WriteAllLines`
  re-encodes and mangled every non-ASCII character in a 102 KB config. Edit
  third-party config through Node.
- **Do not pipe a long-running command through `Select-Object -Last n`** — it
  buffers everything until exit, so a nine-minute run shows nothing until it is
  over.
- **Ollama's worker process is `llama-server`, not `ollama`.** A monitor
  filtering on `*ollama*` reports ~1% CPU while the machine is busy.
- **Verify claims against the filesystem.** A model reported writing a file that
  did not exist, and separately produced a fully formatted "file listing" with
  the correct absolute path and entirely invented contents. Check the disk and
  the `native/*.ndjson` wire log, which records the true direction of every
  message.
