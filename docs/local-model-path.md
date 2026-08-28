# The local-model path: a standing register

Current git / goals / stop-lines: [`agent-status.md`](agent-status.md). This
file is the tensions register, not the snapshot.

Everything known to bite the open-weights first-run path, with the position we
have taken on each. **This file exists so the same surprise is not discovered
three times.** Plan
[005](plans/2026-08-20-005-three-path-first-run-plan.md) says what to build; this
says what to build around.

Add to it whenever something new turns up, including things already worked
around — the value is in one list, not in a tidy one. Each entry says what it is,
why it matters, and where we stand:

Outright defects go in [`known-bugs.md`](known-bugs.md) instead; this file is for
tensions and decisions. Where they overlap, both should say so.

- **Decided** — settled, and code either does this or should.
- **Proposed** — the recommended answer, not yet agreed.
- **Open** — genuinely undecided, or waiting on evidence.

## The spine: four things must be true

A local bot answers only when all four hold. Most entries below hang off one of
them.

| # | Precondition | Ours to do? |
|---|---|---|
| 1 | An inference runtime is running | **Yes** — fetch a pinned zip and spawn it (Windows); see [plan 003](plans/2026-08-21-003-local-runtime-install-plan.md) |
| 2 | A model is pulled into it | **Yes, entirely** — built |
| 3 | A `custom`-access agent CLI is installed | **Yes, in-app Hermes** — official installer; not yet bundled in NSIS |
| 4 | The bot points at `host::model` | Yes, trivially |

---

## Getting it onto the machine

### Everything this path needs must install in one step — **Decided**

The arm currently asks for a runtime, then a model, then an agent, revealing each
only after the last is satisfied. Tested end to end on 2026-08-20 that is plainly
wrong: the work never looks finite, and the second download reads as a repeat of
the first because the model family and the agent share the name Qwen.

**The target is one action.** Present the three pieces up front as a checklist so
the remaining work is visible from the start, and install what we can in a single
pass rather than serially. This is the requirement the two items below exist to
serve, and it is also why the bundling question matters beyond convenience —
a piece we ship is a piece the checklist starts with already ticked.

Defects tracked as [B-11 and B-12](known-bugs.md).

### How each piece should arrive — **Decided** (runtime: first cut on Windows)

Settled after testing the arm end to end on 2026-08-20.

**Model — done.** Fetched with real progress, removable in-app.

**Agent CLI — bundle it in the installer.** Qwen Code is **Apache-2.0** and
Hermes is **MIT**, both verified against their repositories, so the licence gate
that blocked this is clear. Testing turned it from a convenience argument into a
correctness one: bundling **deletes three of the four bugs found that night, by
construction rather than by fixing them.** [B-12](known-bugs.md) (PATH staleness)
cannot occur when `config.cli` points at an absolute path we own.
[B-13](known-bugs.md) (shim resolution) cannot occur when we ship the payload
rather than a vendor stub. And [B-14](known-bugs.md)-class config drift is
bounded, because a pinned version cannot move its settings format underneath us
without us choosing it. Cost is tens of megabytes.

**Runtime — fetch the pinned portable zip and launch it ourselves.** Not winget,
not the vendor installer. It is the only option that applies the memory policy in
`server/local-runtime.ts`, which is written and inert because those are
server-process settings a runtime someone else started will ignore. It is also
the only way to set `OLLAMA_MODELS` into our data directory so uninstalling
reclaims the space, and the only way to pin a checksummed version rather than
handing a paying customer a component that silently auto-updates on a channel we
neither control nor audit.

Cost: about 1.4 GB, most of it NVIDIA libraries a laptop with integrated graphics
will never use. Unavoidable while VRAM stays unreadable — see the GPU entry.

**Build order:** CLI first (smallest, unblocked, retires three bugs), then
runtime ownership, then the checklist rework in [B-11](known-bugs.md).
As of 2026-08-21 the arm installs Hermes in-app (not bundled) and shows the
checklist including Local computer; the CLI-bundle vs fetch question is not
reopened here. The Local computer is a required *step* (Continue is still
allowed if it fails). See the Local VM entry.

### Local VM on this arm — **Decided** (tightened 2026-08-22)

Path A **stands up computer control as part of first-run**, not as a
hands-off optional extra (the OpenMausBot Cua Local VM, not Hermes' own
CUA). The checklist row is **Local computer**, never "(optional)". After
Hermes, the next pane is the VM.

Windows virtualization is three stops, not one skip (**Decided 2026-08-22**):

1. **Windows setting off** — turn on Virtual Machine Platform and WSL
   (one administrator prompt). Then a restart.
2. **Restart waiting** — primary CTA is **Restart Windows**. Do not send
   people to BIOS. Do not auto-reboot.
3. **Firmware off** — hypervisor really absent. Copy only: turn
   virtualization on in BIOS. The app cannot do that.

Do not treat `wsl --status` "virtualization is not enabled" as firmware-off.
Do not treat a leftover `CBS\RebootPending` key as a restart when a required
Windows feature is still Disabled — turn that feature on first.

The first WSL guest (Podman machine) must not steal focus with Microsoft's
welcome UI. Mark `HKCU\...\Lxss\OOBEComplete` before starting the machine
([B-28](known-bugs.md)).

