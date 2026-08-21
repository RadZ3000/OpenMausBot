# Known bugs

Defects found and not yet fixed, kept in one place so a sweep has somewhere to
start. **A list to work from, not a tracker** — when one is fixed, delete the
entry and let the commit be the record.

Scope is anything we ship, so it includes upstream code we inherit. It does not
include *considerations* — design tensions and open decisions for the local
model path live in [`local-model-path.md`](local-model-path.md), and shipping
blockers live in the plans under [`plans/`](plans/).

Each entry has a stable id so it can be referenced from a commit or a comment.
Ids are never reused.

**Status:** `open` · `needs-probe` (cannot be fixed until something is measured)
· `wont-fix` (with the reason).

---

## Ours — introduced in this fork

### B-01 · "I'll set this up later" reads as cancel during a download — `open`

`src/components/InstallPathChooser.tsx`. The defer button renders unconditionally,
including while the local-model download is running.

Clicking it unmounts the chooser but **cancels nothing**: no abort is wired, so
the request stays open, the server keeps streaming, and the runtime finishes the
pull. The model ends up correctly installed and `reloadProviders()` still runs —
the state updates after unmount are simply no-ops.

The outcome is therefore benign and the *label* is the defect: someone stops
watching a 2.5 GB transfer believing they stopped it, while their bandwidth and
disk keep going.

**Fix:** during an active download, say what the button does — "continue in the
background". Do not disable it; trapping someone in front of a ten-minute
progress bar is worse than the current behaviour.

### B-02 · A download cannot be cancelled — `needs-probe`

Same file. Once started there is no way to stop, which matters for anyone who
misjudged their connection or picked the wrong tier.

The client half is easy (an `AbortController` on the fetch). The server half is
not known: aborting the HTTP stream may or may not stop the runtime's own blob
fetch, since it manages that internally. **Measure before designing** — if the
pull continues regardless, a cancel button that leaves gigabytes downloading is
B-01 again with more steps.

### B-11 · The arm reveals its three requirements one at a time — `fixed`

`src/components/LocalModelArm.tsx` now shows a three-row checklist (Ollama,
Granite, Hermes) from the first screen, and installs Hermes in-app instead of
handing off to EngineSetup / Qwen Code. Ollama itself is still a browser
download — that remaining hole is the fresh-machine runtime, not the naming.

### B-12 · A CLI installed while the app runs stays invisible until restart — `open`

Confirmed on Windows, 2026-08-20. After installing Qwen Code the binary was
present at `%LOCALAPPDATA%\qwen-code\bin\qwen.cmd`, while the running app still
reported ``` `qwen` CLI not found ```. Hermes is now scanned at
`%LOCALAPPDATA%\hermes\hermes-agent\bin` after `resetPathCache()`, which is
what first-run install uses.

`GET /api/instances` calls `resetPathCache()`, but `augmentedPath()` rebuilds
from `process.env.PATH`, which Windows freezes at process start — so the refresh
re-derives the same stale value. Focusing the window does not help. Only a full
restart of the app does, and closing the window may not be enough if a tray
process survives.

This lands squarely on the first-run path, where installing a CLI and then
looking for it is the entire point. **Fix:** re-read PATH from the registry
(`HKCU\Environment` and the machine equivalent) when rescanning on Windows, as
the platform provides no notification to a running process.

### B-13 · Qwen Code cannot be launched on Windows — `open`

Confirmed 2026-08-20. The local-model path now installs Hermes rather than Qwen
Code, so this no longer blocks first run. It still blocks anyone who picks Qwen
from the engine picker on Windows.

`resolveCliSpawn` cannot spawn a `.cmd` directly — Node refuses since the
CVE-2024-27980 fix — so `parseCmdShim` reads the shim and spawns its real target
instead. It recognises only the npm/pnpm form, a quoted `"%dp0%\…"` path. Qwen
Code's installer writes neither, and writes two shims:

```bat
:: %LOCALAPPDATA%\qwen-code\bin\qwen.cmd  — an absolute path, not %dp0%-relative
call "C:\…\qwen-code\qwen-code\bin\qwen.cmd" %*
```

```bat
:: …\qwen-code\qwen-code\bin\qwen.cmd  — indirects through a variable
set "ROOT=%~dp0.."
"%ROOT%\node\node.exe" "%ROOT%\lib\cli-entry.js" %*
```

