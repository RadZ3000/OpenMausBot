# The three-path first run

Status: proposed; Path A still building, Path C in tree per
[2026-08-25-001](2026-08-25-001-path-c-hosted-trial-plan.md). This is Phase 1 of
[the product foundation plan](2026-08-20-003-product-foundation-plan.md), which
defines the wedge as **one installer that produces a working bot without the
customer doing sysadmin work**.

## check-upstream-first, run before writing anything

Required by [the skill](../../.claude/skills/check-upstream-first/SKILL.md),
because this is a new component under `src/components/` and a plan in
`docs/plans/`. We are 0 commits behind `upstream/main`.

**Upstream owns onboarding and is actively reworking it.** `Onboarding.tsx`,
`EngineSetup.tsx`, `NoEngines.tsx` and `ModelPicker.tsx` were all touched on
2026-08-17 — `9aa8039` "Redesign model picker setup and catalog UI", `5669d58`
"Add Qwen and Hermes, and make Custom faster to pick from", `8292a4d` "Lay the
onboarding engines out as ready tiles over setup rows". They solved the adjacent
problem in `54e9e59`, "Make a machine with no AI CLI installed recoverable".

**Upstream does not have an install-path chooser, and structurally will not.**
Two of the three arms mean bundling runtimes and operating an inference proxy —
the territory plan 003 identifies as where a FOSS project does not go. Every path
we intend to create is free on `upstream/main`.

**Decision: build it, in files upstream does not own.** Putting a chooser inside
`Onboarding.tsx` buys a hand-resolved conflict every time they do another pass,
and they did three passes in one day three days ago. This is the exact shape of
the failure the skill was written about.

## What is actually true today

Audited, not assumed.

**Path B already exists end to end. It is simply not reachable.** This is the
finding that reorders the whole plan:

- `server/drivers/grok.ts` is an HTTP driver — `driverKind: "grok"`, display name
  `Grok (API)`, talking to `https://api.x.ai/v1/chat/completions` with SSE
  streaming. **It needs no CLI, no terminal, and no OAuth.** It also supplies the
  instance's `generateText`, so bot titles and thread names work.
- Its key already has a route: `injectedEnvironment()` in `server/config.ts:312`
  maps `cfg.xai.key` to `XAI_API_KEY` for the `grok` driver, and only that driver.
- The config schema already has `xai.key`.

Two things are missing, both small:

1. **No UI accepts the key.** `ApiKeys.tsx` covers `composio`, `box`,
   `opencodeGo` and `imageGen`. There is no xAI row.
2. **No instance runs the driver.** `DEFAULT_FLEET` maps `grok` to `grokAgent` —
   the *CLI* driver. The API driver is registered and instance-less.

Upstream states why, at `server/config.ts:324-329`: *"the API-key `grok` driver
stays registered but out of the default fleet — that key is a credential Milind
doesn't want to manage; an `instances` entry brings it back anytime."*

**That reason does not transfer to us.** Managing the credential is the product.
This is a fork-shaped divergence in the best sense: upstream's rationale for
declining is exactly our rationale for shipping.

**The empty selection is deliberate and must be respected.**
`defaultSelection()` (`server/index.ts:265-276`) returns `{ instanceId: "",
model: "" }` when nothing is available, with a comment forbidding a fallback,
because handing a bot an uninstalled engine fails on send with a raw spawn
ENOENT. The chooser's job is to make an engine *genuinely available*; the empty
selection then resolves itself and `NoEngines` stops rendering on its own. Any
design that papers over the empty string reintroduces the worst first-run bug
this codebase has fixed.

**Provider API keys are stripped by default.** `PROVIDER_CREDENTIAL_ENV` in
`server/drivers/acp/core.ts:131-143` is deleted from every child env unless the
driver names it in a `credentialEnv` allowlist, so a foreign key cannot flip a
CLI's billing off its own login. Four drivers opt in (`opencodeGo`, `gemini`,
`cursor`, `droid`). `claude` and `codex` deliberately do not, and
`claude.test.ts:227` asserts `ANTHROPIC_API_KEY` never reaches the child. **So
"paste an Anthropic key and Claude Code uses it" is not available and is not a
bug** — the CLI drivers run on the user's subscription login by design.

