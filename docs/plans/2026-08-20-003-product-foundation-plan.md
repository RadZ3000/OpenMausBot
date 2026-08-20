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

**One installer that produces a working bot with no account, no API key, and no
terminal.**

Local open-weight models are not a nice-to-have here. They are the only
configuration with no per-user account, no key, no subscription, and no data
leaving the machine — which is simultaneously the setup story and the privacy
story a business buyer will actually pay for. Upstream has no reason to ship a
multi-gigabyte installer; we do.

## Phase 0 — the distribution profile (do this first)

A single build-time module describing *this* distribution: product name, icon,
default engine and model preference, analytics destination, and which optional
features are visible.

It is small, additive, entirely ours, and both later phases need it. Today the
brand is scattered across 15+ files and the default engine is hardcoded inside
`defaultSelection()`; neither can be varied per customer without editing code
upstream also owns.

Seam: one new module read by the shell, the settings surfaces, and
`defaultSelection()`. Prefer one seam over several — if this needs more than a
handful of call sites, the shape is wrong.

## Phase 1 — zero-account first run

The product itself.

1. Ship a local inference runtime and one open-weight model with the installer,
   or fetch them on first run with visible progress.
2. Ship a `access: "custom"` host CLI (`hermes` or `qwen`) so the inject layer
   has something to drive.
3. Teach `defaultSelection()` to prefer the bundled local stack and never return
   an empty instance — an unconfigured app should offer a working default, not a
   409 on first send.
4. Replace clipboard-and-blank-terminal with an in-app install that reports
   progress and failure.

**Licensing gate, and it is not the one we already built.** Model weights are
not npm packages, so `pnpm check:licenses` will not see them. Weight licences
vary sharply: Qwen and Mistral ship Apache-2.0, while Llama's community licence
carries usage thresholds and an attribution requirement, and some popular
fine-tunes are non-commercial. Pick the model on licence first and benchmark
second, and record the decision.

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

**Update feed and release channel.** Tracked in the `commercial-fork` skill.
Must be resolved before any build reaches a customer, independently of this plan.

## Risks

- **Installer size.** Bundling a runtime and weights moves us from tens of
  megabytes to gigabytes, which changes hosting, update strategy and the
  updater's assumptions.
- **Upstream collision.** Onboarding is plausible territory for upstream. Run
  `check-upstream-first` before Phase 1, and keep the work in files they do not
  own.
- **Local model quality.** A small local model that fails at agentic tool use
  would make the product look worse than the manual setup it replaces. Validate
  against real tool-calling turns before committing to a default.