Chat **still works** if WSL, virt, Podman, `machine start`, or the image
pull fails — Continue is the labelled skip, never the success path while
a Local computer step is still doable.

Windows first-run: WSL if missing (one UAC), checksum-pinned per-user Podman
MSI, `machine init --memory 6144` (WSL cannot `machine set --memory` after
create — measured 2026-08-21, Podman 6.0.2), `machine start`, then existing
`POST /api/local-computer/pull` and `run`. An existing 2 GiB guest is
removed and re-inited. Never Docker Desktop. Call those routes from
`LocalModelArm.tsx` (ours); do not fork upstream Settings cards.

A 3B model may drive the desktop poorly — that is copy, not a reason to skip
the sandbox. **16 GB + Granite + Local VM was measured 2026-08-23** on this
15.7 GB / RTX 2060 6 GB box: 3B + VM runs; `ibm/granite4.1:8b` at 8k
loads but leaves **0.6 GB RAM and ~400 MiB VRAM** free. That measurement
is why 005 puts a **16 GB** machine in **tight** (comfortable floor
**24 GB**), not why we keep Granite. **First-run** is Qwen3-VL
Thinking 8B @ 32k
([005](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)).
**`qwen3-vl:4b` at 8k + VM (2026-08-23):**
model ~3.57 GB in VRAM; GPU 5554 / 6144 MiB used (402 MiB free); system
RAM **2.09 GB** free of 15.72. Tighter VRAM than hoped; more RAM headroom
than Granite 8B. Turn finished. Do not treat 6 GB VRAM as comfortable.
This tee used the **owned** zip (`local-runtime\ollama.exe` on
`127.0.0.1:11434`), not a user tray daemon — memory policy applied.
Docker Desktop
coexistence is a support trap, not the customer path. On this mixed-dev box
`machine start` failed under **WSL 2.2.4 / kernel 5.15** because Podman's
nested systemd died (quitting Docker did not fix it). The same stock 6 GiB
guest **started in ~10 s** on **WSL 2.7.12 / kernel 6.18**, and
`podman run --rm quay.io/podman/hello` worked. Details in
[plan 2026-08-21-002](plans/2026-08-21-002-local-path-vm-considerations.md)
and the live walk
[plan 2026-08-21-005](plans/archive/2026-08-21-005-path-a-live-walk.md).

**NSIS first-run, 2026-08-22 — work still open.** The packaged wizard
installs Ollama (pinned zip), Granite, and Hermes. WSL UAC ran and the
component is on disk, but the Local computer row never advanced. Gaps:

- [B-25](known-bugs.md) — `wslPresent` vs `--no-distribution` (no distros ⇒
  exit -1 ⇒ still not `wslReady`, Podman never auto-kicks).
- Wizard used to hide the trigger as **Install WSL** and "(optional)" —
  copy/CTA change is in tree; packaged 0.1.27 still has the old screen.
- [B-26](known-bugs.md) — chooser flag in `%APPDATA%\OpenMausBot` skips Path A
  after a data-dir wipe; defer lands on clipboard EngineSetup.
- [B-27](known-bugs.md) — no virt/VMP probe; this box cannot start WSL2 until
  firmware/optional components are on.
- Serial CTAs (runtime → model → Hermes → WSL) vs the one-action target above.
- Ship the in-tree Hermes inject/session-load fixes in the next `package:win`;
  the 2026-08-21 NSIS the walk used did not include them.

Walk and ordered work:
[`plans/2026-08-22-001-path-a-nsis-first-run.md`](plans/2026-08-22-001-path-a-nsis-first-run.md).

**Sequencing caveat:** [B-15](known-bugs.md) may outrank all of it. A setup flow
does not help a customer whose machine refuses to install the app.

### The agent CLI is a wall for non-technical users — **Proposed**

Preconditions 1 and 2 are solvable. Precondition 3 currently means running
`irm https://… | iex` in a terminal, and upstream's UX for it copies the command
to the clipboard and opens a **blank** terminal to paste into
(`electron/terminal-launch.mjs` never passes the command as argv, deliberately).
Someone non-technical will not do this.

**Best practice: bundle the agent CLI in the installer.** Both mechanisms already
exist and are proven — `electron-builder.yml` ships `android-platform-tools` in
`extraResources`, `server/drivers/phone-proxy.ts:46` resolves it from
`OMB_RESOURCES_PATH`, and per-instance `config.cli` is first-class (the ACP core
spawns it and probes `--version` for availability). This is also exactly the
wedge plan 003 describes: bundling is territory a FOSS project will not enter.
Gated on the licence check below.

### The runtime can be bundled, and Ollama endorses it — **Decided (fetch, not bundle)**

Ollama is MIT (verified at tag v0.32.15). Its Windows docs publish
`ollama-windows-amd64.zip` explicitly so you can "embed Ollama in existing
applications". The tray installer is a different artefact and is the one that
auto-updates.

At ~1.36 GiB (v0.32.15: 1,460,302,386 bytes, SHA-256
`a1d11d46a944f9c7521f5e9a3a5db51cd3365401da627d96c204698fc6914ff9`), bundling it
into the base installer would make a ~100 MB download into ~1.5 GB, paid by
everyone including the majority who never touch a local model. **Fetch it on
first use of this path instead.** There is no CPU-only Windows amd64 zip;
integrated-graphics machines still pay for NVIDIA libraries.

