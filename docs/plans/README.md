# Plans (this fork)

Hop-on map: [`../README.md`](../README.md). Standing snapshot:
[`../agent-status.md`](../agent-status.md). **Overwrite the snapshot** when
state changes. Do not add another handoff here.

Only plans that appear in `git diff --stat upstream/main -- docs/plans` are
ours, including [`archive/`](archive/README.md). Other files in this folder are
upstream’s — do not rewrite them, and do not add fork state to them.

When a plan is done, superseded, or only a walk/diary, **archive** it
(`git mv` into [`archive/`](archive/README.md)) and drop it from Open. Leave a
one-line pointer here if it is a stop-line. **Delete** only duplicates and
pass-throughs — see `keep-docs-current` (Archive vs delete). Do not delete a
plan because it is old.

## Open

Work that is still allowed to move. One job → open the matching file, not this
whole table.

| Plan | Status | Open when |
|---|---|---|
| [2026-08-20-003](2026-08-20-003-product-foundation-plan.md) | proposed; Phase 0 shipped; brand is [002](2026-08-25-002-brand-pack-plan.md) | What the product *is* (installer wedge, not breadth) |
| [2026-08-20-004](2026-08-20-004-release-channel-plan.md) | proposed; customer update path recorded 2026-08-24 | Shipping Windows. Not the `windows-release` skill |
| [2026-08-25-002](2026-08-25-002-brand-pack-plan.md) | A–C in tree; **Phase D not done**; `--release` red | Fork-owned `brand/` pack. Lock-once slots and assets unset |
| [2026-08-20-005](2026-08-20-005-three-path-first-run-plan.md) | proposed; Path A building; Path C in tree ([001](2026-08-25-001-path-c-hosted-trial-plan.md)) | Three first-run paths |
| [2026-08-25-001](2026-08-25-001-path-c-hosted-trial-plan.md) | decided; capability-then-credits in tree | Path C leftovers (Polar, tools-on-hosted, frontier SKU) |
| [2026-08-22-001](2026-08-22-001-path-a-nsis-first-run.md) | WSL/virt in tree; B-26 open | NSIS Path A first run |
| [2026-08-22-002](2026-08-22-002-computer-use-coworker-loop-plan.md) | in progress; P1/P3/P4/P6 in tree | Coworker computer loop |
| [2026-08-22-008](2026-08-22-008-computer-safety-eval-plan.md) | in tree; **P8 binding** | Stop Granite `vm_*` recipes |
| [2026-08-23-004](2026-08-23-004-evocua-path-a-goal.md) | conclusion + cheap tests | Path A goal = EvoCUA (GPU-box specialist, not this laptop’s first-run) |
| [2026-08-24-005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md) | in tree; Admin CPU gold **fail** | Path A first-run is Thinking 8B @ 32k. Do not flip off this without a new plan |

## In tree (do not redo)

Specs for work that already landed. Read them; do not reimplement.

| Plan | Status | Open when |
|---|---|---|
| [2026-08-21-002](2026-08-21-002-local-path-vm-considerations.md) | decided; first cut in tree | Why Path A gets a Local VM |
| [2026-08-21-003](2026-08-21-003-local-runtime-install-plan.md) | first cut in tree | Pinned Ollama zip |
| [2026-08-22-005](2026-08-22-005-computer-frontier-observe-plan.md) | in tree | Frontier fused observe |
| [2026-08-22-006](2026-08-22-006-computer-durable-shared-plan.md) | in tree | Durable shared Local VM |
| [2026-08-22-007](2026-08-22-007-computer-routing-fleet-plan.md) | first slice in tree | Which computer a bot may drive |
| [2026-08-23-006](2026-08-23-006-qwen3vl-replace-granite-plan.md) | teed 4B; first-run is [005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md) | 4B Instruct tee; Hermes Thinking truncates at 8k |
| [2026-08-23-007](2026-08-23-007-hermes-eyes-plan.md) | in tree | Paste ACP image blocks; VM shot = caption |
| [2026-08-24-001](2026-08-24-001-acp-session-keepalive.md) | in tree | ACP child stays across turns (P6) |
| [2026-08-24-002](2026-08-24-002-local-vm-chromium-status.md) | in tree | Chromium stderr ≠ desktop failed to start. Pid cap 2048 |
| [2026-08-24-004](2026-08-24-004-qwen3vl-vs-qwen-cua.md) | evaluated | Qwen-CUA is not first-run |
| [2026-08-24-006](2026-08-24-006-skip-hermes-cpu-tee.md) | measured 2026-08-24 | Skip-Hermes CPU tools vs Hermes ACP stall |

## Archive (do not start here)

Walks, diaries, superseded sketches, research that already has a conclusion.
Index: [`archive/README.md`](archive/README.md).

Stop-lines that live only there:

- Instruct 4B @ 8k — **do not implement.** Tombstone:
  [`archive/2026-08-24-003`](archive/2026-08-24-003-path-a-qwen3vl-first-run-plan.md).
- Image-gen / lightbox (2026-08-20-001, 002) — shipped then partly superseded
  by upstream attachments. **Do not rebuild.**
- Deleted handoffs (git still has them): `2026-08-21-001-local-path-handoff.md`,
  `2026-08-23-001-path-a-cold-start.md`. Traps from the morning handoff live in
  [`../local-model-path.md`](../local-model-path.md).
