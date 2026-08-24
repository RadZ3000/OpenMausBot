# Path A first-run: Qwen3-VL Thinking 8B at 32k

Status: **in tree 2026-08-24; Admin CPU Hermes ACP 8B@32k gold fail** (20 min `TURN_STALL_MS`, `session/cancel`, no `tool_call`; not truncated). This **supersedes**
[2026-08-24-003](2026-08-24-003-path-a-qwen3vl-first-run-plan.md)
(Instruct 4B, 8k). Parent tees stay
[2026-08-23-006](2026-08-23-006-qwen3vl-replace-granite-plan.md)
(4B Instruct / 4B Thinking measurements) and
[007](2026-08-23-007-hermes-eyes-plan.md) (eyes). P8:
[008](2026-08-22-008-computer-safety-eval-plan.md).

This is the **install, context, and new-bot default** flip. Granite
leaves first-run. The stack around the weight (pinned Ollama zip, Hermes,
Local VM, eight `vm_*`) stays.

## Why this overrides 003

003 picked **`qwen3-vl:4b-instruct` at 8k** because Hermes ACP Thinking
**4B** filled 8192 and emitted no tools (NVIDIA tee). Skip-Hermes 4B
Thinking later **did** call tools at 8k and 32k on CPU (Admin, Vulkan
off). Hermes ACP at 16k on this Admin box **did not finish** (no VM;
`session/new` 30s timeout; CPU prefill of a ~5993-token Hermes prompt
cancelled). None of that was an 8B Hermes-at-32k gold turn.

The product owner overrode the size/context caution: **ship Thinking 8B
at 32k anyway.** Constants are in tree. Admin CPU Hermes ACP gold
**failed** (20 min stall, no `tool_call`). NVIDIA 8B@32k is still
unmeasured.

## check-upstream-first (2026-08-24)

Fetched `upstream/main` (`6897bf4`). Catching up is a **separate** merge.
Do not mix it in.

| Path | Upstream `main` |
|---|---|
| `server/local-model.ts` | **Absent** |
| `server/machine.ts` | **Absent** |
| `server/local-runtime.ts` | **Absent** |
| `src/components/LocalModelArm.tsx` | **Absent** |
| `docs/plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md` | **Absent** |
| `electron-builder.yml` `extraMetadata.distribution` | Their file; our bake (`hermesAgent` + Granite) already diverged |
| `server/drivers/acp/core.ts` | **Theirs.** One-line `NEW_SESSION_TIMEOUT` bump is in scope (see below). |

No `qwen3-vl` first-run on their tree. Flip constants in **fork-owned**
files. The ACP timeout is the one upstream-file exception this job is
allowed.

## What the customer should get

Path A checklist, unchanged order:

1. Pinned Ollama (already)
2. **`qwen3-vl:8b`** (~6.1 GB Q4_K_M), Thinking, **32k** context — not
   Granite, not 4B Instruct, not `qwen3-vl:8b-instruct`
3. In-app Hermes (already)
4. Local computer (already)

New bots on that engine, once the tag is in the catalog, start on
`ollama::qwen3-vl:8b`.

Ollama library: unsuffixed **`qwen3-vl:8b`** is the Thinking blob
(digest prefix `901cae732162`, 8.77B, Apache-2.0). Same size class as
`qwen3-vl:8b-instruct` (`0533d74300e4`) — different weights. Requires
Ollama ≥ 0.12.7; we already pin **0.32.15**.

## Binding decisions