The bundled variant remains right for an air-gapped customer, and
`VITE_INSTALL_PATHS` plus packaging metadata is already the mechanism for
shipping that as a separate build.

Build notes: [plan 2026-08-21-003](plans/2026-08-21-003-local-runtime-install-plan.md).

### Ollama for Windows auto-updates itself, silently — **Decided (avoid the tray)**

The silent-update CVE write-up is still **not** cited; it was secondary. The
structural point is settled against first-party docs: auto-update lives in
`OllamaSetup.exe`'s tray app (`ollama app.exe`). The standalone zip we fetch
contains only the CLI and GPU libs; we spawn `ollama serve` and own the
process. We never install the tray.

If `127.0.0.1:11434` is already answering (a customer who installed Ollama
themselves), we leave that daemon alone and the memory policy stays inert.

### LocalAI is not a substitute — **Decided**

Same layer as Ollama (an inference runtime), not an agent CLI, so it removes
nothing from the four preconditions. MIT, and good on AMD/Intel/Vulkan hardware,
but its docs lead with Docker and its binaries are Linux/macOS only — Windows
means Docker or WSL, which is the dependency this whole path exists to avoid.
Keep as a **second** host later, not a replacement.

### LocalAI already collides with oMLX — **Open** ([B-03](known-bugs.md))

LocalAI's default port is 8080, which `local-inject.ts:20` assigns to oMLX. A
LocalAI user today is detected and **labelled "oMLX"**, with ids encoded as
`omlx::…`, and the loaded-state probe hits `/v1/models/status`, an oMLX-only
endpoint. It works by accident under the wrong name.

Not a one-line fix: hosts deduplicate by base URL, so two entries on 8080 means
one silently wins. Telling them apart needs a probe-time discriminator such as
LocalAI's `/readyz`.

### A network host is parked — **Decided, revisit on demand**

One GPU box serving a team would let every seat download nothing, and is what a
compliance customer actually wants — their rule is that data stays in the
building, not on the laptop. All seven entries in `LOCAL_HOSTS` are hardcoded to
`127.0.0.1`, so it is not possible today.

Parked because **nobody has asked for it**, and `AGENTS.md`'s first rung is to
skip a speculative need and say so. Note the reason: *not* "too technical for a
layman" — the layman never sees it, it is set once by whoever deploys, and those
seats get less work, not more. If a locked-down customer appears, this is the
change that makes them possible.

---

## What it costs while running

### Ollama's defaults are hostile on a laptop — **Decided**

It keeps up to **three** models resident and holds each for **five minutes**
after the last reply. A 16 GB machine can sit on several gigabytes of idle
weights while someone reads an answer.

**Best practice, and the policy in `server/local-runtime.ts`:** one loaded model,
a 60-second hold, one parallel request, a capped context, a `q8_0` KV cache, and
flash attention on.

**These are server-process settings, so they only apply to a runtime we launch.**
That is the strongest argument for owning the process — it is a memory decision
before it is a convenience one. The per-request `keep_alive` override is not
available to us: the requests are made by the agent CLI, not by us.

### The download is ~3.9 GB and cannot be eliminated — **Decided**

Weights are resident or the model does not run; there is no partial or streamed
inference. First-run is `qwen3-vl:8b` Thinking (~6.1 GB Q4_K_M) at 32k
([005](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)).
Granite 3B (~2.5 GB) and `qwen3-vl:4b-instruct` (~3.3 GB) are leftover
tags, not `modelReady`. Do not treat leftover Instruct 4B/8B as
`modelReady`. The levers, in order of value, are listed
in [plan 2026-08-20-005](plans/2026-08-20-005-three-path-first-run-plan.md) — reuse a runtime already present (100%, already works, just not
surfaced), a network host (100%, parked), match the runtime variant to
detected hardware, and a smaller model tier.

### Unpackaged `pnpm dev` still prefers Claude — **Decided** (observed 2026-08-24)

`PREFERRED_ENGINE` defaults to `claudeAgent`. The packaged bake is
`hermesAgent` + `ollama::qwen3-vl:8b`. A Vite new bot on a machine that
already has Claude CLI lands on Claude (`Not logged in · Please run
/login`), not 8B. Pick `qwen3-vl:8b (Ollama)` in the model menu. Do not
flip the unpackaged default without a plan — that would surprise every
dev who uses Claude.

### Local VM selected without a Cua image fails the turn before the model — **Decided**

`computer: "vm"` tries to start the sandbox on **every** message. Missing
image → Retry card `Prepare the Cua desktop image with Driver 0.20.0`.
**Runs on → Off** to chat. “This computer” stays grey on local-inject.

Two Windows false-health cases that produce the same card (or “Start podman
first”) while the other PC looks fine: Docker Desktop’s CLI can exit 0 with
an empty `ServerVersion` when the engine is down, so a Docker-first probe
claims the daemon is up and then cannot see the Podman image store. A
sleeping WSL Podman machine still lists as running, but `podman info` can
take ~70s; a 10s probe reports the daemon down. Status now prefers Podman
on Windows, requires non-empty `info` stdout, skips `info` when
`podman machine inspect` is not running, and waits 90s for `info` after a
wake. A leftover `driver-0.20.0-v4` container against a `v7` image is
“recreate it”, not a missing image.

