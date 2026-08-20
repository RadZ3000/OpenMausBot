# Turning the fork into a product: what to build first

Status: proposed. Written after auditing our tree, upstream's recent history,
and the three areas a commercial version would touch (first run, computer
control, theming).

## The strategic constraint

Upstream ships fast and broad. In roughly a month they landed four switchable
skins, a Cursor Agent driver, secure image attachments, App Store packaging, a
one-button release pipeline, macOS Intel and Ubuntu builds, credential
encryption at rest, a fleet-wide authorization audit log, sidebar sections,
pinned messages and an extended reaction palette.

We will not win on breadth, and every feature we build inside their territory
becomes a merge conflict we hand-resolve forever. So the product wedge has to
sit where a FOSS project structurally will not go:

- bundling large runtimes and model weights into an installer
- narrowing configuration to one opinionated path that works
- per-customer branding
- being accountable for the result

Everything below picks from that list.

## What is actually true today

Audited, not assumed.

**Nothing is installed for the user.** The app detects CLIs on an augmented
PATH and probes them with `--version`. The "install" button copies a command to
the clipboard and opens a *blank* terminal — the user pastes and runs it
themselves, then runs a second login command.

**A fresh machine produces a broken first message.** `defaultSelection()`
prefers an available Claude instance, falls back to the first available one, and
deliberately does not fall back further. With nothing installed it returns
`{ instanceId: "", model: "" }`, and the first send throws
`provider instance "" is unavailable`.

**Every cloud engine needs the customer's own account.** Claude, Codex, Grok,
Kimi, Cursor, Droid and Antigravity all require a subscription or an OAuth
login performed in a terminal. Selling someone the app does not give them a
working app; it gives them a list of accounts to go buy.

**Local models already work, but only if the user assembles them.**
`server/drivers/local-inject.ts` probes Ollama, LM Studio, oMLX, EXO and
Unsloth on fixed loopback ports and merges `host::model` rows into the agent
catalogs. The `hermes` and `qwen` drivers are `access: "custom"` and report
themselves authenticated without any cloud login. So a no-account
configuration exists — the user just has to install a runtime, pull a model,
install a host CLI, and find the Local pane in the model picker.

**Computer control does not exist on Windows.** No driver is bundled by
`package:win`, and Electron skips `startCua()` on anything that is not macOS or
Linux. The Windows options are the paid Box cloud, a self-hosted VPS, or the
Local VM — which needs a container runtime installed and started, a multi-GB
image pulled from Docker Hub, a derived image built locally, and a container
created. There is also a real bug: the UI offers "Start Local VM" for a stopped
container while the API always rejects `start` with 409.

**Theming is further along than expected.** Skins are CSS custom properties
keyed on `[data-skin]`, switchable at runtime, persisted, contrast-checked by
`scripts/check-skin-contrast.mjs`, and covered by a registry/CSS contract test.
Roughly three quarters of components use semantic tokens.

**Branding is not abstracted at all.** The product name is a string literal in
15+ UI files plus `index.html` and `electron-builder.yml`. The mascot is
structural, not decorative: `MausAvatar` is the identity of every bot across
15+ components. Around 43% of component files leak raw colors, there is no
shared primitives layer beyond `Card` and `CommandLine`, and business logic sits
inside large view components.

## The wedge

**One installer that produces a working bot without the customer doing sysadmin
work.**

Not "local models". That was this plan's first draft and it was wrong — it
mistook one route for the destination. What blocks a sale is the terminal: an
`npm install -g`, a browser OAuth, and a list of accounts to go buy. Removing
that is the product. How the tokens get produced is a tier, and there are three:

| Path | Customer supplies | Quality | Costs us |
|---|---|---|---|
| **Local open-source** | nothing, but needs the hardware | lowest | one-time engineering |
| **Bring your own key** | one API key, pasted once | full | ~nothing |
| **Just run** | nothing | full | inference, per token |

They are presented as an explicit choice on first launch, not one default with
the others buried. The three answer genuinely different buyers — a firm whose
data cannot leave the building, a team that already has an Anthropic account,
and someone who wants to see it work before thinking about either.

## Phase 0 — the distribution profile (do this first)

A single build-time module describing *this* distribution: product name, icon,
default engine and model preference, analytics destination, and which optional
features are visible.

It also decides **which of the three install paths a given build offers** — a
locked-down customer build may expose Local only, while the public build offers
all three.

It is small, additive, entirely ours, and both later phases need it. Today the
brand is scattered across 15+ files and the default engine is hardcoded inside
`defaultSelection()`; neither can be varied per customer without editing code
upstream also owns.

Seam: one new module read by the shell, the settings surfaces, and
`defaultSelection()`. Prefer one seam over several — if this needs more than a
handful of call sites, the shape is wrong.

## Phase 1 — the three-path first run

