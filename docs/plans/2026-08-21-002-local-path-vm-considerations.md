# Local-path Local VM: considerations, not a spec

Status: **open**. Written 2026-08-21 so the next pass on "run a model on this
computer" does not have to reconstruct the conversation. This is a research
note. It does not authorise implementation, and it does not override plan
[003](2026-08-20-003-product-foundation-plan.md) or
[005](2026-08-20-005-three-path-first-run-plan.md) until someone re-opens those
with evidence.

The standing register is [`docs/local-model-path.md`](../local-model-path.md).
Defects stay in [`docs/known-bugs.md`](../known-bugs.md).

## check-upstream-first

Required because a plan in `docs/plans/` is exactly when the skill applies.

- Fetched `upstream/main` on 2026-08-21; this branch was **0 commits behind**.
- Upstream **already has** the Local VM: `server/local-computer.ts`,
  `server/container-computer.ts`, `src/components/LocalComputerSection.tsx`,
  `src/lib/local-computer.ts`, Settings → Local VM, and
  `GET`/`POST /api/local-computer/{pull,run,start,stop,remove}`.
- Upstream **does not have** an install-path chooser or a first-run arm. Putting
  a VM wizard inside `Onboarding.tsx` or `LocalComputerSection.tsx` would be
  another merge we hand-resolve forever.

**If this is built at all:** call the existing HTTP surface from
`src/components/LocalModelArm.tsx` (ours). Do not fork their Settings cards, and
do not create a second image-pull implementation.

## What we actually mean by "Local VM"

Two different computer-use stacks have already been easy to conflate:

| Stack | What it is | First-run status today |
|---|---|---|
| Hermes computer-use | Their CUA / scheduled-task / host-desktop tools | **Skipped** on purpose (`-SkipComputerUse` in `server/hermes-install.ts`) |
| OpenMausBot Local VM | A Cua Linux desktop in Podman/Docker, durable workspace, loopback VNC | Settings only; not on the local arm |

"Include local VM installation in run a model on this computer" refers to the
**second** stack. Turning Hermes' own CUA back on is a separate question and is
not implied by this note.

On Windows the VM stack is, in order:

1. A container runtime on PATH (Podman preferred; Docker accepted) —
   `setupCommands()` already suggests `winget install -e --id Podman.CLI`.
2. The runtime's machine actually running (`podman machine start`, etc.).
3. `POST /api/local-computer/pull` — prepare the pinned Cua derivative.
4. `POST /api/local-computer/run` (shared mode) — create and start the container.

Settings already does (3) and (4) in-app. (1) and (2) are still "install a
runtime," the same honesty as Get Ollama. Image pull is a **blocking POST** with
~5 s status polling and no byte progress (`server/index.ts`); that limitation is
known from plan 005 and would be inherited, not invented.

## Why this is not already "just do it"

Plan 003/005's current position: this arm downloads a small Apache-2.0 weight
and should **say** it is weak at long multi-step tool work, and should **not**
offer computer control. That was about product honesty, not missing code.

Including the VM in first-run would mean one of:

- the sandbox exists even if Granite rarely drives it well, or
- we are reversing the "no computer control on Path A" line.

Neither has been chosen. A 3B model issuing correct tool calls against Ollama
(the 2026-08-21 probes) is **not** the same as that model operating a Linux
desktop through MCP for a twenty-step task. Measure the latter before promising
it.

## Working hypotheses — to confirm or drop

Treat these as questions with a preferred guess, not as requirements.

1. **Placement.** A fourth checklist row on `LocalModelArm` after Ollama /
   Granite / Hermes, talking to `/api/local-computer`, is the cheapest shape
   that keeps the chooser additive. Isolation policy (shared vs per-bot) stays
   in Settings.
2. **Continue vs required.** Chat can work without a VM. Making the VM a hard
   gate may strand people who only wanted a local model. Making it optional may
   hide it forever. Needs a real first-run walk, not a preference.
3. **RAM.** Granite at long context plus a VM capped at 4 GB / 2 CPUs may not
   fit a nominal 16 GB laptop that `machine.ts` currently calls `comfortable`.
   The `tight` tier might skip or warn. **Unknown until measured** with both
   resident.
4. **Podman.** We should not bundle a hypervisor in NSIS. Whether `winget` via
   argv (no `shell: true`) is unelevated, reliable, and acceptable for a sold
   product is untested. A "Get Podman" link, like Get Ollama, may be the honest
   v1.
5. **Bot default.** If the VM is ready, pointing the starter bot at
   `computer: "vm"` (Computer panel's Local VM destination, not host `local`
   CUA) would stop dumping people into Settings. Only makes sense if the engine
   actually exposes `localComputerMcp` / `computerMcp` on that bot.
6. **Order.** VM-before-chat vs chat-before-VM. A failed 2 GB image pull should
   not block "hello." That is a guess.

## What to measure before writing code

On a machine that has just done a scratch install of the Hermes/Granite arm
(the 0.1.27 NSIS with in-app Hermes), not on a developer overlay:

- Free RAM before and after Granite is loaded, then after `podman machine start`
  and after the Cua container is `running`.
- Whether Podman CLI installs per-user on Windows 11 without admin, and whether
  `podman machine` then needs a reboot / WSL.
- Wall-clock and failure modes of `POST /api/local-computer/pull` and `run`.
- Whether Hermes + Granite issues *any* computer-use tool call when the VM is
  attached (B-24 and MCP attachment are still open; a VM that never gets a tool
  call is dead weight).
- Whether skipping the VM on `tier === "tight"` is the right cut, or whether
  the whole arm should stay chat-only until a larger model is offered.

If those numbers kill the idea, record that in `local-model-path.md` as
**Decided (not on this arm)** rather than leaving this file to age into a spec.

## Explicitly out of scope until someone argues otherwise

- Editing `LocalComputerSection.tsx` / `Onboarding.tsx`.
- Bundling Podman, WSL, or the Cua image into `electron-builder.yml`.
- Re-enabling Hermes `-SkipComputerUse`.
- A new progress SSE kind for the container pull.
- Per-bot desktops as a first-run default.