### Hermes ACP on CPU vs the 20 min stall — **Decided** (measured 2026-08-24)

Admin, no NVIDIA, Vulkan off, 32k: Hermes ACP 8B gold **cancelled** at
default `TURN_STALL_MS` (20 min) with no ACP chunks — not truncated,
not `0xc0000409`. UI “hello”/“hey” on 8B **or** 4B Thinking sits at
**0 tok** for minutes (Hermes tool catalog + CPU prefill). Opening the
picker while Ollama is busy can flash **Hermes not installed** until
`GET /api/instances` returns. Skip-Hermes compact catalog on this CPU
box emits tools: 4B **166 s**, 8B **240 s** vs Hermes ACP 8B **20 min /
0 tools**. Same prompt on NVIDIA (RTX 2060 6 GB, 32k): Hermes ACP 8B
**pass** at **~7.5 min**, three `tool_call`s. Splits, digests, and the
undici 5 min header trap:
[2026-08-24-006](plans/2026-08-24-006-skip-hermes-cpu-tee.md). GPU is the
speed fix; a longer stall is only a CPU-box model verdict. Chat in the app still
goes through Hermes.

### Slowness compounds in a way a chatbot's does not — **Decided**

An agent makes many model calls per task, each re-reading a growing transcript,
so latency multiplies by step count *and* worsens as the task runs. Never route
Auto to a local model. Computer control on this path is the Local VM sandbox,
not the host desktop; a 3B model may drive it poorly, which is copy, not a
reason to skip the sandbox. Expose fewer tools to one: every tool schema is
re-sent on every step, costing both speed and accuracy. Hermes ACP still
offers native `web_extract` / host `browser_navigate` beside Cua; Granite
will pick extract and the person watching the VM sees nothing. When the
`computer` MCP server is mounted, disable Hermes `web` and `browser`
toolsets (`ensureHermesComputerDisablesWeb`). Do not mount Composio on
local-inject turns (`localInjectOmitsConnectedApps`): Granite spends the
turn in `tool_search` looking for a Browser app. Keep those twelve Cua tools
eager (`ensureHermesComputerToolsEager`): Hermes otherwise defers every
`mcp-*` tool behind `tool_search` the moment Composio is attached, and
Granite writes the JSON in chat instead of calling it. Do not add browse
recipes to the system prompt — upstream's Local VM paragraph already says
inspect the desktop before acting. The opener navigates the URL it was
given; do not rewrite paths. `vm_open` binds the frontmost on-screen
Chromium window (`list_windows` `z_index`) to navigate, then **looks at
whoever is frontmost after navigate** (a leftover Beehiiv window and a new
Example Domain window can share one pid). The tool text reports the seen
title and must not claim the requested URL landed when that look did not
change. Cua 0.20.0 has no active-tab field. `vm_window` with `{}` still
fills pid from frontmost Chromium. `vm_click`
with `{index}` fills Cua's pid/snapshot/token from that reading. Do not
add a browse recipe that names those tools.
Register those tools as `vm_open` / `vm_launch` (not `mcp__computer__*`) so they look
like `extract`. For a local-inject pick, ACP's tool expander starts from
Hermes' own `file` and `terminal` toolsets instead of the `hermes-acp`
editor bundle (`ensureHermesLocalCatalog` / `applyTurnEnv`), so `vm_open`
fits in 8k. Cloud Hermes is unchanged. Do not name `vm_open` or
`mcp__computer__*` in the prompt — Granite then emits that JSON as
assistant text. Growing `OLLAMA_CONTEXT_LENGTH` on a 16 GB box still
costs KV RAM (Granite 8B leftover was 0.6 GB). **005 still sets 32k on
both tiers** and labels 16 GB **tight**. Do not grow past 32k to paper
over a fat Hermes catalog.

The click → see screen → click loop is **not inside the Grok (or Hermes)
provider.** `drivers/grok.ts` is chat-completions with no computer tools.
`grokAgent` is ACP and mounts whatever MCP the harness attached, same as
Hermes. Matching Grok Bot's unsupervised hands means **grokAgent (or
Claude / Codex) plus Local VM or Box**, not HTTP Grok. A local-inject
model on the Local VM is the sandbox: you watch and approve each `vm_*`
click. Auto-approve cannot turn those clicks unattended (`server/computer-routing.ts`).
The Local VM does not keep working with the lid shut. Qwen's
`computer_use__*` tools still name the Windows host desktop (B-19); they
are carded, not counted as Path A computer use.

Coworker-level computer use (honest observation after every act, session
that still holds it; not a clone of Grok Bot or Cowork) is
[`docs/plans/2026-08-22-002-computer-use-coworker-loop-plan.md`](plans/2026-08-22-002-computer-use-coworker-loop-plan.md).
A successful `vm_open` reports the seen window, not the requested URL, when
those disagree. The last window reading (title, excerpt, click binds) lives
on the harness, not in the MCP child, so the next message can still click
after Hermes ACP exits. Take-the-wheel, VM recreate, and another bot's turn
on the shared desktop drop that look. Window titles and AX trees are
**untrusted**; the replay stanza is fenced so a page cannot close it and
inject instructions.