1. **Tag is Thinking 8B.** `RECOMMENDED_MODEL = "qwen3-vl:8b"`. Never
   pull `8b-instruct` as first-run. Never treat `qwen3-vl:4b` /
   `4b-instruct` / Granite as `modelReady`. Unsuffixed 8B **cannot**
   disable thinking (`think: false` is ignored; Ollama #16945 / #14798).
   Do not paper over a fat Hermes turn by toggling think off.
2. **Context is 32k on both runnable tiers.**
   `DEFAULT_CONTEXT_TOKENS = 32768` and `TIGHT_CONTEXT_TOKENS = 32768`.
   Tight copy still says it will be slow. Do not “fix” Thinking by
   putting tight machines back on 4096/8192.
3. **One weight on both RAM tiers.** `modelForTier("comfortable")` and
   `("tight")` return `qwen3-vl:8b`. Unsupported stays null.
4. **Raise the comfortable floor.** `machine.ts` today calls 15 GB
   comfortable so 16 GB laptops (report ~15.7) get the “full” offer.
   8B weights (~6.1 GB) + 32k KV + Local VM (~6 GB) + Windows + this app
   **do not** fit a 16 GB machine in VRAM or in RAM with headroom.
   Granite 8B on the NVIDIA 16 GB box already left **0.6 GB RAM** free
   with the VM up ([002](2026-08-23-002-path-a-drive-sites-bakeoff.md)).
   **Comfortable = 24 GB installed** (`24 * GB` totalMemory). 16 GB
   machines stay Path A as **tight** (same tag, same 32k, “slow” copy).
   Unsupported remains **&lt; 8 GB**.
5. **Hermes stays.** Do not switch to Qwen Code (`qwenAgent`).
6. **Eight `vm_*` stay.** P8 still forbids extra names / Beehiiv tools.
   Compact wrap is still the catalog; 32k is room to think, not a license
   to mount Cua’s ~60 tools.
7. **No auto-delete of Granite or 4B.** Leftover tags on disk are fine.
   `DELETE /api/local-model` removes **the current recommended tag**
   only.
8. **No migrate of existing bots.** A bot on Granite or Instruct 4B stays
   there until the person picks 8B Thinking. First-run `modelReady` is
   `hasModel(…, "qwen3-vl:8b")`.
9. **`hasModel` must not treat Instruct 8B or 4B as ready.**
   `ollama::qwen3-vl:8b-instruct` is not `::qwen3-vl:8b`. Cover that in
   `local-model.test.ts`.
10. **New-bot preference shares the constant.** Unpackaged
    `PREFERRED_MODEL` falls back to `ollama::${RECOMMENDED_MODEL}`.
    Packaged `electron-builder.yml` `defaultModel` bakes
    `ollama::qwen3-vl:8b`. They must match.
11. **Copy tracks size.** LocalModelArm “about 2.5 GB” → **about 6.1 GB**,
    matching `APPROX_MODEL_BYTES`. Hardcode.
12. **Windows without NVIDIA: disable Vulkan.** Admin 2026-08-24: default
    Ollama Vulkan on Intel UHD / old AMD **crashed** `llama-server`
    (`0xc0000409`) at 8k and 32k. With `OLLAMA_VULKAN=0` the same 4B
    Thinking loaded on CPU. `runtimeEnv()` must set `OLLAMA_VULKAN=0`
    (and `GGML_VK_VISIBLE_DEVICES=-1`) when the machine has **no**
    `nvcuda.dll` (probe `SystemRoot\System32\nvcuda.dll` exists). Do not
    disable Vulkan on NVIDIA boxes. Do not add a GPU-VRAM API.
    **Windows-only.** POSIX keeps the current Vulkan default.
13. **ACP `session/new` timeout 120s.** `NEW_SESSION_TIMEOUT` in
    [`server/drivers/acp/core.ts`](../../server/drivers/acp/core.ts) is
    30s; Hermes already waits up to 30s for ACP MCP inside `session/new`.
    4B already lost that race once. 8B + 32k first load will be slower.
    Bump to **120_000**. Upstream-owned file; one constant. `LOAD_SESSION`
    is already 120s.
14. **Vision: keep Pipe B captions until an 8B+32k JPEG+tools tee.**
    `compactObserveImageForModel` is already true for `qwen3-vl*`. 4B at
    8k overflowed a fused JPEG on the Hermes tool role (007). 32k *might*
    hold it. Do not flip fused JPEG on as part of this install job.
15. **Live gold is Hermes ACP, not skip-Hermes.** Skip-Hermes 4B and 8B
    both emit tools on this CPU box
    ([006](2026-08-24-006-skip-hermes-cpu-tee.md)); that does **not**
    count. Before calling this shipped: one Hermes turn on
    `qwen3-vl:8b` at 32k that emits at least one ACP `tool_call`
    (`write_file` or `vm_open`) without `truncated` filling the window.

Rollback: flip the same constants back to Granite / 8192 / 4096 / 2.5 GB
/ 15 GB comfortable floor / Vulkan unset. 8B layers stay on disk.

## What this costs (do not bury)

| | Granite 3B @ 8k (today) | This pick |
|---|---|---|
| Download | ~2.5 GB | **~6.1 GB** |
| Context | 8192 / 4096 | **32768 / 32768** |
| 16 GB + 6 GB VRAM NVIDIA laptop | Fits, tight | **Tight / CPU spill / VM fight.** Not the 003 “fits this laptop” story. |
| Admin 48 GB, no NVIDIA | N/A | CPU path if Vulkan off; first Hermes turn will be **slow** |
| Hermes Thinking tools | 4B @ 8k: **miss** (NVIDIA) | 8B @ 32k Admin CPU: **fail** (20 min stall, no tools). NVIDIA unmeasured. |

[004](2026-08-24-004-qwen3vl-vs-qwen-cua.md) “do not pull 8B as first-run”
is **overridden** for Path A install only. Qwen-CUA is still not first-run.

## What does not change

Ollama zip pin (0.32.15). Hermes in-app install. WSL / Podman / Cua
Local VM. Eight `vm_*` + last-look + ACP keep-alive. `IMAGE_LAYER_VERSION`
for Granite (Granite is no longer first-run; JPEG still must not go to
leftover Granite bots). `pnpm check:distribution` markers. Tests that use
Granite **as a fixture** (inject, routing, no-JPEG-for-Granite, Auto
blocked on local-inject).

## Files

| File | Change |
|---|---|
| [`server/local-model.ts`](../../server/local-model.ts) | `RECOMMENDED_MODEL = "qwen3-vl:8b"`. Comment: first-run Thinking 8B @ 32k; Instruct 8B / 4B are not. |
| [`server/machine.ts`](../../server/machine.ts) | `modelForTier` → `qwen3-vl:8b` on **both** runnable tiers. `APPROX_MODEL_BYTES` → `6.1 * GB`. `COMFORTABLE_FLOOR_BYTES` → `24 * GB`. Comments: 16 GB is tight; tight is the **same** weight, slower — not a smaller tag. `MachineTier` “tight” docstring must not say “offer the small model”. |
| [`server/local-runtime.ts`](../../server/local-runtime.ts) | `DEFAULT_CONTEXT_TOKENS` and `TIGHT_CONTEXT_TOKENS` = `32768`. `runtimeEnv`: Vulkan off when no `nvcuda.dll`. Flash attention stays on (Admin CPU 4B @ 32k completed with it). |
| [`server/drivers/acp/core.ts`](../../server/drivers/acp/core.ts) | `NEW_SESSION_TIMEOUT = 120_000` |
| [`server/distribution.ts`](../../server/distribution.ts) | `PREFERRED_MODEL` fallback `ollama::${RECOMMENDED_MODEL}` |
| [`electron-builder.yml`](../../electron-builder.yml) | `defaultModel: "ollama::qwen3-vl:8b"` |
| [`electron/distribution.mjs`](../../electron/distribution.mjs) | Comment example matches |
| [`src/components/LocalModelArm.tsx`](../../src/components/LocalModelArm.tsx) | “about 6.1 GB”; comment names Thinking 8B. Tight copy today says “only a small one” — rewrite to **speed** (“answers will take minutes”), not a smaller download. |
| [`docs/identity-surface.md`](../identity-surface.md) | Packaged `defaultModel` examples |
| [`docs/local-model-path.md`](../local-model-path.md) | First-run sentence + size + 24 GB comfortable |
| This file + [003](2026-08-24-003-path-a-qwen3vl-first-run-plan.md) superseded + [006](2026-08-23-006-qwen3vl-replace-granite-plan.md) pointer + catalog + [`docs/agent-status.md`](../agent-status.md) | After code lands, overwrite the snapshot |

Tests that **assert the recommended tag** (not fixtures):

- `server/machine.test.ts` — `modelForTier`, comfortable floor **24 GB**
  (15.7 GB → `tight`; that reverses today’s “16 GB is comfortable” test),
  `diskNeededBytes(6.1 * GB)`, context 32768
- `server/local-model.test.ts` — default `hasModel` finds `8b`; `8b-instruct`
  and `4b` / `4b-instruct` / Granite do not satisfy it
- `electron/distribution.test.mjs` — product default is 8B Thinking if the
  assertion is “what we bake”
- `src/components/LocalModelArm.test.ts` — copy 6.1 GB if asserted
- `server/qwen3vl-context.ts` comment: 32k is now the intended Path A
  window; the module stays a probe helper, not the flip

Do not retarget Auto-on-local-inject, vision-false-for-Granite, or
Granite → `compactObserveImageForModel` false.

## Setup behaviour

| State | After the flip |
|---|---|
| Checklist Model row | Unticked until `qwen3-vl:8b` is pulled |
| Download CTA | Pulls Thinking 8B (~6.1 GB) |
| Existing Granite / 4B bots | Unchanged model id |
| New / empty bots after pull | `ollama::qwen3-vl:8b` if Hermes lists it |
| In-app Remove | Deletes `qwen3-vl:8b` only |
| `8b-instruct` already pulled | Does **not** tick `modelReady` |

Do not add a migration dialog. Do not `ollama rm` leftover tags from the
harness.

## Tests (the feedback loop)

1. `modelForTier` both runnable tiers → `qwen3-vl:8b`; unsupported → null.
2. `tierFor` at 16 GB → `tight`; at 24 GB → `comfortable`.
3. `hasModel(["ollama::qwen3-vl:8b-instruct"])` with default arg is **false**.
4. `hasModel(["ollama::qwen3-vl:8b"])` is **true**.
5. `runtimeEnv` context is `"32768"` on both token constants.
6. `runtimeEnv` includes `OLLAMA_VULKAN=0` when the nvcuda probe is false;
   omits or leaves Vulkan enabled when the probe is true (inject the probe
   in the test; do not call the real DLL).
7. Existing Granite fixture tests stay green.

```sh
pnpm typecheck
pnpm exec vitest run server/local-model.test.ts server/machine.test.ts server/distribution.test.ts src/components/LocalModelArm.test.ts electron/distribution.test.mjs
pnpm lint
```

(`runtimeEnv` assertions live in `machine.test.ts` today — extend those,
do not invent a seam.)

## Live gold (after code)

New Path A checklist: UI names `qwen3-vl:8b`, copy says ~6.1 GB, NDJSON
pull is that tag, not Instruct 8B. `GET /api/local-model` →
`modelReady: true` only when Thinking 8B is present.

Hermes ACP, `num_ctx` 32768 (serve `OLLAMA_CONTEXT_LENGTH`): combined
file+echo+`vm_open` (or `write_file` if the VM is down). **Pass:** at
least one ACP `tool_call`, `truncated` not filling the window. **Fail:**
thoughts-only end_turn, `0xc0000409`, or `session/new` timeout.

Do not score coworker clicks. Do not commit `~/.openmausbot`.

On a no-NVIDIA box the gold turn must run with Vulkan off or it is not
a model verdict.

**Measured 2026-08-24 (Admin, no NVIDIA, Vulkan off, CPU, VM down):**
pull was Thinking 8B (`901cae732162`). `llama-server -c 32768`.
`session/new` ~6s. Combined prompt, `computer: off`. After ~20.7 min of
no ACP chunks, default `TURN_STALL_MS` (20 min) sent `session/cancel`.
**Fail:** no `tool_call`. Not thoughts-only, not truncated, not
`0xc0000409`, not `session/new` timeout. NVIDIA 8B@32k still unmeasured.

Skip-Hermes on the same compact prompt: 8B **240 s**, three tools; 4B
**166 s**, same tools. Full split (load / prefill / decode, undici 5 min
header trap) is
[2026-08-24-006](2026-08-24-006-skip-hermes-cpu-tee.md). Hermes ACP
20 min / 0 tools is the agent prompt, not 8B weights being unable to
emit tools.

Unpackaged Vite on the same box: new bots can still open as **Claude**;
a bot left on Local VM Retry-cards “hello”; Hermes ACP “hey” on **4B**
at 32k still sits at 0 tok past 100s. The picker can flash Hermes not
installed while Ollama is busy. None of that is a missing 8B pull.

## Out of scope

Instruct 4B/8B as default. Two-model think-then-act. Fused JPEG-on-tool-role
without a tee. EvoCUA. Extra `vm_*`. `hermes update`. Migrating existing
bots. Auto-removing Granite. Qwen-CUA. Qwen3.8-27B. Upstream 0.1.32+ merge
beyond the one ACP timeout line. Release channel / `publish:`. B-26.
NSIS rebuild (overlay proves pull; customer installer needs `package:win`
later).

## Order of work

1. Constants: model, bytes, floors, 32k, Vulkan probe, ACP timeout + tests.
2. `PREFERRED_MODEL` fallback + `electron-builder.yml` + LocalModelArm copy.
3. Docs: 003 superseded, 006 pointer, 004 first-run note, catalog,
   `local-model-path.md`, overwrite `docs/agent-status.md`.
4. Live gold: pull 8B, Hermes ACP tool call at 32k. Then stop.
