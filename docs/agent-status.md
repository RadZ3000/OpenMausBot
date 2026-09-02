# Current state and goals

**Standing snapshot for a new agent.** Overwrite this file when facts change.
Do not add another dated handoff.

Last updated: 2026-09-02 (Merged `upstream/main` through `4b6adf8` / **0.1.49**, Apache-2.0. Shared VM **piles** still decided — [`plans/2026-08-28-002-shared-vm-seats-plan.md`](plans/2026-08-28-002-shared-vm-seats-plan.md): one Chromium, each bot its windows, app shows a crop. Two Chromes / second VNC are out. [B-29](known-bugs.md) is P1 of 002. P1–P4 not coded. Do not mutate the Admin VM while the user is live. Grok Bot phone research in [`plans/2026-08-28-001-grok-bot-phone-research.md`](plans/2026-08-28-001-grok-bot-phone-research.md). Android companion is now **in upstream's tree** (`android/`); we inherit it as theirs. Fork store plans not drafted. Path A first-run is still Thinking **8B @ 32k**. NVIDIA Hermes gold **pass**; Admin CPU Hermes gold **fail**. Unpackaged `pnpm dev` still prefers Claude if that CLI is present. Hop-on map: [`README.md`](README.md).)

## Start here

1. [`AGENTS.md`](../AGENTS.md) — always-on rules.
2. [`README.md`](README.md) — where to look (app shape, whose file, living vs
   upstream docs, archive).
3. This file — where we are, what we want, what not to do.
4. Then only the plan for the job in front of you. Catalog:
   [`plans/README.md`](plans/README.md).

Do not start from dated handoffs, walk logs, or `docs/superpowers/`. Historical
plans: [`plans/archive/README.md`](plans/archive/README.md). The 2026-08-21
morning handoff and the 2026-08-23 cold-start were deleted as duplicates of
this file; git still has them.

## Git (this machine, 2026-09-02)

| | |
|---|---|
| Branch | `merge/upstream-0.1.27` |
| HEAD | this merge — `upstream/main` through `4b6adf8` (0.1.49). License gate is that same SHA, Apache-2.0. Path A 8B@32k is `033f1ab`. Brand + Path C is `51a5a74`. |
| Path A computer loop | `a9b676a` — honest open, last-look, compact `vm_*` wrap |
| Merge base | this merge — 0.1.49 (Android companion, i18n, custom MCP/engines, browser-per-bot, pairing/remote workspace, white-label `brand.json`, automations/calendar, mascot body catalog). Path A 8B@32k and the fork layers sit on top. |
| `origin` | `RadZ3000/OpenMausBot` — **only push target**. Push this branch when asked. |
| `origin/main` | `d037f40` — this branch is **not** merged to our `main` |
| `upstream` | `milind-soni/OpenMausBot`, push URL `DISABLED`. Never push there. |

Caught up to `upstream/main` `4b6adf8` on 2026-09-02 (0.1.49). License check was green (Apache-2.0) before the merge started. Previous catch-up was `ec7b487` (0.1.37) on 2026-08-27. Theirs won at their paths: Android companion, i18n/`brand.json`, custom MCP, built-in browser, pairing, automations, mascot bodies. We kept consent-gated analytics (`AnalyticsSettings`), compact `vm_*` wrap, ACP keep-alive, Path A 8B@32k + first-run routes, image-gen MCP extra fields (1:1, rooms, iOS `.image`), brand pack A–C (`distribution.productName` / `PRODUCT_NAME`, Team Library off, update Download hidden), Path B/C, anti-slop oxlint, and `AGENTS.md` house rules (plus their `docs/verification/` pointer). Brand `INCOMPLETE` grew for new upstream files (docker/sync-release workflows, browser surface, pairing page). `pnpm check:brand --release` stays red. Hop-on whose-file is still `git diff --stat upstream/main` — the cheat sheet in [`README.md`](README.md) is not the ownership record.

Hermes ACP gold **passed on this NVIDIA box** and **failed on Admin CPU**. Packaged Electron still advertises **upstream** 0.1.32 — do not click Download;
the public-release path is recorded in
[`plans/2026-08-20-004-release-channel-plan.md`](plans/2026-08-20-004-release-channel-plan.md)
(not built).

**This Windows box only (do not expect on the next machine):** shared Local VM
recreated at `--pids-limit 2048` on `driver-0.20.0-v7` (Admin, 2026-08-28).
`pnpm build:server` overlay into
`%LOCALAPPDATA%\Programs\openmausbot\resources\server` so the packaged `.exe`
accepts that cap. `~/.openmausbot`, Podman, and that overlay do not travel
with git. Local `pnpm test` needs `OMB_SKIP_REAL_ELECTRON_BROWSER_FIXTURE=1`
(same as CI Windows — Electron 43 `EXCEPTION_BREAKPOINT` on the closed-shadow
fixture). AppImage `test:electron` needs Git `usr\bin` on PATH (`mv`); we did
not patch their Linux installer test.

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

**Brand pack**. Phases A–C of
[`plans/2026-08-25-002-brand-pack-plan.md`](plans/2026-08-25-002-brand-pack-plan.md)
are in the tree: `brand/profile.ts` + overlay, copy through
`distribution.productName` / `PRODUCT_NAME` (including control-plane OTP
From/Subject and Better Auth `appName`), Team Library off, update Download
hidden. `pnpm check:brand` walks the repo minus a denylist. Control-plane
**domains** (`emailFromAddress`, `controlPlaneUrl`, `companionHostSuffix`)
stay `unset`; wrangler still has `noreply@openmausbot.com`. Packaged
desktop fails closed (no `accounts.openmausbot.com` default). **Phase D is
not done.** `pnpm check:brand --release` stays red. Do not invent those
values to go green. Map: [`identity-surface.md`](identity-surface.md).
Read `commercial-fork`; do not add a second profile.

**Upstream license gate.** [`plans/2026-08-25-003-upstream-license-gate.md`](plans/2026-08-25-003-upstream-license-gate.md)
is in tree. `pnpm check:upstream-license` after `git fetch upstream`, before any
merge. Green today on `4b6adf8` (Apache-2.0). A “fetch and merge” order does
**not** skip it. On red: stop, paste the alert, wait for a named acknowledgment;
default is freeze. Do not wrap fetch. Weekly Action:
`.github/workflows/check-upstream-license.yml`.

Path A first-run **in code**: pinned Ollama zip, `qwen3-vl:8b` Thinking pull (~6.1 GB), in-app Hermes, Local VM
(WSL/Podman/Cua). Checklist is serial CTAs, not one pass
([B-11](known-bugs.md) leftover). Chooser can stick in Electron userData
([B-26](known-bugs.md)).

**Path C**: capability-then-credits Worker at
[`cloudflare/inference-broker/`](../cloudflare/inference-broker/), instance
enable in [`server/hosted-inference.ts`](../server/hosted-inference.ts),
desktop registration in [`electron/managed-inference.mjs`](../electron/managed-inference.mjs).
Hard tasks want frontier while credits last; easy tasks stay cheap; empty
credits skip classify and stay on basic. Chooser arm live. No packaged
Worker URL. Chat-only. Polar and tools-on-hosted are later. Spec:
[`plans/2026-08-25-001-path-c-hosted-trial-plan.md`](plans/2026-08-25-001-path-c-hosted-trial-plan.md).

**Path B**: paste-a-key first-run is no longer xAI-only. Prefixes pick the
engine — OpenAI `sk-`, Anthropic `sk-ant-`, Google `AIza`, xAI `xai-`,
OpenRouter `sk-or-`, Groq `gsk_`. Unrecognized keys get a provider chip.
xAI still enables `grokApi`; the others set the existing `openaiCompat`
instance URL (do not add a second OpenAI-compat driver). Keys live on
`XAI_API_KEY` / `OPENAI_COMPAT_API_KEY`, never `ANTHROPIC_API_KEY` /
`OPENAI_API_KEY`. Spec leftover on
[005](plans/2026-08-20-005-three-path-first-run-plan.md) (chooser reopen
still open).

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
- Windows Local VM health: prefer Podman, treat empty Docker `info` as
  down, skip `info` when the Podman machine is stopped, wait 90s after a
  WSL wake (`server/container-computer.ts`, `server/podman-setup.ts`).
- Settings stay opt-in analytics. Upstream default-on PostHog **loses** that merge.

`RECOMMENDED_MODEL` / `modelForTier` are `qwen3-vl:8b`. Context 32768 on both tiers. Comfortable floor 24 GB. `NEW_SESSION_TIMEOUT` 120s.

Hermes ACP 8B@32k gold, same prompt, `computer: off`, digest `901cae732162`, `llama-server -c 32768`:

| Box | Result |
|---|---|
| **This machine** (RTX 2060 6 GB, 15.72 GB RAM **tight**, ~3.3 GB `size_vram`) | **Pass.** Thread `cf3a8ba9-…`. `session/new` ~3 s. First ACP `tool_call` at **~7.5 min** (`write` `omb-tee.txt` / `8241`), then `terminal` `echo OMB-TEE-OK`, then `terminal` `start https://example.com`. ~1773 thought chunks before tools. **Not** truncated, no `0xc0000409`. Turn stayed busy on the write approval — do not score the grant. |
| **Admin** (no NVIDIA, Vulkan off, CPU, VM down) | **Fail.** Thread `7105ac50-…`. `session/new` ~6 s. `size_vram` 0. After ~20.7 min with **no** ACP chunks, default `TURN_STALL_MS` sent `session/cancel`. **No** `tool_call`, **not** truncated. Same shape as 4B@16k Admin cancel in 006. |

Skip-Hermes on Admin (compact catalog, 32k, CPU): 4B **166 s**, 8B **240 s**, same three tools — tee [`plans/2026-08-24-006-skip-hermes-cpu-tee.md`](plans/2026-08-24-006-skip-hermes-cpu-tee.md). Chat still goes through Hermes. GPU is the Path A speed class for the agent prompt; do not bump `TURN_STALL_MS` to paper over CPU.

**UI after the flip (Vite :5199, unpackaged harness):** new bots still prefer **Claude** when that CLI is available (`PREFERRED_ENGINE` default `claudeAgent`; packaged bake is Hermes). A bot on **Local VM** Retry-cards “hello” when the Cua image or runtime is missing — **Runs on → Off** to talk without a desktop. Admin’s shared VM is ready again (`v7`, Podman running); keep Local VM selected and retry. On Admin CPU, Hermes ACP “hello”/“hey” at 32k sits at **0 tok** for minutes (8B or 4B); the picker can flash **Hermes not installed** while `GET /api/instances` waits on a busy Ollama. Do not treat that flash as a missing CLI.

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

1. **Path A gold is measured on both boxes** — NVIDIA **pass** (~7.5 min, three tools); Admin CPU **fail** (20 min silence watchdog, not a 32k-full thoughts miss). Skip-Hermes 8B on Admin finished in **4 min** with tools ([006](plans/2026-08-24-006-skip-hermes-cpu-tee.md)); that does not replace Hermes gold. Unpackaged new-bot default is still Claude (not a 005 bug). Spec:
   [`plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md`](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md).
   4B tee remains
   [`plans/2026-08-23-006-qwen3vl-replace-granite-plan.md`](plans/2026-08-23-006-qwen3vl-replace-granite-plan.md).
   **Qwen-CUA is not Path A** ([004](plans/2026-08-24-004-qwen3vl-vs-qwen-cua.md)).
2. **Path A goal (EvoCUA)** → [`plans/2026-08-23-004-evocua-path-a-goal.md`](plans/2026-08-23-004-evocua-path-a-goal.md). GPU-box specialist; not this laptop’s first-run. Qwen-CUA (397B, weights not in their GitHub release) does not replace that pick.
3. **Ship Windows** → [`plans/2026-08-20-004-release-channel-plan.md`](plans/2026-08-20-004-release-channel-plan.md). Never `.claude/skills/windows-release/` as written. Customer update-feed target recorded 2026-08-24; do not retarget `publish:` until the five decisions in that plan are made.
4. **Catch upstream** — done through `4b6adf8` (this merge, 0.1.49). Next catch-up is a
   new fetch **plus** `pnpm check:upstream-license`, then merge only if green.
5. **Path C leftovers** → Polar packs (our org), tools-on-hosted, a true frontier SKU (`FRONTIER_UPSTREAM_MODEL` is still `gpt-4o-mini`). The capability-then-credits router is in tree; do not rebuild it. Chat UI badge for `capability` vs `credits` is later. Packaged builds need `OMB_INFERENCE_BROKER_URL` — no default.
6. **Publish this branch** → point our `main` at it; user must ask.
7. **First-run leftovers** → B-26 chooser, B-12 PATH after in-app CLI install, serial Path A CTAs. Path B major-provider paste is in the tree; Windows Local VM health probe (empty Docker `info`, 90s Podman `info`) is in the tree; chooser reopen is still open on 005.
8. **Brand pack Phase D** → only when ingredients exist (`appId`, data dir, icons, mascot, helper names, control-plane mailbox/host, 004 URLs). Do not invent them. Plan: [`plans/2026-08-25-002-brand-pack-plan.md`](plans/2026-08-25-002-brand-pack-plan.md).
9. **Phone app** → research landed ([001](plans/2026-08-28-001-grok-bot-phone-research.md)). Thin client stays (not Grok’s cloud account). **Upstream now ships `android/`** — inherit it as theirs; do not rewrite those files. Next, if asked: fork store plans against the sidecar. Do not follow `ios/AppStore/RELEASE.md`. Identity still 002 Phase D.
10. **Shared VM piles** → product decided ([2026-08-28-002](plans/2026-08-28-002-shared-vm-seats-plan.md)): one Chrome, per-bot windows, crop in the app. User-visible hole: [B-29](known-bugs.md) (second Shared bot Retry-cards while another turn holds the VM). Next, if asked: P1 concurrent pile leases (no second VNC). Live two-bot tee only when the user says the VM is free. Do not mutate the Admin VM during a live session.

## Do not

- Add Granite-specific computer tools, Beehiiv recipes, or hostname matchers (P8).
- Restore native Hermes `web` / `extract` on Path A.
- Redefine Path A as hosted Hermes.
- Classify Path C turns in Electron, or honour a client “this is hard” flag.
- Point `OMB_INFERENCE_BROKER_URL` at a default Worker (fail closed).
- Use OpenRouter `auto` as the Path C capability picker.
- Drive the host Windows desktop from Path A.
- Mutate the Admin Local VM while the user is in a live Computer session
  (Phase 0 seats probe already did; ask first). Read-only inspect is fine.
- Send JPEGs to Granite (`IMAGE_LAYER_VERSION` stays `"7"` for that).
- Change `RECOMMENDED_MODEL` / `modelForTier` off `qwen3-vl:8b` except by a new plan (rollback is in 005).
- Wrap Path A in `observe-computer-mcp` (~60 Cua tools).
- Touch `server/computer-proxy.ts` to “port Box to the VM”.
- Hand-edit `dist-server/`.
- Push to `upstream`. Force-push `main` / `master`.
- Follow `CONTRIBUTING.md` remotes or release steps (upstream’s guide).
- Add another `docs/plans/YYYY-MM-DD-*-handoff.md`. Edit **this** file.
- Start a job from `docs/plans/archive/` or `docs/superpowers/`.
- Leave a finished plan in the Open table — archive it.
- Invent an `appId`, data-dir name, icons, mailbox, `accounts.` host, or 004 URLs to make `pnpm check:brand --release` green. Phase D waits on real ingredients.
- Merge, cherry-pick, or rebase `upstream` while `pnpm check:upstream-license` is red. A “fetch and merge” / “catch upstream” order is not license acknowledgment. `ok` / `continue` / `do it` do not count. After a named acknowledgment, freeze by default.

## Map (one job, one file)

Hop-on index: [`README.md`](README.md). Full catalog:
[`plans/README.md`](plans/README.md). Do not copy those tables here.

| File | Owns |
|---|---|
| [`AGENTS.md`](../AGENTS.md) | Rules. Keep short. |
| [`README.md`](README.md) | App shape, whose file, where to look. |
| **This file** | State + goals. Overwrite. |
| [`plans/README.md`](plans/README.md) | Open / in tree / archive. |
| [`local-model-path.md`](local-model-path.md) | Path A tensions and decisions. |
| [`known-bugs.md`](known-bugs.md) | Defects. Delete the entry when fixed. |
| [`identity-surface.md`](identity-surface.md) | Names that may change vs names that strand installs. |
| [`plans/2026-08-22-002-computer-use-coworker-loop-plan.md`](plans/2026-08-22-002-computer-use-coworker-loop-plan.md) | Computer-use loop. P8 stop is [008](plans/2026-08-22-008-computer-safety-eval-plan.md). |
| [`plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md`](plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md) | Path A first-run: Thinking 8B @ 32k. |
| [`plans/2026-08-25-001-path-c-hosted-trial-plan.md`](plans/2026-08-25-001-path-c-hosted-trial-plan.md) | Path C hosted router. |
| [`plans/2026-08-25-002-brand-pack-plan.md`](plans/2026-08-25-002-brand-pack-plan.md) | Brand pack. A–C in tree; Phase D unset. |
| [`plans/2026-08-25-003-upstream-license-gate.md`](plans/2026-08-25-003-upstream-license-gate.md) | Upstream license merge gate. |
| [`plans/2026-08-28-001-grok-bot-phone-research.md`](plans/2026-08-28-001-grok-bot-phone-research.md) | Grok Bot iOS vs our companion. |
| [`plans/2026-08-28-002-shared-vm-seats-plan.md`](plans/2026-08-28-002-shared-vm-seats-plan.md) | One Chrome, two piles, crop in the app. [B-29](known-bugs.md) is P1. |
| [`../cloudflare/inference-broker/`](../cloudflare/inference-broker/) | Path C Worker. |
| [`../server/hosted-inference.ts`](../server/hosted-inference.ts) | Distinct `hostedInference` instance. |
| `.claude/skills/<folder>/SKILL.md` | Folders = table in `AGENTS.md`. |

Walks and superseded sketches are in [`plans/archive/`](plans/archive/README.md).
Use them for measurements, not as the snapshot.
