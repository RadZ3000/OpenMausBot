# The local-model path: a standing register

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
| 1 | An inference runtime is running | Partly — we can start one, not install one, today |
| 2 | A model is pulled into it | **Yes, entirely** — built |
| 3 | A `custom`-access agent CLI is installed | Not yet, and this is the wall |
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

### How each piece should arrive — **Decided, unbuilt**

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
three-row checklist; the CLI-bundle vs fetch question is not reopened here.

### Local VM on this arm — **Open** (research, not a spec)

Recorded 2026-08-21 after the Hermes/Granite first-run landed, before anyone
had walked a scratch reinstall of that installer. **Nothing below is decided.**
The working notes, including what to measure, live in
[plan 2026-08-21-002](plans/2026-08-21-002-local-path-vm-considerations.md).

The product question is whether "run a model on this computer" should also
stand up OpenMausBot's Cua Linux sandbox (Settings → Local VM), which is a
different stack from Hermes' own computer-use tools. Plan
[003](plans/2026-08-20-003-product-foundation-plan.md) and
[005](plans/2026-08-20-005-three-path-first-run-plan.md) currently say this
arm should **not** offer computer control, because a 3B local model is a weak
driver for long tool loops. Including the VM anyway may still be right if the
promise is "this machine can host a desktop," not "Granite will use it well."
That tension is the thing to research, not to paper over.

Upstream already owns the VM (`server/container-computer.ts`,
`src/components/LocalComputerSection.tsx`, `/api/local-computer/*`). A first-run
implementation would call those routes from `LocalModelArm.tsx` (ours) rather
than nesting their Settings cards. Podman/WSL is the Ollama of this layer: we
do not yet know whether we can install it unelevated, how much RAM a 16 GB
laptop has left after Granite, or whether `pull`/`run` belong before or after
the first successful chat. Measure on a clean Windows box before writing code.

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

Ollama is MIT, and its Windows docs publish `ollama-windows-amd64.zip`
explicitly so you can "embed Ollama in existing applications". Its own installer
is per-user and needs no admin, same as ours.

At ~1.39 GB, bundling it into the base installer would make a 103 MB download
into ~1.5 GB, paid by everyone including the majority who never touch a local
model. **Fetch it on first use of this path instead**, using the pattern already
in `scripts/cua-linux-release.mjs`: a pinned release URL, a hard-coded SHA-256
per asset, verified after download, with a comment requiring explicit review
before a checksum changes.

The bundled variant remains right for an air-gapped customer, and
`VITE_INSTALL_PATHS` plus packaging metadata is already the mechanism for
shipping that as a separate build.

### Ollama for Windows auto-updates itself, silently — **Open, verify before relying on it**

Reported (secondary source, **not yet confirmed against an official advisory**):
the Windows build performs silent automatic updates, and its update path carried
two flaws — a verification routine that returned success unconditionally, and a
path traversal that together could stage an attacker-supplied executable into the
Startup folder. Said to affect 0.12.10 through 0.17.5, fixed May 2026.

Whether or not the specific numbers hold, the structural point stands and matters
for a product that is **sold**: telling a customer to install a component that
then updates itself silently means shipping them an update channel we neither
control nor audit. It is a further argument for the pinned portable zip over the
installer — a version we choose, verify by checksum, and update deliberately.

**Do not cite the CVE numbers to anyone until they are checked against the
vendor's own advisory.**

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
inference. The levers, in order of value, are listed in plan 005 — reuse a
runtime already present (100%, already works, just not surfaced), a network host
(100%, parked), match the runtime variant to detected hardware, and a smaller
model tier.

### Slowness compounds in a way a chatbot's does not — **Decided**

An agent makes many model calls per task, each re-reading a growing transcript,
so latency multiplies by step count *and* worsens as the task runs. Never route
Auto or computer control to a local model. Expose fewer tools to one: every tool
schema is re-sent on every step, costing both speed and accuracy.

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
6. **Whether first-run should stand up the Local VM**, and on which machines —
   see [plan 2026-08-21-002](plans/2026-08-21-002-local-path-vm-considerations.md).
   Open until a scratch install of the Hermes/Granite arm has been walked and
   the RAM / Podman / quality questions below have actual numbers.