The product itself: a first-launch chooser, plus the machinery behind each arm.

Common to all three: `defaultSelection()` must stop returning an empty instance.
An unconfigured app should present the chooser, not throw
`provider instance "" is unavailable` on first send. And the clipboard-and-blank-
terminal install has to go — whichever path the user picks, the app does the
work and reports progress and failure.

### Path A — Local open-source

Download size is not the obstacle people assume. At 4-bit, weights run about
**0.6 GB per billion parameters**:

| Model | Download (Q4_K_M) | Memory needed |
|---|---|---|
| MiniCPM5-1B (agentic tool-use) | 656 MB | ~1–2 GB |
| Llama 3.2 3B | 1.9 GB | ~3 GB |
| Qwen 3 4B | 2.5 GB | ~4 GB |
| Llama 3.1 8B | 4.9 GB | ~6–8 GB |

So: small installer, fetch on first run with resumable progress. Never bundle
weights into the installer itself — it breaks the updater's assumptions and the
download is the same either way.

**Memory, not disk, sets the floor.** A typical business laptop is 16 GB of
system RAM with integrated graphics and no dedicated VRAM, and a model that
spills from VRAM to system RAM runs 2–10× slower. Size the offer to detected
hardware and treat 3–4B as the floor for an unknown machine.

**Quality is the real limit, and it is specific to this app.** This is an agent
harness doing multi-step MCP and ACP tool calls, which is the hardest workload
for a small model. The best permissively-licensed 8B tool-callers score around
83 on BFCL v3 — and that is *single-call* accuracy, which compounds badly across
a twenty-step task. Set expectations accordingly; do not demo computer control
on this path.

**Licence first, benchmark second — and our licence gate cannot help here.**
Weights are not npm packages, so `pnpm check:licenses` will never see them.
Commercially clean: Apache-2.0 (IBM Granite 4.0, ToolACE-2-8B, MiniCPM5, Qwen)
and MIT (Phi-4-mini, Functionary v3.2). **Cannot ship:** the xLAM family is
CC-BY-NC-4.0 despite topping its size classes. Llama's community licence carries
usage thresholds and an attribution requirement, so it is a decision rather than
a default. Record whichever is picked.

This path also needs a `access: "custom"` host CLI (`hermes` or `qwen`), because
the inject layer rides on an agent CLI rather than talking to the runtime itself.

### Path B — Bring your own key

The cheapest arm to build and the highest quality per unit of effort: one key
pasted into a clean UI, replacing a global npm install and a terminal OAuth. The
credential storage already exists. This is mostly a UI and copy problem.

### Path C — Just run (capped trial)

A desktop app cannot hold a secret, so this is a proxy we operate, offered as a
capped trial that converts to Path B or to a paid plan.

**Prior art exists in this repo.** `cloudflare/composio-broker/` already solves
the identical problem for Composio: a Worker holds the shared key, each install
gets a random bearer token stored only as a SHA-256 hash in D1, the Worker
proxies traffic and rate-limits per installation, and `REGISTRATION_MODE=closed`
stops issuing new tokens without affecting existing users. That is a trial
system in all but name. Model the inference proxy on it rather than inventing
one — same shape, same deployment story, same seam.

## Phase 2 — brand configuration, cheap half only

With Phase 0 in place: product name, window title, icon, installer identity, and
one additional skin built from the customer's palette and validated by the
existing contrast script.

**Explicitly out of scope:** replacing the mascot, extracting a primitives
library, separating logic from the view components, or making layout swappable.
That work is a rewrite wearing a re-skin's clothing, and the audit above is the
evidence. Revisit only if a specific deal requires it.

## Deferred decisions

**Windows host computer control.** The largest capability gap and the largest
lift — it means packaging and supporting the Cua driver on a third platform.
Until then the honest Windows story is the Local VM via Podman, which makes the
"Start Local VM" 409 bug worth fixing early since it sits directly on that path.

**Upstream-pointing defaults.** Tracked in the `commercial-fork` skill. The
update feed and the Composio broker must both be ours before any build reaches a
customer, independently of this plan.

## Risks

- **Trial abuse.** Path C spends our money on anyone who downloads the app. The
  broker's per-installation tokens and rate-limit namespaces are the mitigation,
  and the cap has to exist from the first build rather than being retrofitted.
- **Upstream collision.** Onboarding is plausible territory for upstream. Run
  `check-upstream-first` before Phase 1, and keep the work in files they do not
  own.
- **Local model quality.** A small local model that fails at agentic tool use
  would make the product look worse than the manual setup it replaces. Validate
  against real tool-calling turns before committing to a default, and keep
  computer-control demos off that path.
- **Three paths is three support surfaces.** Each arm fails differently — bad
  hardware, a rejected key, an exhausted trial. The chooser is only worth it if
  each failure explains itself.