**There is no progress mechanism for long setup tasks.** The Local VM image pull
is a blocking POST with 5-second status polling and no byte progress
(`server/index.ts:3681-3693`). Engine installs today copy a command to the
clipboard and open a *blank* terminal (`electron/main.mjs:490-494`) — the command
is deliberately never passed as argv.

## Architecture

`src/App.tsx:150-156` mounts onboarding as a sibling overlay. That is the seam:
the chooser mounts the same way, as a peer that self-gates, so registration is
**one added line and zero modified lines** in a file upstream owns.

The chooser renders above onboarding and precedes it. We never touch upstream's
engine step — by the time it renders, an engine is already available, so their
existing `engineReady()` shows it as a ready tile. **We change the world their
code observes, not their code.**

Two distinct concepts, kept apart because the distribution profile is two
channels and conflating them means a single-path build needs the wrong half
rebuilt:

| Concept | Where | Why |
|---|---|---|
| Which arms a build **offers** | `src/lib/distribution.ts`, `VITE_INSTALL_PATHS` | Build-time. A customer build may offer only one arm. |
| Which arm the user **picked** | `omb-install-path` in localStorage | Runtime. Joins the existing `omb-*` keys, which [are not branding](../identity-surface.md#2-names-that-are-not-branding--do-not-touch). |

Plan 003 deferred an install-path field until it had a consumer. The chooser is
that consumer, so it is earned now rather than speculative.

## Phase 1a — the chooser and Path B — **this change**

New files, all ours:

- `src/lib/install-path.ts` — the policy: offered arms, chosen arm, persistence.
- `src/components/InstallPathChooser.tsx` — the overlay.
- tests beside each.

Plus one line in `src/App.tsx`, and an `installPaths` field in our own
`src/lib/distribution.ts`.

Path B is wired; A and C render as unavailable arms with an honest reason rather
than being hidden, so the chooser's shape is real from the first build.

### Enabling the instance needs a server seam — found while building this

Storing the key needs nothing: `xai.key` is in the config schema, `syncCredentialEnv`
maps it to `XAI_API_KEY`, `injectedEnvironment` routes it to the `grok` driver
and nowhere else, and `CREDENTIAL_PATCH` in `electron/main.mjs:611` already
carries `xaiApiKey`, so the key lands in the OS-encrypted `credentials.bin`.
That whole path works today.

**Creating the instance does not, and cannot be done from the client.** Two
findings, both load-bearing:

1. `appConfigPatchSchema = appConfigSchema.omit({ instances: true })`
   (`server/config.ts:80`). The HTTP config route deliberately cannot write
   instances — the UI is not allowed to rewrite the fleet.
2. Even server-side, a naive write is a footgun. `saveConfig` merges instances
   per id (`config.ts:238-248`), but `instanceConfigs` treats *any* configured
   map as the complete fleet (`config.ts:361-362`). Writing
   `{ grokApi: { driver: "grok" } }` alone therefore **collapses the fleet to one
   engine and deletes every other one**. The write must carry the whole fleet,
   which also keeps `PRODUCT_FLEET_ADDITIONS` applying, since a copied default
   fleet contains `grok`.

So Path B needs one narrow server capability: *enable the API-key engine*,
implemented in a file of ours and registered in `server/index.ts` with one line,
composing the full fleet server-side where `DEFAULT_FLEET` is already known.
Deliberately not a general "write the fleet" route — that is the surface upstream
closed on purpose, and reopening it for a UI would be a real regression.

## Phase 1b — Path A, local open-source

> Everything known to bite this path, and the position taken on each, lives in
> **[`docs/local-model-path.md`](../local-model-path.md)** — a standing register
> rather than a plan. Read it before touching this arm, and add to it whenever
> something new turns up. This section says what to build; that says what to
> build around.

### The four preconditions

A working local bot needs all four, and today the user assembles every one by
hand:

| # | Precondition | How it is checked | Can the app do it? |
|---|---|---|---|
| 1 | An inference runtime is running | HTTP probe, `127.0.0.1:11434` | Only if already installed — starting it is a shell-out, installing it is not unelevated work |
| 2 | A model is pulled into it | it appears in `/v1/models` | **Yes, completely** |
| 3 | A `custom`-access agent CLI is installed | driver `snapshot()` runs `<cli> --version` | No — one command in a terminal, upstream's existing handoff |
| 4 | The bot's model is set to `host::model` | `modelSelection.model` | Yes, trivially, once 1–3 hold |

Step 2 is the one worth automating: it is the multi-gigabyte wait, and it is the
only step we can do *well*.

### Progress comes for free, which changes this phase's cost

This plan previously said progress streaming does not exist and that designing
it is "the real cost of this arm". That was true of the container pull and is
not true here. **Ollama's `POST /api/pull` streams NDJSON progress** —
`{status, digest, total, completed}` per line. Nothing in this repo calls it;
`api/pull` has zero matches in the tree. So the byte-level progress the Local VM
pull never had is already available, from the runtime, for nothing.

The transport should be **the response body of the request that starts the
pull**, not a new SSE kind. Streaming NDJSON straight back to the caller means
no new event kind, no case added to `store.tsx` (an upstream file), and progress
scoped to the one client that asked for it. `broadcast()` would work and is
worse: a first-run download is nobody else's business.

If the overlay closes mid-pull the download continues inside Ollama, and
reopening simply re-probes and finds the model. That is the right failure mode
and it costs nothing to get.

### Which model, and why the licence decides before the benchmark

Default to **`qwen3:4b`** — Apache-2.0, about 2.5 GB at Q4, roughly 4 GB of
memory. It is already the worked example in `src/lib/distribution.ts` and
`electron/distribution.mjs`, so the codebase had effectively picked it.

Plan 003's constraint holds and `pnpm check:licenses` cannot help, because
weights are not npm packages. Commercially clean: Apache-2.0 (Qwen, IBM Granite
4.0, ToolACE-2-8B, MiniCPM5) and MIT (Phi-4-mini, Functionary v3.2). **Cannot
ship: the xLAM family is CC-BY-NC-4.0** despite topping its size classes. Llama's
community licence carries usage thresholds and an attribution requirement, so it
is a decision rather than a default.

Memory, not disk, sets the floor — a model that spills out of VRAM into system
RAM runs several times slower, and a typical business laptop has 16 GB and no
dedicated VRAM. 3–4B is the floor for an unknown machine.

### Be honest in the UI about what this arm is worse at

This is an agent harness doing multi-step tool calls, the hardest workload for a
small model, and single-call tool accuracy compounds badly across a twenty-step
task. The arm should say so rather than let someone discover it. It **does**
offer computer control: the Local VM is part of the Path A checklist
(Podman, not Docker). Chat continues if that step fails.

### Reducing the footprint: every lever, ranked

Baseline for an empty Windows machine: **~3.9 GB downloaded** (≈1.4 GB Ollama
runtime with its NVIDIA libraries, ≈2.5 GB for `qwen3:4b`) and **~4–5 GB of RAM
live** while a task runs. Nothing below is built yet.

**The download cannot be eliminated for the machine doing the inference.**
Weights are resident or the model does not run; there is no partial or streamed
inference. So the levers are: don't be that machine, be a smaller machine, or
carry less while being it.

#### 1. Avoid the download entirely

| Lever | Saving | Status |
|---|---|---|
| Reuse a runtime already on the machine | 100% | **Already works** — `probeLocalInjects()` lists whatever five known runtimes hold. The arm should lead with this rather than with "download 4 GB". |
| Point at another machine on the network | 100% per seat | **Not possible today** — all seven entries in `LOCAL_HOSTS` are hardcoded to `127.0.0.1`. One config-sourced host entry would fix it. |

The network option is the highest-value change in this phase. Compliance rules
say the data stays in the building, not on the laptop, so one GPU box can serve a
whole team at full speed while every non-technical seat downloads nothing.

#### 2. Shrink the runtime (≈1.4 GB)

- **Match the variant to detected hardware.** The base Windows zip carries NVIDIA
  CUDA libraries; AMD and MLX are separate archives. A laptop with integrated
  graphics downloads a large slice it can never use.
- **`llama.cpp`'s server instead of Ollama** — MIT, tens of megabytes for a CPU
  build, same OpenAI-compatible surface. Large saving, and a real project: model
  files become ours to manage.

#### 3. Shrink the model (≈2.5 GB)

At 4-bit, roughly 0.6 GB per billion parameters:

| Model size | Download | Note |
|---|---|---|
| 1B | ~0.65 GB | MiniCPM5-1B is Apache-2.0 and tuned for tool use |
| 1.7B | ~1.0 GB | |
| 3B | ~1.9 GB | |
| **4B** | **~2.5 GB** | current default |

Heavier quantization (Q3) saves a further fifth and costs disproportionately in
tool-calling accuracy, which is already this arm's weakest property. Use the
small tier as an honest offer on a small machine, never as the default.

#### 4. Cut live memory — and the finding that reframes bundling

**Every one of these is free, large, and only available if we launch the runtime
ourselves.** They are server-process settings, so a user-installed Ollama gives
us its defaults and no say. Those defaults are actively hostile on a laptop:

| Setting | Default | What to set | Why |
|---|---|---|---|
| `OLLAMA_MAX_LOADED_MODELS` | **3** | `1` | Three resident models on a 16 GB laptop is a memory disaster |
| `OLLAMA_KEEP_ALIVE` | `5m` | short, or `0` | Otherwise ~3 GB stays held for five minutes after every reply |
| `OLLAMA_NUM_PARALLEL` | 1–4 | `1` | Memory scales by `NUM_PARALLEL × CONTEXT_LENGTH` |
| `OLLAMA_CONTEXT_LENGTH` | 4096 | capped deliberately | Agent transcripts grow; the KV cache grows with them |
| `OLLAMA_KV_CACHE_TYPE` | full | `q8_0` | Compressed KV cache, roughly halves that cost |
| `OLLAMA_FLASH_ATTENTION` | off | `1` | Faster long-context on CUDA |
| `OLLAMA_MODELS` | user home | our data dir | So uninstalling the app reclaims the ~4 GB |

**So bundling the runtime is not only a convenience decision, it is a memory
policy decision.** That is a stronger argument for owning the process than
anything in the earlier bundle-versus-fetch discussion.

#### 5. Cut compute per task

- **Expose fewer tools to a local model.** Every tool schema is re-sent on every
  step of every task; a small model pays for that in both speed and accuracy.
- **Cap the agent loop** for local models.
- **Never route computer control or Auto to a local model** — already the plan's
  position, now also a resource argument.

#### 6. Don't offer what will not work

Nothing in the codebase reads hardware today — no memory, GPU or disk probing
anywhere. All three are close to one-liners (`os.totalmem()` in the harness,
`app.getGPUInfo()` in Electron main). With them:

| Machine | Offer |
|---|---|
| Dedicated NVIDIA GPU, 6 GB+ VRAM | 4B, normally |
| 16 GB RAM, integrated graphics | 1.7B, with a plain warning about speed |
| 8 GB RAM | Do not offer; recommend another path |

Also check free disk before starting, and offer an in-app delete afterwards.

#### 7. Make the wait cheaper rather than shorter

Download in the background so the other arms stay usable meanwhile; Ollama's
pull already resumes.

### Which agent CLI — reversed by testing

This plan provisionally picked **Qwen Code**, on the reasoning that it was the
simpler integration: no sign-in step, no environment stripping, a plain `-m`
flag, and one vendor shared with the model.

**Testing on 2026-08-20 reversed that.** Qwen Code never invoked a single tool
when driven by a custom OpenAI-compatible provider, and filled the gap with
confident fabrication. Hermes, same model and same runtime, read real files and
returned real contents. The full elimination chain is [B-21](../known-bugs.md).

So **Hermes is the default for this path** — with one substantial caveat that
cuts against bundling it.

**Hermes installs a great deal.** Observed during a single install: managed `uv`,
a Python 3.11 virtualenv, a git clone of the agent, `ripgrep` and `ffmpeg` via
winget, a Browser Use CLI, telemetry enabled by default, and — the one that
matters — the Cua computer-use driver registered as a **scheduled task
auto-starting at every logon with `RunLevel=Highest`**, behind a UAC prompt.

That is a very different proposition from shipping a self-contained binary.
Bundling it means shipping an elevated auto-starting daemon to customers, which
is close to the opposite of what the plan's accountability argument asks for.
Qwen Code is the lighter install and the broken one; Hermes works and is heavy.

Neither the licence nor the capability decides this — both are permissive, both
work. **Decide it on what the installer does to the customer's machine**, and do
not treat the bundling recommendation above as settled until that is resolved.

### Traps

- **`hermes` deletes `OPENAI_API_KEY` and `OPENROUTER_API_KEY`** from its child
  env (`hermes.ts:127-133`), because a leftover key makes it resolve to
  OpenRouter and send no auth header. No other arm may set a workspace key that
  leaks into it.
- **The two CLIs disagree on model format.** Hermes takes
  `custom:<host>:<model>` over ACP `session/set_model` and ignores argv; Qwen
  takes the bare model id in `-m` after its `settings.json` is written. Both are
  the drivers' business — the picker id stays `host::model` either way.
- **The probe times out at 1200 ms** (`local-inject.ts:147`), so a cold runtime
  that is genuinely starting can read as absent. Re-probe rather than concluding.
- **`ollama` and `local_ollama` are the same URL under two host ids.** Dedup by
  `baseUrl` means encoded ids use whichever comes first in `LOCAL_HOSTS`.
- **A persisted `modelSelection.model` is never validated** against the live
  catalog, so a bot can hold an id for a model that has since been removed.

## Phase 1c — Path C, hosted capability then credits

Living spec:
[2026-08-25-001](2026-08-25-001-path-c-hosted-trial-plan.md). Not a hard-capped
trial. Same *shape* as `cloudflare/composio-broker/` (hashed install token, bearer
on every usage route, registration + hot-path limiters, `REGISTRATION_MODE`).
The Worker is the router: capability first, frontier credits as a ceiling.
Easy tasks stay on the cheap model even with a full ledger; hard tasks stay on
that model once credits are gone. Monthly top-ups restore frontier. Rate limits
are for heavy users, not a brick wall. Chooser arm is live; packaged builds
need `OMB_INFERENCE_BROKER_URL` (no default).

## Open decisions

1. **Which provider backs Path B first.** xAI is what exists today with zero
   additional work. An OpenAI-compatible HTTP driver would widen it, and issue
   [#54](https://github.com/milind-soni/OpenMausBot/issues/54) upstream wants the
   same thing — check it before building a second one.
2. **Whether the chooser can be re-opened.** Onboarding today can only be
   re-shown by clearing `omb-email-gate` by hand. A path chooser that can never
   be revisited is worse, since the arms convert into one another.
3. **Whether a single-arm build skips the chooser entirely** or still shows it
   as a one-option confirmation.

## Risks

- **Upstream reworks onboarding again.** Likely, given the 17 August burst. The
  mitigation is structural: our files, one line of theirs. If that line moves, a
  merge conflict is one line long.
- **The arms convert badly.** Each arm must still be able to hand off to another
  without a reinstall (local ↔ BYOK ↔ hosted). Hosted itself no longer expires
  into a dead app — see [2026-08-25-001](2026-08-25-001-path-c-hosted-trial-plan.md).
- **Three arms is three support surfaces**, as 003 notes. The chooser only earns
  its place if each failure explains itself.