**P8 (2026-08-22):** stop adding Granite-specific computer wrappers. Path A
keeps eight `vm_*` tools. Unsupervised multi-step is Claude / Codex /
grokAgent. See
[`docs/plans/2026-08-22-008-computer-safety-eval-plan.md`](plans/2026-08-22-008-computer-safety-eval-plan.md).

**Same-turn recover-and-click is a model-class miss, not a missing `vm_*`
name — Decided (measured 2026-08-23).** After `vm_open` reports a
Chromium error / leftover chrome, Granite 3B writes MFA/login prose
instead of clicking a numbered control. Gold turns on this box (native
tee, same Local VM, same eight tools, 8k):

- **3B** — example.com: same-turn `vm_click` `[81] Learn more` (pass).
  Beehiiv/404 look: `vm_click` `[55] Work` plus login prose (fail).
- **8B** — example.com: same-turn `vm_click` `{index:1}` which is not a
  look index (fail). Beehiiv: open failed `ERR_HTTP_RESPONSE_CODE_FAILURE`,
  then Hermes `search: browser`, honest stop, no MFA essay (not a
  recover-and-click).
- **VL (`qwen2.5vl`)** — plumbing dead (Hermes `MEDIA:<path>`); not first-run.
- **Qwen3-VL 4B** — 2026-08-23. Unsuffixed `qwen3-vl:4b` (Thinking) **fills
  8k** (`truncated = 1`) and emits no ACP tools on the combined prompt.
  **`qwen3-vl:4b-instruct`** teed through Hermes: chat, `write_file` /
  `read` / `terminal` / `vm_open` fired. Workspace file contains `8241`.
  Ollama tools+PNG **200** on Thinking. JPEG fuse still **off**. Not a
  gold-turn click winner. First-run **in code** is Thinking 8B @ 32k (005).
  2026-08-24 Admin (no NVIDIA): default Ollama **Vulkan** path crashed
  `llama-server` (`0xc0000409`) at 8k and 32k. Vulkan off → CPU:
  skip-Hermes Thinking **tools at 8k and 32k** (compact catalog). Hermes
  ACP 8k truncation remains the NVIDIA tee. 005 **does** bump default
  context to 32k for Thinking 8B. Admin 2026-08-24 Hermes ACP **8B @ 32k**
  (Vulkan off, CPU, VM down): `session/new` ok, then **20 min stall
  watchdog** cancelled the prompt (`TURN_STALL_MS`). No ACP `tool_call`,
  not truncated, no `0xc0000409`. Same cancel shape as 4B @ 16k on this
  box. Not a 32k-full thoughts miss.
  [`plans/2026-08-23-006-qwen3vl-replace-granite-plan.md`](plans/2026-08-23-006-qwen3vl-replace-granite-plan.md).

