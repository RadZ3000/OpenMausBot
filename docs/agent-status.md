# Current state and goals

**Standing snapshot for a new agent.** Overwrite this file when facts change.
Do not add another dated handoff.

Last updated: 2026-08-24 (Path A first-run **in code** is Thinking **8B @ 32k**. Admin CPU Hermes gold **fail** (20 min stall). Unpackaged `pnpm dev` still prefers Claude if that CLI is present. Local VM without a Cua image Retry-cards every turn. 003 is a tombstone.)

## Start here

1. [`AGENTS.md`](../AGENTS.md) — always-on rules.
2. This file — where we are, what we want, what not to do.
3. Then only the plan for the job in front of you. Catalog: [`plans/README.md`](plans/README.md).

Do not start from dated handoffs. Path A walk logs:
[`plans/2026-08-21-005-path-a-live-walk.md`](plans/2026-08-21-005-path-a-live-walk.md)
(first-run),
[`plans/2026-08-23-002-path-a-drive-sites-bakeoff.md`](plans/2026-08-23-002-path-a-drive-sites-bakeoff.md)
(same-turn site drive). The 2026-08-21 morning handoff and the 2026-08-23
cold-start were deleted as duplicates of this file; git still has them.

## Git (this machine, 2026-08-24)

| | |
|---|---|
| Branch | `merge/upstream-0.1.27` |
| HEAD | this commit — Path A first-run is Thinking 8B @ 32k. Parent `a897f57` recorded keep-alive and Chromium VM status on `origin`. |
| Path A computer loop | `a9b676a` — honest open, last-look, compact `vm_*` wrap |
| Merge base | `0cedd9e` — merged upstream (skill recorder, section chiefs, MiniMax, timeline, room setup, driver retry) |
| `origin` | `RadZ3000/OpenMausBot` — **only push target**. This branch is pushed. |
| `origin/main` | `d037f40` — this branch is **not** merged to our `main` |
| `upstream` | `milind-soni/OpenMausBot`, push URL `DISABLED`. Never push there. |