Both defeat the regex, for different reasons, so `parseCmdShim` returns null and
`resolveCliSpawn` falls back to spawning the `.cmd` — which is exactly what Node
rejects. Note the second would still fail even if the first were fixed: its
targets are `%ROOT%`-relative, and it ships its **own** `node.exe`, while
`parseCmdShim` deliberately filters `node.exe` out of candidate targets.

Verified resolution: `…\qwen-code\node\node.exe …\qwen-code\lib\cli-entry.js
--version` prints `0.21.15`.

**Fix:** teach `parseCmdShim` to expand simple `set "VAR=…"` assignments before
matching, and to follow a `call "<path>.cmd"` chain with a depth limit. Make it
additive — try the new forms only when the existing match fails — because this
code path spawns every CLI engine on Windows and a regression there breaks
Claude and Codex too.

### B-14 · Qwen Code demanded a cloud login for a local model — `open`

Confirmed 2026-08-20, immediately after [B-13](#b-13--qwen-code-cannot-be-launched-on-windows--open)
was fixed. The engine spawned, the model was selected, and the first message
failed with *"Authentication required: Use Qwen Code CLI to authenticate first"*
— on the arm whose entire promise, printed on the engines screen, is "no cloud
sign-in required".

`ensureQwenInjectModel` writes `modelProviders` and `env` but never
`security.auth.selectedType`. Qwen Code's own documentation is explicit that
without it, *"you'd need to run `/auth` interactively"*. The provider entry was
correct; nothing had chosen the protocol to use it with.

**Fixed** by writing `security.auth.selectedType = "openai"` alongside the
provider, merged rather than overwritten so anything else under `security`
survives.

**Known side effect:** this changes the auth protocol for the user's standalone
`qwen` too, so someone normally on Qwen OAuth is switched to openai. Accepted —
it is the same trade already made by writing `modelProviders` into their real
settings file, and the alternative is a local model that cannot answer.

**Worth generalising:** two shipped defects in a row, both on the same arm, both
found only by running it. Every driver's inject writer is a candidate for the
same class of bug — a config format that drifted from the vendor's current
release. `hermes`, `droid`, `kimi`, `opencode-go` and `grok` all write vendor
config files and none has been exercised end to end recently.

---

## Inherited — in code we ship

### B-03 · LocalAI is detected and labelled "oMLX" — `open`

`server/drivers/local-inject.ts:20` binds oMLX to `127.0.0.1:8080`, which is also
LocalAI's default. A LocalAI user is found, listed under the wrong product name,
and given ids encoded as `omlx::…`; the loaded-state probe then hits
`/v1/models/status`, an oMLX-only endpoint LocalAI does not serve, so the "in
memory" indicator is wrong too.

Not a one-line fix — hosts deduplicate by base URL, so a second entry on 8080
silently loses. Needs a probe-time discriminator such as LocalAI's `/readyz`.

### B-04 · A bot can hold a model id that no longer exists — `open`

`modelSelection.model` is never validated against the live catalog, so a bot
keeps pointing at a model after the runtime stops, the model is removed, or a
local host goes away. It fails when the bot next tries to answer rather than at
the moment the model disappeared.

The in-app delete makes this reachable deliberately, in two clicks. The right
fix is to notice at send time and surface "this model is gone, pick another"
rather than failing.

### B-05 · `instanceConfigs()` mutates the config it is handed — `open`

`server/config.ts:373-377` assigns `environment` onto the entry objects it was
given, and when a fleet is configured those are the live `cfg.instances`
objects — so calling it on `cfg` writes **resolved credentials into the running
config**. Persisting that map then writes the xAI key, Box token and OpenCode
key in plaintext into `config.json`.

`withInstanceCli` avoids it by cloning first, and its doc comment explains why,
but the hazard is in the shared function rather than guarded at it. The next
caller will hit it — this fork already did, and only the tests caught it.

**Fix:** have `instanceConfigs()` not mutate its input, or split the live and
persistable forms so the dangerous one cannot be saved by accident.

### B-06 · "Start Local VM" is offered but always rejected — `open`

`POST /api/local-computer/start` always 409s ("cannot safely resume; remove and
recreate"). `setupCommands()` returns `start: null`. Settings still contains a
Start button, but `needsRecreate` is true whenever `container === "stopped"`,
so that button is unreachable; a stopped VM is sent down Delete and recreate.

On 2026-08-21, `docker start` of the existing `openmausbot-computer` (layer v3,
Exited 255 after Docker Desktop quit) came back in under a second: VNC 200,
`cua-driver 0.20.0`, health `overall: ok`. The resume ban is a policy, not a
fact about this image on Docker. Current code wants image layer **v4**, so a
real app session would still recreate rather than start.

### B-07 · Chat can flash before `NoEngines` decides — `open`

`src/App.tsx` gates `NoEngines` on `state.instances.length > 0`, so during the
first load — when the list is legitimately empty — the main chat renders. On a
machine with no engines at all, the first thing shown is a chat that cannot work.

### B-08 · "Maybe later" on the email step never clears the gate — `open`

`src/components/Onboarding.tsx`. Skipping email advances the step but does not
write `omb-email-gate`; only `finish()` does, and it always writes
`"submitted"` even when the address was skipped. So the value is both incomplete
as a dismissal path and inaccurate as a record.

### B-09 · `applyClaudeInject` points at hosts that cannot serve it — `needs-probe`

`server/drivers/local-inject.ts:318-333` sets `ANTHROPIC_BASE_URL` to the host
origin for **any** local host, including Ollama and LM Studio, which speak the
OpenAI API and not the Anthropic one. Either this path is quietly broken for most
hosts or something else is going on.

Worth settling because the answer is valuable either way: if a local host *can*
drive Claude Code, it removes a whole precondition from the local model path.
LocalAI would be the first host where it is genuinely true.

---

### B-16 · The thinking stream is discarded when a turn ends — `open`

Reasoning is shown while it streams and is gone once the reply lands, so the one
artefact that explains *why* a model did something cannot be read afterwards,
quoted in a bug report, or compared between runs.

Found while evaluating a local model, where the reasoning was the most
informative part of every failure and none of it survived. Retaining it matters
most exactly where the model is weakest.

### B-17 · The transcript shifts under the cursor while streaming — `open`

Content reflows as tokens arrive, so text cannot reliably be selected or copied
mid-stream — the selection is lost as the layout moves. Combined with B-16, a
streamed reasoning block is effectively uncopyable: unstable while it exists,
absent afterwards.

### B-21 · Qwen Code never invokes tools when driven by a custom provider — `open`

**The cause of every local-model failure on 2026-08-20**, found by elimination
after a night of wrong attributions.

`ibm/granite4.1:3b` through **Hermes**, same Ollama, same machine: asked for the
secret number in a file containing `8241`, it invoked a real file-read tool and
answered `8241`. The same model through **Qwen Code**: zero tool calls of any
kind, and confident fabrication in their place — an invented README, an invented
memory file complete with plausible personal preferences, and `42` in place of
`8241`.

Ruled out first, each with evidence:

| Suspected | Result |
|---|---|
| Model can't do tool calls | **18/18 correct** at 1, 5, 10, 20, 40, 59 tools (3 runs each) |
| Ollama's OpenAI-compat endpoint | correct on `/api/chat` **and** `/v1/chat/completions` |
| Streaming | correct streaming **and** non-streaming |
| Tool-schema bloat | 59 tools handled perfectly when passed directly |
| Context truncation | real (2050 of 7246 tokens at the 4096 default) but not the cause — failed identically at 16384 and 32768 |
| Our harness | fails identically with the harness removed, driving the CLI directly |
| Model size / open weights | a 3B open model works fine under a different agent |

**This attribution was too narrow — corrected later the same night.** Hermes,
driven through our harness over ACP, *also* makes zero tool calls with the same
model, and fabricates in the same way. So "Qwen Code's custom-provider handling"
does not explain it.

What actually distinguishes working from broken is **not the CLI**:

| Path | Tools invoked? |
|---|---|
| Ollama API directly, no CLI | **yes** — 18/18 |
| `hermes -z`, Hermes' own config, no MCP servers | **yes** — read a real file |
| `hermes acp` via our harness, our MCP servers attached | **no** |
| `qwen --acp` via our harness | **no** |
| `qwen -p` standalone | **no** |

Hermes works standalone and fails through us. That points at the **ACP
integration** — most likely the `mcpServers` we attach in `session/new` — rather
than at either CLI. Tracked as [B-24](#b-24--no-tool-calls-when-our-mcp-servers-are-attached-over-acp--needs-probe).

Qwen Code is still separately suspect, since it failed standalone too.

### B-24 · No tool calls when our MCP servers are attached over ACP — `needs-probe`

The narrowed form of [B-21](#b-21--qwen-code-never-invokes-tools-when-driven-by-a-custom-provider--open),
and the live question at the end of 2026-08-20.

Every configuration where the model reaches its tools has our MCP servers
*absent*. Every configuration where it does not has them attached. Our
`session/new` carries them:

```json
"method":"session/new","params":{"cwd":"…\\workspaces\\913cbcaa-…",
  "mcpServers":[{"name":"agents","command":"…\\OpenMausBot.exe","args":["…"]}, …]}
```

They are spawned as subprocesses of the agent, on Windows, via our own
executable. If they fail to start, hang, or negotiate badly, the agent may end
up presenting no usable tool set — which is exactly the observed behaviour.

Suggestive detail from the same log: `ls` appears 18 times and `glob` 3 times,
yet no tool call is ever issued. Something is being enumerated and never used.

**Run, and it split the problem in two.** A hand-written ACP client drove
`hermes acp` with `mcpServers: []`, same model, same prompt. Hermes' own log:

```
API call #1: model=ibm/granite4.1:3b provider=custom in=13655 out=21 latency=14.0s
tools.file_tools: Creating new local environment for task default...
```

**21 output tokens is a tool call, not prose.** So with no MCP servers attached
the model *does* invoke a file tool over ACP — the first time that has been
observed inside the ACP path. Tool *calling* is not broken.

What is broken is tool *execution*: Hermes then hung in "Creating new local
environment", its own sandboxing layer, and was still there five minutes later.
The standalone `hermes -z` run did not hit this, so something about the ACP path
or a cold working directory triggers it.

Two separate faults, then:

1. **With our MCP servers attached** (the app): no tool call is issued at all.
2. **Without them** (this probe): the tool call is issued and then hangs in
   Hermes' local-environment setup.

Both are open. (1) still points at what we attach in `session/new`; (2) points at
Hermes' execution backend and its `backend`/`container_*` configuration.

**2026-08-21 follow-up.** A Windows Path A first-run with one Hermes bot, no
Composio key, and no VM sends `mcpServers: []` — `agents` only mounts when
another bot exists, host Cua Auto is darwin-only. So (1) is the multi-bot /
VM / connected-apps path; the empty first-run path is (2). Hermes logs (2) in
`tools/file_tools.py` immediately before `_create_environment`. Ranked probes:
[`docs/plans/2026-08-21-004-b24-investigation.md`](plans/2026-08-21-004-b24-investigation.md).

Path A on this box later **did** install Hermes + Granite in a throwaway
data dir; the B-24 prompt was not sent. Walk:
[`docs/plans/2026-08-21-005-path-a-live-walk.md`](plans/2026-08-21-005-path-a-live-walk.md).

*Note for whoever picks this up:* an ACP client must answer **every**
server-initiated request, not just `session/request_permission`. Ignoring one
blocks the agent indefinitely — a first attempt at this probe hung for that
reason, and `core.ts:351` warns about it explicitly.

### B-23 · Inject drivers configure a provider but never select it — `open`

Three instances in one night, all with the same shape and all surfacing as
something that looks unrelated:

| Driver | Writes | Never writes | Symptom |
|---|---|---|---|
| `qwen` | `modelProviders` | `security.auth.selectedType` | "Authentication required: Use Qwen Code CLI to authenticate first" — **fixed** (B-14) |
| `hermes` | `providers:` block | a selected `model.provider` | ACP `session/new` → `-32603 Internal error`, "No LLM provider configured" — **fixed** (`selectHermesInjectProvider`) |

Both CLIs check for a *chosen* provider before a session exists — Hermes at
`session/new`, which is before our `session/set_model` ever arrives — so
declaring one without selecting it fails every turn.

The Qwen case is fixed ([B-14](#b-14--qwen-code-demanded-a-cloud-login-for-a-local-model--open)).
Hermes is fixed by writing `model.provider` to the config the running CLI
already uses, which on Windows is `%LOCALAPPDATA%\hermes` (the installer
sets `HERMES_HOME` there), not `~/.hermes`. The spawned `hermes acp` child
gets that same `HERMES_HOME` so session/new reads the file we just wrote.
`model.default` is left alone; `session/set_model` still pins the pick. Two
other approaches were measured and discarded:

- **`--provider` on the command line.** `hermes --provider ollama acp` fails
  at `session/new` identically to bare `hermes acp`. Global flags do not reach
  this subcommand. Four tests asserted the argv and passed while the feature
  was dead; they were reverted.
- **Isolated `HERMES_HOME`.** A blank home, a home with the user's cache
  copied in, a full profile clone, and the official
  `%LOCALAPPDATA%\hermes\profiles\<name>` layout all select the provider
  (client created against Ollama) and then hang inside agent construction
  past 90s. The same `model.provider` write against the *default* profile
  returns a session id in ~2.3s. Isolation is not a safe substitute.

Side effect: an inject turn flips the user's Hermes `model.provider` away from
`auto` for anything else that reads that file. Cost of the only path that
actually starts a session.

`droid`, `kimi`, `opencode-go` and `grok` still write vendor config the same
way and remain unexercised. The acceptance test for any of them is a real
`session/new` returning a session id.

### B-22 · Hermes CLI runs its file tools in its own install directory — ~~`needs-probe`~~ **resolved: does not affect us**

Given `probe.txt` relative to the launch directory, `hermes -z` replied that the
file did not exist; given the absolute path to the same file, it read it
correctly.

**Cause identified.** Asked to list its working directory, it returned
`README.md` and `LICENSE` — both present in
`%LOCALAPPDATA%\hermes\hermes-agent`, neither present in the launch folder. Its
tools were operating in **Hermes' own installation directory**. The `--in DIR`
flag did not change it, and `home_mode` is unrelated (it governs `HOME` for tool
subprocesses, not the working directory).

**But this was measured on the wrong entry point.** The product spawns
`hermes acp`, not `hermes -z`, and the ACP path supplies the working directory
twice — as the child process's `cwd` at spawn, and again over the wire:

```ts
const cwd = turn.cwd ?? config.workspace ?? homedir();   // core.ts:282
spawnCli(config.cli, …, { cwd, … });                     // core.ts:292
await request("session/new", { cwd, mcpServers }, …);    // core.ts:569
```

**Tested through the app and it does not reproduce.** Asked what folder it was
working in, Hermes over ACP correctly reported the bot's own workspace
(`…\workspaces\913cbcaa-…`) and its real contents — `MEMORY.md` and the `memory`
sub-folder, nothing else — rather than its install directory.

So the `cwd` in `session/new` is honoured, this was a one-shot-CLI quirk, and
**Hermes remains a viable candidate for the local path.** Kept as a record of
what was ruled out.

Worth noting either way: the failure was honest. It reported absence rather than
inventing a value, which is the difference between a bug and a liability, and is
the opposite of what Qwen Code did in the same position.

### B-18 · ACP agents are told the client cannot read or write files — ~~`needs-probe`~~ **not the cause**

Kept because the declaration is still worth a look, but it is **not** what broke
the local path. Hermes drives the same model to real file reads under the same
`clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }`, so
agents using their own built-in tools are unaffected by it. Original note follows.

### B-18 (original) · ACP agents are told the client cannot read or write files

`server/drivers/acp/core.ts:538` initialises **every** ACP agent with:

```ts
clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } }
```

A local model then refused a read with *"there is no explicit read_file
function to access the local file system"* and fabricated an answer instead.

Attribution is genuinely unclear and worth settling, because it points at very
different fixes. `write_file` **did** work in the same session, so Qwen Code was
using its own built-in tools rather than the client bridge, which suggests it had
a read tool and hallucinated its absence. But if the declaration does suppress
file reading for ACP agents, this affects `qwen`, `hermes`, `kimi`, `droid`,
`cursor`, `gemini` and `opencode-go` alike, and would be a significant capability
gap rather than a model failure.

Settle it with a stronger model on the same driver: if a capable ACP agent reads
a file successfully, the declaration is not the cause.

### B-19 · The agent CLI offers host control on a platform where we do not — `open`

Captured 2026-08-20 by proxying Qwen Code's requests to Ollama. Its first call
carries **59 tool schemas**, and roughly thirty are `computer_use__*`:

```
click, double_click, drag, right_click, scroll, move_cursor, hotkey, press_key,
type_text, launch_app, kill_app, list_apps, list_windows, bring_to_front,
get_window_state, get_screen_size, get_accessibility_tree, zoom,
start_recording, stop_recording, replay_trajectory, check_permissions, …
```

These drive **the user's own desktop** — not the Box cloud computer, not the
Local VM. Verified as Qwen Code built-ins: no extensions are installed and
nothing in `~/.qwen` references them.

The README's capability matrix says host control is macOS-supported, Ubuntu
GNOME beta, and **not offered on Windows** — `package:win` bundles no CUA driver
and Electron skips `startCua()` off macOS and Linux. So a capability we
deliberately do not ship on this platform reaches the model anyway, through the
agent CLI, outside our capability model.

ACP tool calls do surface as approval cards, so nothing executes unapproved. That
is real but thin: a card reading "click at 840, 220" does not tell a
non-technical person a bot is taking their mouse, and screen recording sits in
the same list.

Two consequences, and they point the same way: it is a consent and capability-
honesty problem, and it is also **half the tool-schema payload** behind
[B-20](#b-20--fifty-nine-tool-schemas-arrive-before-the-first-narrowing--open).
Trimming it removes nothing the product claims to offer.

### B-20 · Fifty-nine tool schemas arrive before the first narrowing — `open`

Same capture. Qwen Code does narrow — later calls in the same turn carried only
`read_file, grep_search, glob, list_directory` — but the **first** request of a
turn ships all 59.

Measured effect on a 3B model: given **one** tool definition directly, it emitted
a flawless call (`get_file_size`, correct argument, no invention). Given 59, it
reached for `web_fetch` to open a local file, emitted it as plain text rather
than a tool call, and separately told the user *"I'm not able to access the file
system"* while `read_file` sat in the payload.

Not only a local-model concern: 59 schemas re-sent on every step of every turn is
tokens, latency and money on the cloud engines too.

## Distribution

### B-15 · Smart App Control blocks the installer outright — `open`

Hit 2026-08-20 on Windows 11 with Smart App Control in **enforcement** mode
(`HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy\VerifiedAndReputablePolicyState
= 1`):

> Smart App Control blocked an app that may be unsafe … We blocked
> `OpenMausBot-0.1.27-setup.exe` because we could not verify its publisher.

**This is not SmartScreen.** Everything written so far — the README, the comment
in `electron-builder.yml`, the release plan — describes the unsigned build's cost
as "unknown publisher" with a **More info → Run anyway** escape. Smart App Control
offers no escape: the buttons are "Okay" and "Get apps from the Store". A user
can only disable SAC, and **disabling it is permanent** — it cannot be turned
back on without reinstalling Windows.

So on an affected machine the product cannot be installed at all, and the
"workaround" costs the customer a Windows reinstall to undo.

Worse, it is **intermittent**: the same file was blocked, then installed
successfully on a retry minutes later, because SAC consults a cloud reputation
service. Intermittent is harder to support than consistent — it cannot be
reproduced on demand and every rebuild is a fresh unsigned binary with no
reputation.

**This reframes signing.** Decision 4 in the release plan treated Windows signing
as a conversion problem worth fixing eventually, on the basis that SmartScreen was
survivable. It is not a conversion problem; it is an install-or-not problem on
modern Windows 11.

Local workarounds while unsigned: run `release\win-unpacked\OpenMausBot.exe`
directly (locally built binaries carry no mark-of-the-web and are usually left
alone), or run from source.

## Toolchain and process

### B-10 · `pnpm lint` fails on a clean tree, and CI does not run it — `open`

`AGENTS.md` lists `pnpm lint` as a step to run by hand and notes CI does not run
it. It currently exits non-zero on an unmodified checkout, with pre-existing
anti-slop errors in `src/mascot-preview.tsx`,
`electron/cua-linux-runtime.test.mjs` and `server/skill-library.ts`.

The cost is not the errors, it is that a permanently red command teaches everyone
to ignore it — so a genuinely new violation lands unnoticed. Either fix the
baseline and put lint in CI, or scope it to changed files so it can be green.
