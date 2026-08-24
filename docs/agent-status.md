# Current state and goals

**Standing snapshot for a new agent.** Overwrite this file when facts change.
Do not add another dated handoff.

Last updated: 2026-08-24 (harness restarted; shared Local VM recreated at pid cap 2048; Chromium-log classifier in tree).

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
| HEAD | `0cedd9e` — merged upstream (skill recorder, section chiefs, MiniMax, timeline, room setup, driver retry) |
| Path A computer loop | `a9b676a` — honest open, last-look, compact `vm_*` wrap |
| Keep-alive | uncommitted: `server/acp-session.ts` + smallest `acp/core.ts` settle/reuse edit |
| Chromium status | uncommitted: `server/cua-desktop-status.ts`; shared VM recreated 2026-08-24 |
| `origin` | `RadZ3000/OpenMausBot` — **only push target**. Branch is pushed. |
| `origin/main` | `d037f40` — this branch is **not** merged to our `main` |
| `upstream` | `milind-soni/OpenMausBot`, push URL `DISABLED`. Never push there. |

Fetched `upstream/main` 2026-08-24. Gap is ~23 commits through 0.1.32 (OpenCode
provider discovery, Composio null accounts, skill-recorder gate, settings
search, quiz-dismiss). **No** `server/cua-desktop-status.ts` there, and no
`container-computer.ts` / `ComputerPanel.tsx` commits in the gap. Catching up
is a **separate** merge job. Do not mix it with computer-use work. Their ACP
core still kills the child on settle — we did not take a keep-alive from them.

Uncommitted when this snapshot was written: Hermes eyes (ACP paste blocks,
VM caption), ACP keep-alive (P6), Local VM Chromium-log classification
(`server/cua-desktop-status.ts`, pid cap 2048), and the matching plans
([001](plans/2026-08-24-001-acp-session-keepalive.md),
[002](plans/2026-08-24-002-local-vm-chromium-status.md), 004 release-path
note). Do not commit fleet dumps, `~/.openmausbot`, or VNC passwords.
First-run constants still Granite. Packaged Electron still advertises
**upstream** 0.1.32 — do not click Download; the public-release path is
recorded in
[`plans/2026-08-20-004-release-channel-plan.md`](plans/2026-08-20-004-release-channel-plan.md)
(not built). Harness on this tree (`pnpm dev:server`, Instruct default).
Shared Local VM **recreated** 2026-08-24: `ready` / `desktopReady` true,
`--pids-limit 2048` on the new run args. Durable workspace kept.

## Product goals (do not redefine)

The wedge is **one installer → a working bot without sysadmin**
([`plans/2026-08-20-003-product-foundation-plan.md`](plans/2026-08-20-003-product-foundation-plan.md)).
We do not win by cloning upstream’s breadth.

| Goal | Meaning | Not |
|---|---|---|
| **Path A** | Local Granite `ibm/granite4.1:3b` via Ollama → Hermes ACP → Local VM (WSL → Podman → Cua XFCE). No API key. Eight `vm_*` tools. Last-look **text**. **Candidate** (teed, not first-run): `qwen3-vl:4b-instruct` through the same Hermes inject. Do not ship unsuffixed `qwen3-vl:4b` (Thinking) at 8k. | Hosted Hermes (paid remote model, same VM). Flipping `RECOMMENDED_MODEL` without a ship ask. |
| **Computer** | Honest sandbox on the Local VM. Coworker *loop* (observe → act → remember). Granite can open and read. Same-turn recover-and-click on a Chromium error page **did not land** on 3B or 8B. ACP child now stays across turns (idle 15m, cap 3). | Unsupervised Cowork on 3B/8B/4B. Driving the user’s Windows desktop. JPEG to Granite. |
| **Fork** | Additive files. Defaults never point at upstream feeds or keys. | Editing upstream-owned files when a new file will do. Publishing with the `windows-release` skill. |

Coworker-level unsupervised hands on that VM: **Claude, Codex, or grokAgent**.
A 3B with 8k and no vision will not run Cowork. An 8B on this 16 GB box
also failed the gold-turn bar and left 0.6 GB RAM free — not a 16 GB default.
Keep-alive does **not** make Instruct 4B a coworker.

## In the tree (do not redo)

Path A first-run: pinned Ollama zip, Granite pull, in-app Hermes, Local VM
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

`RECOMMENDED_MODEL` / `modelForTier` stay `ibm/granite4.1:3b`.

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
(unit + Instruct protocol tee); Thinking truncates at 8k; do not hunt more `vm_*`.

1. **Ship Path A weight** → only if you ask. Flip `RECOMMENDED_MODEL` /
   `modelForTier` / `APPROX_MODEL_BYTES` (~3.3 GB) / electron-builder
   `defaultModel` to **`qwen3-vl:4b-instruct`**, not the Thinking tag.
   Checklist in
   [`plans/2026-08-23-006-qwen3vl-replace-granite-plan.md`](plans/2026-08-23-006-qwen3vl-replace-granite-plan.md).
2. **Path A goal (EvoCUA)** → [`plans/2026-08-23-004-evocua-path-a-goal.md`](plans/2026-08-23-004-evocua-path-a-goal.md). GPU-box specialist; not this laptop’s first-run.
3. **Ship Windows** → [`plans/2026-08-20-004-release-channel-plan.md`](plans/2026-08-20-004-release-channel-plan.md). Never `.claude/skills/windows-release/` as written. Customer update-feed target recorded 2026-08-24; do not retarget `publish:` until the five decisions in that plan are made.
4. **Catch upstream** → `upstream-merges` skill, separate job. Fetched 2026-08-24; ~23 commits through 0.1.32. No classifier to take.
5. **Publish this branch** → point our `main` at it; user must ask.
6. **First-run leftovers** → B-26 chooser, B-12 PATH after in-app CLI install, serial Path A CTAs.

## Do not

- Add Granite-specific computer tools, Beehiiv recipes, or hostname matchers (P8).
- Restore native Hermes `web` / `extract` on Path A.
- Redefine Path A as hosted Hermes.
- Drive the host Windows desktop from Path A.
- Send JPEGs to Granite (`IMAGE_LAYER_VERSION` stays `"7"` for that).
- Change `RECOMMENDED_MODEL` / `modelForTier` without a winning tee **and** a ship ask.
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
| [`plans/2026-08-23-006-qwen3vl-replace-granite-plan.md`](plans/2026-08-23-006-qwen3vl-replace-granite-plan.md) | Hermes stays; Instruct tee; Thinking truncates at 8k; first-run still Granite. |
| [`plans/2026-08-24-001-acp-session-keepalive.md`](plans/2026-08-24-001-acp-session-keepalive.md) | ACP child stays across turns. |
| [`plans/2026-08-24-002-local-vm-chromium-status.md`](plans/2026-08-24-002-local-vm-chromium-status.md) | Chromium stderr ≠ desktop failed to start. Pid cap 2048. |
| [`server/cua-desktop-status.ts`](../server/cua-desktop-status.ts) | Classifier used by Local VM and VPS. |
| `.claude/skills/<folder>/SKILL.md` | Folders = table in `AGENTS.md`. |

The dated Path A **walks** still in tree are
[`plans/2026-08-21-005-path-a-live-walk.md`](plans/2026-08-21-005-path-a-live-walk.md)
and
[`plans/2026-08-23-002-path-a-drive-sites-bakeoff.md`](plans/2026-08-23-002-path-a-drive-sites-bakeoff.md).
Use them for measurements, not as the snapshot.