Fetched `upstream/main` 2026-08-24 again. Tip is `1602f97` (`feat(pi): image
attachments and reasoning-effort levels`, #438). Gap is **54** commits we lack
and **37** they lack. After 0.1.32 they added pi images/reasoning, find-in-chat,
in-app attachment preview, section-scoped shared context, live team map, in-chat
credential cards, window-state/unread badges, gated SKILL.md import, idle-mascot
CPU cut, composer file attach. **No** `server/cua-desktop-status.ts` there.
Catching up is a **separate** merge job; Path A is on this branch as a
recoverable base. Their ACP core still kills the child on settle.

005 constants are in this commit. Hermes ACP gold on this box **failed** (stall cancel, not truncation). Packaged Electron still advertises **upstream** 0.1.32 — do not click Download;
the public-release path is recorded in
[`plans/2026-08-20-004-release-channel-plan.md`](plans/2026-08-20-004-release-channel-plan.md)
(not built).

**This Windows box only (do not expect on the next machine):** shared Local VM
recreated at `--pids-limit 2048`; `pnpm build:server` overlay into
`%LOCALAPPDATA%\Programs\openmausbot\resources\server` so the packaged `.exe`
accepts that cap. `~/.openmausbot`, Podman, and that overlay do not travel
with git. On a new box: `git checkout merge/upstream-0.1.27` (already on
origin), Path A / Local VM first-run as usual. Do not recreate a 2048 VM
from an *un-overlaid* old `.exe` — it will say “missing safety limits”.

## Product goals (do not redefine)

The wedge is **one installer → a working bot without sysadmin**
([`plans/2026-08-20-003-product-foundation-plan.md`](plans/2026-08-20-003-product-foundation-plan.md)).
We do not win by cloning upstream’s breadth.

| Goal | Meaning | Not |
|---|---|---|
| **Path A** | Local `qwen3-vl:8b` (Thinking, 32k) via Ollama → Hermes ACP → Local VM (WSL → Podman → Cua XFCE). No API key. Eight `vm_*` tools. Last-look **text**. 16 GB is **tight**; comfortable starts at **24 GB**. Do not ship 4B Thinking at 8k. | Hosted Hermes (paid remote model, same VM). Flipping `RECOMMENDED_MODEL` off 8B except by a new plan. |
| **Computer** | Honest sandbox on the Local VM. Coworker *loop* (observe → act → remember). Granite can open and read. Same-turn recover-and-click on a Chromium error page **did not land** on 3B or 8B. ACP child now stays across turns (idle 15m, cap 3). | Unsupervised Cowork on 3B/8B/4B. Driving the user’s Windows desktop. JPEG to Granite. |
| **Fork** | Additive files. Defaults never point at upstream feeds or keys. | Editing upstream-owned files when a new file will do. Publishing with the `windows-release` skill. |

Coworker-level unsupervised hands on that VM: **Claude, Codex, or grokAgent**.
A 3B with 8k and no vision will not run Cowork. Granite 8B on this 16 GB box
failed the gold-turn bar and left 0.6 GB RAM free. 005 still ships Qwen3-VL
Thinking 8B @ 32k: 16 GB is **tight**, comfortable starts at **24 GB**.
Keep-alive does **not** make that a coworker.

## In the tree (do not redo)

Path A first-run **in code**: pinned Ollama zip, `qwen3-vl:8b` Thinking pull (~6.1 GB), in-app Hermes, Local VM
(WSL/Podman/Cua). Checklist is serial CTAs, not one pass
([B-11](known-bugs.md) leftover). Chooser can stick in Electron userData
([B-26](known-bugs.md)).

Computer loop (P1, P3, P4 + durable VM + first routing slice + P8 + **P6**):

- Honest `vm_open`: `server/compact-computer-open.ts`
- Eight `vm_*`: `server/compact-computer-tools.ts`, wrap `server/compact-computer-mcp.ts`
- Last-look in the **harness**: `server/computer-thread-state.ts`. Skipped when
  an idle ACP child will be reused (stale Chromium “Restore pages?” must not
  poison a follow-up).
- Frontier fused observe (not Granite): `server/observe-computer.ts`
- Path A JPEG fuse **flag** (`OMB_COMPACT_OBSERVE_IMAGE=1`):
  `server/compact-computer-observe.ts`. On for `qwen3-vl` / qwen2.5vl /
  granite-vision / llava; **off** for Granite 3B/8B. Live Instruct does
  **not** attach the JPEG to Hermes (8k overflow 8500 vs 8192). Compact wrap
  captions via skip-Hermes `/v1` (`OMB_COMPACT_OBSERVE_CAPTION_MODEL`).
  Hermes `mcp_tool.py` still patched to keep MCP ImageContent as
  `_multimodal` if a JPEG ever fits. Paste uses ACP `{type:image}` when
  initialize advertised `promptCapabilities.image`
  (`server/acp-prompt-blocks.ts`). Write-up:
  [`plans/2026-08-23-007-hermes-eyes-plan.md`](plans/2026-08-23-007-hermes-eyes-plan.md).
- Qwen3-VL live tee 2026-08-23: **Instruct** Hermes ACP `write_file` /
  `read` / `terminal` / `vm_open`. Workspace file `8241`. Thinking tag
  **truncated at 8191** on the same combined prompt. Ollama tools+PNG
  **200** on Thinking. Defaults unchanged. Write-up:
  [`plans/2026-08-23-006-qwen3vl-replace-granite-plan.md`](plans/2026-08-23-006-qwen3vl-replace-granite-plan.md).
- Last-look helpers: `formatComputerObservation` / `withComputerObservation`
  (`server/turn-context.ts`). Resume miss: `replayAfterFailedResume`; Hermes
  treats `session/load` `{}` as dead via `sessionLoadLived`.
- **ACP keep-alive (P6):** fork-owned [`server/acp-session.ts`](../server/acp-session.ts)
  (idle 15m, cap 3, bot+thread `sessionKey`, fingerprint). `acp/core.ts`
  parks the child on successful `end_turn`. Write-up:
  [`plans/2026-08-24-001-acp-session-keepalive.md`](plans/2026-08-24-001-acp-session-keepalive.md).
  Fake round-trip: one `initialize`, two `session/prompt`. Live Instruct
  protocol tee 2026-08-24 (thread `9ceeb692-…`): one `initialize`, one
  `session/new`, two `session/prompt`, no `session/load`. VM URL follow-up
  was blocked that session by a false `desktopReady` from Chromium log tails.
- **Local VM red box:** same panel bug as `pthread_create` EAGAIN. The
  2026-08-24 GLib-GObject / `browser_main_loop.cc` screenshot was **not** a
  second boot failure — XFCE/VNC was up and RedCafe was on the thumbnail —
  but it **was** a real Chromium warning: the page crashed later. Classifier
  in [`server/cua-desktop-status.ts`](../server/cua-desktop-status.ts). Boot
  failures (X display, health `failed`) still fail `ready`. Chromium noise
  becomes `desktop_warning` ("page may crash") and does not throw the chat
  Retry card. New containers use `--pids-limit 2048`; inspect still accepts
  512 so an existing VM is not branded unsafe. Recreate the VM to pick up
  2048. Pids is a run flag, not `IMAGE_LAYER_VERSION`.
- Hermes patches in `server/drivers/acp/hermes.ts` (list:
  [`plans/2026-08-22-008-computer-safety-eval-plan.md`](plans/2026-08-22-008-computer-safety-eval-plan.md)).
  Re-merge that file by **ownership join** (Path A patches **and** upstream #380
  hosted catalog). Never `String.prototype.replace` with a dollar-backtick
  replacement — it duplicated the file once.
- Protected-input stop lives in `server/index.ts` (near the computer-use prompt).
- `IMAGE_LAYER_VERSION` `"7"` in `server/container-computer.ts`
- Settings stay opt-in analytics. Upstream default-on PostHog **loses** that merge.

`RECOMMENDED_MODEL` / `modelForTier` are `qwen3-vl:8b`. Context 32768 on both tiers. Comfortable floor 24 GB. `NEW_SESSION_TIMEOUT` 120s.

Hermes ACP 8B@32k gold on this Admin box (no NVIDIA, Vulkan off, CPU, Local VM down): **fail**. Thread `7105ac50-…`. Digest `901cae732162`. `llama-server -c 32768`, `size_vram` 0. `session/new` ~6s. Combined file+echo+open prompt, `computer: off`. After ~20.7 min with no ACP chunks, default `TURN_STALL_MS` (20 min) sent `session/cancel`. **No** `tool_call`, **not** truncated, no `0xc0000409`. Same shape as 4B@16k Admin cancel in 006. Does **not** prove thoughts filled 32k.

**UI on this box after the flip (Vite :5199, unpackaged harness):** new bots still prefer **Claude** when that CLI is available (`PREFERRED_ENGINE` default `claudeAgent`; packaged bake is Hermes). A bot left on **Local VM** Retry-cards even “hello” (`Prepare the Cua desktop image…`) — **Runs on → Off** to talk. Hermes ACP “hello”/“hey” on CPU at 32k sits at **0 tok** for minutes (8B or 4B); the picker can flash **Hermes not installed** while `GET /api/instances` waits on a busy Ollama. Do not treat that flash as a missing CLI.

## Two ceilings (do not confuse)

**Same turn — 3B + safety prompt.** “Go to beehiiv and login” → green `vm_open`,
Chromium error / 404 look, MFA/login prose. Bake-off 2026-08-23 (native tee,
this 15.7 GB / RTX 2060 6 GB box, same VM, 8k, eight `vm_*`): 3B clicked
`[81] Learn more` on example.com then `[55] Work` plus login prose on the
404; 8B clicked `{index:1}` (not a look index) then honest-stopped after
`ERR_HTTP_RESPONSE_CODE_FAILURE` via Hermes `search: browser`. **Neither**
met the pass bar. **P8:** do not teach URLs or add `vm_*` names. Bigger
local model / vision did not ship a default.

**Next message — session continuity.** Spawn-per-turn was the architecture
hole (new `initialize`, Hermes `session/load` `{}`, stale last-look). P6
keep-alive is in tree. Last-look text remains the bandage on a pool miss.
Do not score 4B click quality as a keep-alive failure.

[B-24](known-bugs.md) is a **diary**, not one ticket. Do not “fix B-24”.
[B-14](known-bugs.md) heading can still say `open` while the body says Qwen
auth inject is fixed — believe the body. [B-11](known-bugs.md) is `fixed` with
serial CTAs left.

## Next work (only if the user asks)

Ordered. Granite bake-off is done; Qwen3-VL **Instruct** tools tee is done;
Hermes eyes (paste ACP + VM caption) is in tree; ACP keep-alive is in tree
(unit + Instruct protocol tee); Hermes Thinking truncates at 8k on the
NVIDIA tee; Admin no-NVIDIA crash was Vulkan; CPU skip-Hermes Thinking
tools at 8k and 32k; do not hunt more `vm_*`.

1. **Path A gold failed on this CPU box** — 20 min silence watchdog, not a 32k-full thoughts miss. NVIDIA 8B@32k still unmeasured. Unpackaged new-bot default is still Claude (not a 005 bug). Spec:
   [`plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md`](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md).
   4B tee remains
   [`plans/2026-08-23-006-qwen3vl-replace-granite-plan.md`](plans/2026-08-23-006-qwen3vl-replace-granite-plan.md).
   **Qwen-CUA is not Path A** ([004](plans/2026-08-24-004-qwen3vl-vs-qwen-cua.md)).
2. **Path A goal (EvoCUA)** → [`plans/2026-08-23-004-evocua-path-a-goal.md`](plans/2026-08-23-004-evocua-path-a-goal.md). GPU-box specialist; not this laptop’s first-run. Qwen-CUA (397B, weights not in their GitHub release) does not replace that pick.
3. **Ship Windows** → [`plans/2026-08-20-004-release-channel-plan.md`](plans/2026-08-20-004-release-channel-plan.md). Never `.claude/skills/windows-release/` as written. Customer update-feed target recorded 2026-08-24; do not retarget `publish:` until the five decisions in that plan are made.
4. **Catch upstream** → `upstream-merges` skill, separate job. Tip `1602f97`; **54** commits behind, **37** ahead. Path A is committed. No classifier to take.
5. **Publish this branch** → point our `main` at it; user must ask.
6. **First-run leftovers** → B-26 chooser, B-12 PATH after in-app CLI install, serial Path A CTAs.

## Do not

- Add Granite-specific computer tools, Beehiiv recipes, or hostname matchers (P8).
- Restore native Hermes `web` / `extract` on Path A.
- Redefine Path A as hosted Hermes.
- Drive the host Windows desktop from Path A.
- Send JPEGs to Granite (`IMAGE_LAYER_VERSION` stays `"7"` for that).
- Change `RECOMMENDED_MODEL` / `modelForTier` off `qwen3-vl:8b` except by a new plan (rollback is in 005).
- Wrap Path A in `observe-computer-mcp` (~60 Cua tools).
- Touch `server/computer-proxy.ts` to “port Box to the VM”.
- Hand-edit `dist-server/`.
- Push to `upstream`. Force-push `main` / `master`.
- Follow `CONTRIBUTING.md` remotes or release steps (upstream’s guide).
- Add another `docs/plans/YYYY-MM-DD-*-handoff.md`. Edit **this** file.

## Map (one job, one file)

| File | What it is |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Rules. Keep short. |
| **This file** | State + goals. Overwrite. |
| [`plans/README.md`](plans/README.md) | Index of *our* plans. |
| [`local-model-path.md`](local-model-path.md) | Tensions and decisions for Path A. |
| [`known-bugs.md`](known-bugs.md) | Defects. Delete the entry when fixed. |
| [`plans/2026-08-22-002-computer-use-coworker-loop-plan.md`](plans/2026-08-22-002-computer-use-coworker-loop-plan.md) | Computer-use loop. P8 stop is binding. |
| [`plans/2026-08-23-002-path-a-drive-sites-bakeoff.md`](plans/2026-08-23-002-path-a-drive-sites-bakeoff.md) | 3B vs 8B vs VL plumbing. |
| [`plans/2026-08-23-003-open-computer-use-brain.md`](plans/2026-08-23-003-open-computer-use-brain.md) | EvoCUA pick; tool-calling research. |
| [`plans/2026-08-23-004-evocua-path-a-goal.md`](plans/2026-08-23-004-evocua-path-a-goal.md) | Goal = EvoCUA local stack; research holes. |
| [`plans/2026-08-23-005-hermes-images.md`](plans/2026-08-23-005-hermes-images.md) | Keep Hermes; pictures. Qwen3-VL 4B may retire Granite+aux. |
| [`plans/2026-08-23-006-qwen3vl-replace-granite-plan.md`](plans/2026-08-23-006-qwen3vl-replace-granite-plan.md) | Hermes stays; 4B Instruct tee; Hermes Thinking truncates at 8k; Vulkan crash isolated on Admin; CPU skip-Hermes tools at 8k/32k. |
| [`plans/2026-08-24-001-acp-session-keepalive.md`](plans/2026-08-24-001-acp-session-keepalive.md) | ACP child stays across turns. |
| [`plans/2026-08-24-002-local-vm-chromium-status.md`](plans/2026-08-24-002-local-vm-chromium-status.md) | Chromium stderr ≠ desktop failed to start. Pid cap 2048. |
| [`plans/2026-08-24-003-path-a-qwen3vl-first-run-plan.md`](plans/2026-08-24-003-path-a-qwen3vl-first-run-plan.md) | **Tombstone.** Instruct 4B @ 8k. Do not implement. |
| [`plans/2026-08-24-004-qwen3vl-vs-qwen-cua.md`](plans/2026-08-24-004-qwen3vl-vs-qwen-cua.md) | Qwen-CUA is not first-run. 4B Instruct pick overridden by 005. |
| [`plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md`](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md) | In tree; Admin CPU gold **fail** (20 min stall, no `tool_call`). |
| [`server/cua-desktop-status.ts`](../server/cua-desktop-status.ts) | Classifier used by Local VM and VPS. |
| `.claude/skills/<folder>/SKILL.md` | Folders = table in `AGENTS.md`. |

The dated Path A **walks** still in tree are
[`plans/2026-08-21-005-path-a-live-walk.md`](plans/2026-08-21-005-path-a-live-walk.md)
and
[`plans/2026-08-23-002-path-a-drive-sites-bakeoff.md`](plans/2026-08-23-002-path-a-drive-sites-bakeoff.md).
Use them for measurements, not as the snapshot.