**Qwen-CUA is not a Path A substitute — Decided (evaluated 2026-08-24).**
[Qwen-CUA](https://arxiv.org/abs/2608.02352) is a **397B-A17B** (Max
**>1T**) screenshot→keyboard/mouse policy. The GitHub release is
report + Playwright demo; **weights are not in the repo.** 86.2
OSWorld-Verified is a GPU-box specialist score, not a 16 GB Ollama
pull. **Path A first-run** is `qwen3-vl:8b` Thinking @ 32k
through Hermes ([005](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)).
GPU-box computer-use pick remains EvoCUA until a downloadable CUA checkpoint
exists. There is **no 8B Qwen-CUA**; Qwen-CUA is a 397B-class policy, not
`qwen3-vl:8b`. The downloadable small CUA-on-Qwen3-VL is EvoCUA-8B
(GPU box, not first-run). **Qwen3.8** (Aug 2026, [blog](https://qwen.ai/blog?id=qwen3.8))
is a **new family**, not Qwen3-VL: open VL is **`qwen3.8:27b` (~18 GB)**,
no 4B SKU, thinking on by default. Not Path A. Write-up:
[`plans/2026-08-24-004-qwen3vl-vs-qwen-cua.md`](plans/2026-08-24-004-qwen3vl-vs-qwen-cua.md).

Neither Granite arm met the pass bar (error-page click **and** example.com).
First-run **in code** is `qwen3-vl:8b`. Path A stays “open and read.”
Details: [`plans/archive/2026-08-23-002-path-a-drive-sites-bakeoff.md`](plans/archive/2026-08-23-002-path-a-drive-sites-bakeoff.md).

Frontier engines on the same Local VM or a VPS get a **fused screenshot**
after mutating Cua tools (`observe-computer-mcp`, Cua names kept). Path A
does not send JPEGs to Granite: text AX only. An env flag
(`OMB_COMPACT_OBSERVE_IMAGE=1` in `server/compact-computer-observe.ts`) can
capture after mutating `vm_*` for **VL tags** (`qwen3-vl`, qwen2.5vl,
granite-vision, llava). **Off** for Granite 3B/8B. Instruct on 8k cannot
hold a JPEG on the Hermes tool role (Ollama **8500 > 8192**); the wrap
captions via skip-Hermes `/v1` instead. Hermes 0.20.5 MCP `MEDIA:<path>`
is patched to `_multimodal` if a JPEG ever fits. Paste uses ACP image
blocks. Do **not** make `qwen2.5vl` the chat model: Ollama reports that
tag as vision **without** tools. **Qwen3-VL 4B Instruct** is tools
**and** vision on Ollama (teed). **First-run** is Thinking 8B
@ 32k ([005](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md));
keep Pipe B captions until an 8B+32k JPEG+tools tee. Details:
[plan 007](plans/2026-08-23-007-hermes-eyes-plan.md). Do not
start a first-party Ollama driver unless asked; Path A is Hermes.
See
[`docs/plans/2026-08-22-005-computer-frontier-observe-plan.md`](plans/2026-08-22-005-computer-frontier-observe-plan.md)
and the bake-off
[`plans/archive/2026-08-23-002-path-a-drive-sites-bakeoff.md`](plans/archive/2026-08-23-002-path-a-drive-sites-bakeoff.md).

The shared Local VM is one desktop: leftover Chromium is expected **while
the VM is running** (harness quit does not kill it). Cookies and files in
`/home/cua/workspace` (Chromium under `.browser-profiles`) are shared, not a
security boundary. Stopping the container ends GUI windows (X restarts);
Start brings the desktop back without recreate. Per-bot mode is isolation.
Recreate is for a drifted image or a broken safety contract. See
[`docs/plans/2026-08-22-006-computer-durable-shared-plan.md`](plans/2026-08-22-006-computer-durable-shared-plan.md).
Grok-style extra seats (second VNC / two Chromes) were **probed 2026-08-28
and failed**. The decided product is **one Chrome, per-bot window piles,
crop in the app**
([002](plans/2026-08-28-002-shared-vm-seats-plan.md)). Mutex stays until
that lands — today a second Shared bot gets
[B-29](known-bugs.md) (`already being used by another turn`). Do not
mutate the Admin VM during a live Computer session.

---

## Cleaning up after it

### Models land outside anything we control — **Open, and currently live**

`OLLAMA_MODELS` is part of the policy above, so it only applies to a runtime we
launch. Today models go to `%USERPROFILE%\.ollama\models`, and **uninstalling
OpenMausBot leaves several gigabytes behind** somewhere a non-technical person
will never find.

**Best practice:** point `OLLAMA_MODELS` at our data directory as soon as we
launch the runtime, and have the uninstaller reclaim it.

### There is no in-app delete — **Decided, built**

Removal used to mean `ollama rm <model>` in a terminal, which is the same
barrier as the install and therefore no answer at all for the people this path
has to serve.

`DELETE /api/local-model` proxies the runtime's `DELETE /api/delete` and rebuilds
the fleet afterwards, since the catalog still lists a model until it does. The
arm offers it behind a two-step confirmation, because deletion is immediate and
has no undo.

**No amount reclaimed is shown, deliberately.** Ollama stores layers by content
hash and shares them between models, so what is actually freed depends on what
else is installed. A confident number would frequently be a wrong one.

A 404 from the runtime is treated as success — already gone is the state the
caller wanted.

### A deleted model leaves bots pointing at nothing — **Open** ([B-04](known-bugs.md))

`modelSelection.model` is never validated against the live catalog, so a bot
keeps an id after the model is gone and fails when it next tries to answer. The
delete button above turns this from an accident into something a user can do to
themselves in two clicks.

Partly mitigated: the confirmation says any bot using the model will need a
different one, and the fleet is rebuilt so the picker stops offering it. **Not
solved:** an existing bot still holds the dead id. The real fix is to notice at
send time and surface "this model is gone, pick another" instead of failing, and
that belongs with the wider point below about making the model visible and
switchable at the point of failure.

---

## Correctness traps

### No GPU detection, and the tier is RAM-only — **Decided**

`app.getGPUInfo()` lives in Electron's main process; the harness is separate and
cannot see it. `server/machine.ts` therefore scores on memory alone. The blind
spot is **one-sided** — a machine with a dedicated GPU is scored as if it had
none — so the tier is a floor rather than a guess. The common case for this
audience, a business laptop with integrated graphics, has no VRAM anyway.

### Nominal 16 GB reads as 15.7 GB — **Decided**

An OS reserves some of what is installed, so a nominal 16 GB machine reports
about 15.7. A floor of exactly 16 GB therefore put **every** 16 GB laptop — an
extremely common machine — in the tight tier, and quietly moved the comfortable
tier's real start to 32 GB.

The floor is now **15 GB**. Found by running the probe against a real machine
rather than by reading the constant, which is the argument for doing that more
often.

### Getting a real GPU signal — **Open, and harder than it looks**

The tier would be much better with one: 16 GB plus a discrete card and 16 GB with
integrated graphics are completely different propositions, and we currently
guess conservatively because we cannot tell them apart.

Attempted and abandoned for now. **Neither Electron's `app.getGPUInfo()` nor
WebGPU's adapter info reliably exposes VRAM** — they give vendor and device ids,
not memory. Building a tier on a number we cannot actually read would be worse
than the honest RAM floor. Vendor id alone ("is there a discrete card") is
obtainable and is a weaker signal than it sounds, since a low-end discrete GPU
with 2 GB is worse than integrated graphics on a 32 GB machine.

Revisit if a dependable source of VRAM appears, or if Ollama's own detection can
be read back after a first load.

### The probe times out at 1200 ms — **Decided**

`local-inject.ts:147`. A cold runtime that is genuinely starting reads as absent.
Re-probe rather than concluding it is missing.

### `ollama` and `local_ollama` are the same URL — **Decided**

Two host ids on one base URL; deduplication means encoded ids use whichever comes
first in `LOCAL_HOSTS`. Match on the `::model` suffix rather than a host prefix
— `server/local-model.ts` does.

### The two agent CLIs disagree on model format — **Decided**

Hermes takes `custom:<host>:<model>` over ACP `session/set_model` and ignores
argv; Qwen takes the bare id in `-m` after writing its `settings.json`. Both are
the drivers' business; the picker id stays `host::model` either way.

### Hermes strips provider keys — **Decided**

`hermes.ts:127-133` deletes `OPENAI_API_KEY` and `OPENROUTER_API_KEY` because a
leftover key makes it resolve to OpenRouter with no auth header. **No other arm
may set a workspace key that leaks into it** — a real cross-arm constraint.

---

## Being honest with the user

### Quality is the biggest risk, and it is not a bug — **Decided, now observed**

A model small enough for a normal laptop is weakest at exactly this workload.
A developer reads that as "my laptop is slow"; everyone else reads it as "this
product is broken", and that arrives as a refund rather than a bug report.

**Observed on the first real task, 2026-08-20.** Asked to summarise a web page,
`qwen3:4b` made its first tool call correctly — `WebFetch` ran and was approved —
and then, for its second, printed a tool call into the chat as text instead of
invoking it:

```json
{ "name": "write_file", "arguments": { "file_path": "/home/user/project/…", … } }
```

Three failures visible in one reply. It **lost the tool protocol** after a single
successful call, which is the compounding this plan predicted. It **invented a
Linux path on a Windows machine**, a plausible-looking string from training data
rather than the real working directory. And it **decided to write a file at all**
when it had only been asked for an overview.

The important part is what a user sees: a block of JSON, no error, and nothing
having happened. The bot appears to be working right up to the point where it
did nothing — which is precisely the failure mode a non-technical person cannot
diagnose, and cannot report usefully either.

**Three further tasks, same session, same night.** Deliberately escalating, each
in a fresh bot.

*Grounding — "what folder are you working in, and what's in it?"* Gave a real
workspace path, but from the memory file already in its context rather than from
a tool call, and never listed the contents. It answered the half it could
confabulate and dropped the half that required looking.

*Read-only chain — "read the README and summarise it in three sentences."* The
worst of the three. It stated that no read tool existed, wrote that it would
therefore *"generate a plausible response reflecting standard documentation"*,
and produced a confident fabricated summary. It also leaked its own reasoning
into the reply ("The user requested that…") and emitted `$$ \boxed{…} $$`, a
training artefact, into a chat window. See [B-18](known-bugs.md) — its claim that
no read tool existed is doubtful, since `write_file` worked minutes later.

*Write — "create summary.txt with a three-bullet summary of the README."*
Mechanically a success and substantively the worst outcome of the night. The tool
call fired, the file was really written, 250 bytes, correct location. **The
contents are fiction** — three plausible bullets about the product, assembled
from context, summarising a file it never opened.

At the time this read as a model failure — it does not read, it confabulates,
and it leaves artefacts that look like success. **That conclusion was wrong, and
the correction is below.** The observations stand; the attribution did not.

### The failures above were the agent CLI, not the model — **Established**

Settled the same night by elimination. `ibm/granite4.1:3b`, driven by **Hermes**
instead of Qwen Code, on the same Ollama and the same machine, **read a real file
and returned its real contents** — asked for a secret number in a file
containing `8241`, it answered `8241`. No fabrication, no invented value, no JSON
printed as prose.

Everything else was tested and eliminated first. The model emits correct tool
calls given a tool definition directly: **18/18 correct** across 1, 5, 10, 20, 40
and 59 tools, three runs each. It works on Ollama's native `/api/chat` and on the
OpenAI-compatible `/v1/chat/completions`. It works streaming and non-streaming.
Through Qwen Code it made **zero** tool calls of any kind, at 4096, 16384 and
32768 context alike, with our harness in the loop and with our harness removed
entirely.

So: not the model, not model size, not open weights, not Ollama, not tool count,
not the endpoint, not streaming, not context length, not us. Tracked as
[B-21](known-bugs.md).

**Context truncation was real but was not the cause.** Ollama's default 4096-token
window silently truncated an agent-sized prompt to 2050 evaluated tokens of 7246,
and the model picked the wrong tool as a direct result — widening the window
fixed that specific case. Worth fixing on its own merits; it did not explain the
app-level failure.

**Two numbers worth keeping.** Qwen Code's first request per turn is roughly
**31,185 tokens**, of which **91,011 characters are tool schemas** — which is why
a window large enough to hold it costs about a gigabyte of KV cache. And Hermes
given a *relative* path said the file "does not exist" rather than inventing a
value: wrong, but honest-wrong, and the failure mode you can ship. Given an
absolute path it read the file. That difference needs pinning down before anyone
relies on it, because a bot working in a project folder uses relative paths
constantly.

**What this changes.** The local path is viable. The arm was not failing on its
premise; it was failing on the agent CLI it happens to point people at.

**Best practice:** say it *before* the download, not after. Never default anyone
into this path. Offer a way back to the other arms from inside the arm.

### Should bots keep the agent CLI's host-control tools? — **Open**

Qwen Code hands every local bot ~30 `computer_use__*` tools that drive **the
user's own desktop** — click, type, hotkeys, launch and kill apps, list windows,
read the accessibility tree, record the screen. Not the Box cloud computer, not
the Local VM. Arrived by accident rather than by choice; the defect framing is
[B-19](known-bugs.md).

**The case for keeping them.** It is real capability, on a platform where we
currently offer none. "Agents with hands" is the product's own pitch, we already
say yes to host control on macOS, and marketing can follow the product rather
than constrain it. It costs nothing to obtain.

**Four things to weigh against it.**

1. **The wrong engine gets them.** They appear on the *local* path, which is the
   least reliable engine we ship — the one observed inventing a file's contents
   and asserting they were real. Mouse, keyboard and screen access go to the
   model most likely to confabulate, while Claude and Codex, the engines you
   would actually trust with a pointer, get nothing.
2. **Consent quality.** Our own host control routes through the permission broker
   with cards that say what is about to happen. These surface through ACP's
   generic prompt; "Allow `computer_use__click`?" is not informed consent for a
   non-technical user, and screen recording sits in the same list.
3. **Inconsistency with no explanation.** Capability would vary by engine because
   of what a third-party CLI happens to bundle — not a story that survives a
   customer asking why.
4. **Accountability.** Plan 003 puts "being accountable for the result" in the
   wedge. Shipping a host-automation stack we did not write, cannot test, cannot
   version and cannot gate properly, then calling it a feature, is the opposite.

**Leaning:** do it deliberately or not at all. Extending our own CUA path to
Windows is already named in plan 003 as the largest capability gap; that is the
version we can gate, test and stand behind. If the CLI's tools are wanted as a
stopgap, put them behind an explicit toggle so they are a choice rather than a
surprise — and not before the local engine is reliable enough to be trusted with
a pointer.

### Do not offer what will not work — **Decided**

Under 8 GB, do not offer the path at all. 8–16 GB gets the small model and a
plain statement that answers take minutes, not seconds. Check free disk before
starting. All of this is in `server/machine.ts` and gated in the UI.

---

## Licensing

### The licence gate cannot see any of this — **Decided**

`pnpm check:licenses` reads npm manifests. **Model weights and bundled binaries
are invisible to it**, so both need a deliberate human check recorded somewhere.

Commercially clean weights: Apache-2.0 (Qwen, IBM Granite 4.0, ToolACE-2-8B,
MiniCPM5) and MIT (Phi-4-mini, Functionary v3.2). **Cannot ship: the xLAM family
is CC-BY-NC-4.0** despite topping its size classes. Llama's community licence
carries usage thresholds and an attribution requirement — a decision, not a
default. Ollama itself is MIT.

Still unchecked: the agent CLIs we would bundle (Nous Research's Hermes,
Alibaba's Qwen Code). **Do this before any bundling work starts**, not after.

---

## Traps (keep here, not in a handoff)

Folded out of the deleted 2026-08-21 morning handoff so they are not rediscovered:

- **PATH is frozen for a running Windows process.** A CLI installed while the app is up is invisible until a full restart, tray included ([B-12](known-bugs.md)).
- **An ACP client must answer every server-initiated request**, not only `session/request_permission`. Ignoring one blocks the agent forever ([B-24](known-bugs.md)).
- **PowerShell will corrupt files.** `>` is UTF-16; `Set-Content -Encoding utf8` adds a BOM Qwen Code rejects; `WriteAllLines` re-encodes and mangles non-ASCII. Edit third-party config through Node.
- **Do not pipe a long-running command through `Select-Object -Last n`.** It buffers until exit.
- **Ollama's worker is `llama-server`, not `ollama`.** A process filter on `*ollama*` reports idle while the machine is busy.

---

## Open questions

1. **Can the `claude` CLI drive a local model?** `applyClaudeInject`
   (`local-inject.ts:318-333`) points `ANTHROPIC_BASE_URL` at the host and
   supplies a token, which would remove precondition 3 for anyone who already has
   Claude Code. But it currently points at *any* host including Ollama, which
   cannot serve that API — so it is either aspirational or something else is
   going on. LocalAI would be the first host where it is genuinely true.
   **Settle with a probe, not an opinion** (`check-upstream-first`, step 4).
2. **Does the driver still report unavailable** when injected with no cloud
   login? Same probe answers it.
3. **16 GB threshold** — see above.
4. **Delete semantics** — what happens to bots pointing at a removed model.
5. **Which agent CLI to bundle**, once licences are checked.
6. **Local VM on first-run** — decided 2026-08-21, tightened 2026-08-22:
   Path A auto-starts the Local computer after Hermes; chat still works if
   it fails, as a labelled skip. See the Local VM entry. B-25 and B-27 still
   have to be built before that offer is honest on a virgin Windows box.
7. **A first-party local driver** (our tool loop against Ollama, no Hermes/Qwen
   CLI) was noted as viable in the 2026-08-21 session. Not sized. Do not start
   it unless the user asks; Path A is Hermes.
