# Plans (this fork)

Standing snapshot: [`../agent-status.md`](../agent-status.md).
**Overwrite that file** when state changes. Do not add another handoff here.

Only plans that appear in `git diff --stat upstream/main -- docs/plans` (plus
the 2026-08-23 archive) are ours. Other files in this folder are upstream’s.

| Plan | Status | Open when |
|---|---|---|
| [2026-08-20-003](2026-08-20-003-product-foundation-plan.md) | proposed | What the product *is* (installer wedge, not breadth) |
| [2026-08-20-004](2026-08-20-004-release-channel-plan.md) | proposed; customer update path recorded 2026-08-24 | Shipping Windows. Not the `windows-release` skill |
| [2026-08-20-005](2026-08-20-005-three-path-first-run-plan.md) | proposed; Path A building | Three first-run paths |
| [2026-08-21-002](2026-08-21-002-local-path-vm-considerations.md) | decided; first cut in tree | Why Path A gets a Local VM |
| [2026-08-21-003](2026-08-21-003-local-runtime-install-plan.md) | first cut in tree | Pinned Ollama zip |
| [2026-08-21-004](2026-08-21-004-b24-investigation.md) | diary; not one ticket | ACP + MCP + Git Bash + Granite tools |
| [2026-08-22-001](2026-08-22-001-path-a-nsis-first-run.md) | WSL/virt in tree; B-26 open | NSIS Path A first run |
| [2026-08-22-002](2026-08-22-002-computer-use-coworker-loop-plan.md) | in progress; P1/P3/P4/P6 in tree | Coworker computer loop |
| [2026-08-22-005](2026-08-22-005-computer-frontier-observe-plan.md) | in tree | Frontier fused observe |
| [2026-08-22-006](2026-08-22-006-computer-durable-shared-plan.md) | in tree | Durable shared Local VM |
| [2026-08-22-007](2026-08-22-007-computer-routing-fleet-plan.md) | first slice in tree | Which computer a bot may drive |
| [2026-08-22-008](2026-08-22-008-computer-safety-eval-plan.md) | in tree; **P8 binding** | Stop Granite `vm_*` recipes |
| [2026-08-23-003](2026-08-23-003-open-computer-use-brain.md) | research; not shipped | Best open CUA weights if compute is free |
| [2026-08-23-004](2026-08-23-004-evocua-path-a-goal.md) | conclusion + cheap tests | Path A goal = EvoCUA; eyes, memory, talk/files |
| [2026-08-23-005](2026-08-23-005-hermes-images.md) | research; keep Hermes | How Hermes can see. Implementation is [007](2026-08-23-007-hermes-eyes-plan.md); this file is the Granite + aux VL fallback |
| [2026-08-23-006](2026-08-23-006-qwen3vl-replace-granite-plan.md) | teed instruct; first-run still Granite | Hermes stays; 8k Thinking truncates; candidate `qwen3-vl:4b-instruct`; eyes in [007](2026-08-23-007-hermes-eyes-plan.md) |
| [2026-08-23-007](2026-08-23-007-hermes-eyes-plan.md) | in tree; paste ACP; VM shot = Pipe B caption | Paste = ACP image blocks; Hermes `_multimodal` patch exists but 8k overflows a JPEG+tools turn; compact wrap captions via skip-Hermes `/v1`. |
| [2026-08-24-001](2026-08-24-001-acp-session-keepalive.md) | in tree; unit + protocol tee | ACP child stays across turns (P6). Idle 15m, cap 3, bot+thread key. Instruct native log: one `initialize`, two `session/prompt`. |
| [2026-08-24-002](2026-08-24-002-local-vm-chromium-status.md) | in tree; unit + typecheck | Chromium stderr ≠ desktop failed to start. Pid cap 2048 on new VMs. |

Image-gen / lightbox plans (2026-08-20-001, 002): shipped then partly
superseded at merge by upstream’s attachments. Do not rebuild them.

## Walk log (not a snapshot)

| File | |
|---|---|
| [2026-08-21-005](2026-08-21-005-path-a-live-walk.md) | Path A first-run measurements. Start from `docs/agent-status.md`. |
| [2026-08-23-002](2026-08-23-002-path-a-drive-sites-bakeoff.md) | 3B vs 8B same-turn site drive; VL stopped (Hermes MEDIA:path) |

Removed 2026-08-23 (duplicates of `agent-status.md`, recovered from git):
`2026-08-21-001-local-path-handoff.md` (stale “nothing committed”),
`2026-08-23-001-path-a-cold-start.md` (second start page). Traps from the
morning handoff now live in `docs/local-model-path.md`.
