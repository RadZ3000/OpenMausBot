# Replace Granite with Qwen3-VL 4B (Hermes stays)

**In tree 2026-08-23. 4B tee record.**  
Ship/install flip is
[2026-08-24-005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)
(in tree: Thinking **8B @ 32k**; Admin CPU Hermes ACP gold **fail**).
[003](2026-08-24-003-path-a-qwen3vl-first-run-plan.md) (Instruct 4B @ 8k)
is superseded. This file stays the **4B** tee record. It does not tee
Hermes ACP on 8B. Hermes ACP stays. No first-party Ollama driver.
Official 4B family is ~3.3 GB Q4_K_M. Apache-2.0.

At **8192** tokens **through Hermes ACP** (NVIDIA tee, 2026-08-23),
unsuffixed **`qwen3-vl:4b`** (same blob as `4b-thinking`, digest
`1343d82ebee3`) **thinks until the window is full** and never emits ACP
tools. Skip-Hermes with the compact catalog is a different result (Admin
2026-08-24: tools at 8k on CPU). The 4B **Instruct** tee
(`qwen3-vl:4b-instruct`, digest `ee4b975b58c17ce2…` /
`ee4b975b58c1`) still stands. First-run is now
[005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)
(`qwen3-vl:8b` Thinking @ 32k), not this Instruct tag.

`RECOMMENDED_MODEL` / `modelForTier` are `qwen3-vl:8b` (005). This file is the 4B tee record, not the flip.

Upstream `main` (0.1.32+) has no `compact-computer-observe.ts` and no
this plan. Catching up is a separate merge.

## Why 4B

This file teed **4B** because official 8B cannot be squeezed below
~6.1 GB. That size caution is **overridden for first-run by
[005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)**. The 4B
measurements below still matter: Hermes Thinking 4B @ 8k filled the
window; Instruct 4B tools fired. Phase 1 scored **tools fire**, not
Cowork.

## What changed in the tree

JPEG capture: [`server/compact-computer-observe.ts`](../../server/compact-computer-observe.ts)
`compactObserveImageForModel` is **true** for `qwen3-vl`. At 8k a fused
JPEG on the Hermes tool role overflows; the wrap captions via skip-Hermes
`/v1` ([007](2026-08-23-007-hermes-eyes-plan.md)). Granite 3B/8B stay text.

P8: eight `vm_*`. No new names. No Beehiiv recipes.

Licence comments next to Granite in
[`server/local-model.ts`](../../server/local-model.ts) and
[`server/machine.ts`](../../server/machine.ts) (weights are not npm;
`pnpm check:licenses` will never see them).

## Live probes (this box, 2026-08-23)

Ollama **0.32.15** on `127.0.0.1:11434` (pinned zip,
`C:\Users\NEW\.openmausbot\local-runtime\ollama.exe`, models under
`local-models`). Context 8192. Local VM container
`openmausbot-computer` was Up.

| Gate | Result |
|---|---|
| `/api/show` `qwen3-vl:4b` | `completion,vision,tools,thinking`. Q4_K_M, 4.4B |
| `/api/show` `qwen3-vl:4b-instruct` | `completion,vision,tools` (no thinking). Same size class |
| Dummy `ping` on Thinking, no image | **200**, `tool_calls` `ping({ok:true})`. Short prompt; window held |
| Dummy `ping` on Thinking + valid 1×1 PNG | **200**, `tool_calls` (phase 2 preview; fuse still off) |
| Dummy `ping` on Instruct, no image | **200**, `tool_calls` `ping({ok:true})` |
| RAM/VRAM Thinking at 8k | Model 3.57 GB in VRAM. GPU 5554 / 6144 MiB used (402 MiB free). System RAM **2.09 GB** free of 15.72. Tighter VRAM than hoped; more RAM than Granite 8B (0.6 GB). Do not treat 6 GB VRAM as comfortable. |
| Instruct `/api/ps` 8k | `size_vram` 3.57 GB, `context_length` 8192, digest `ee4b975b58c1…` |
| Hermes ACP Thinking | Chat `pong` **pass**. Combined file+echo+`vm_open`: Ollama **`n_tokens = 8191, truncated = 1`**, thoughts only, `stopReason: end_turn`, **no** ACP `tool_call`. |
| Hermes ACP Instruct | Chat `pong`. Combined: ACP `write_file` (workspace file is `8241`), `read`, `terminal: echo OMB-TEE-OK`, `vm_open` `{url: https://example.com}`. **Tools fire.** Native tee has the four `tool_call`s; `vm_open` `tool_call_update` was not in that tee (model streamed a wrap-up ~10 s later). Write on disk is the honesty check for the file. |

## Live probe (Admin profile, 2026-08-24) — crash was Vulkan, not 32k

Different machine than the 2026-08-23 `NEW` tee (that one had NVIDIA 6 GB
VRAM). This login: **no NVIDIA**, Intel UHD 630 + AMD HD 7700, **48 GB**
RAM, Ollama **0.32.15**. Pinned zip includes a **Vulkan** backend.
Harness `runtimeEnv()` sets `OLLAMA_FLASH_ATTENTION=1` and does **not**
set `OLLAMA_VULKAN=0`.

Default harness serve: skip-Hermes `/api/chat` on `qwen3-vl:4b` died
HTTP **500**, `llama-server` exit **`0xc0000409`**, at **32k and at 8k**
(tiny `ping`, no tools, after restart). That crash is **not** a 32k-KV
result.

Same process with Ollama docs’ Vulkan off (`OLLAMA_VULKAN=0`,
`GGML_VK_VISIBLE_DEVICES=-1`). Serve log: `inference compute library=cpu`,
`size_vram` 0. Flash attention **stayed on**. Combined skip-Hermes prompt
(compact Path A tools, file+echo+`vm_open`):

| Gate | Result |
|---|---|
| 8k `num_ctx` | **200**, `done_reason: stop`, **not** truncated. `prompt_eval_count` 734, `eval_count` 598. Tools: `write_file`, `terminal`, `vm_open`. Runner ~3.5 GiB RAM. ~3.5 min. |
| 32k `num_ctx` | **200**, `done_reason: stop`, **not** truncated. Prompt 734, eval 489. Same three tools. Runner ~5.3 GiB RAM, `context_length` 32768. ~3.3 min. |

So: **Vulkan on this iGPU/old AMD card crashed the helper.** CPU inference
can load 8k **and** 32k. Skip-Hermes Thinking **does emit tools at 8k**
with the compact catalog; 32k is not what made tools appear. The
**Hermes ACP** 8k miss (`n_tokens = 8191, truncated = 1`, no ACP tools)
is still the `NEW` NVIDIA tee — not re-run here. Do not ship Thinking as
first-run from this CPU skip-Hermes pass. Do not bump
`OLLAMA_CONTEXT_LENGTH` as the default.

### Hermes ACP at 16k (Admin, 2026-08-24) — started, not a tool-call verdict

Tried the Path A *stack* (Hermes + Thinking + combined file+echo+open
prompt) at `OLLAMA_CONTEXT_LENGTH=16384`, Vulkan still off.

Local VM is **not** up here (Docker Desktop pipe missing; Podman machine
not started). `computer: vm` dies immediately:
“Prepare the Cua desktop image…”. So this was Hermes with **computer
off** (no eight `vm_*`). Not a full Path A catalog.

First `session/new` hit the harness **30s** cap (`NEW_SESSION_TIMEOUT`)
while Hermes waits up to 30s for ACP MCP. Retry succeeded. Ollama
`llama-server` `-c 16384`, runner **4.1 GiB** RAM, `size_vram` 0.
The real generation prompt was **`task.n_tokens = 5993`** (into 16k).
Prefill on CPU was ~6–17 tok/s and still running at **4096 / 5993**
after ~10 min. After ~21 min Hermes returned
`stopReason: cancelled`. **No ACP `tool_call`.** Mid-prefill stop was
`n_tokens = 5124, truncated = 0` — the window was not full; the client
gave up.

5993 prompt tokens at 8k would leave ~2k for thinking (easy to fill).
At 16k it would leave ~10k — enough in theory, **unproven** here. A
Path A VM catalog would only make the prompt larger. Do not treat 16k
as a measured Hermes Thinking pass.

Ollama died once mid-pull (`curl` recv reset). Resume recovered. 8B as
first-run is [005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md),
not a silent extra pull from this tee.

Hermes Agent v0.20.5, 207 commits behind. Do not `hermes update` as a
surprise.

## Ship checklist (not this change)

[005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md) constants are in
tree. Admin CPU Hermes ACP gold on 8B @ 32k **failed** (20 min stall,
no `tool_call`). Do not execute
[003](2026-08-24-003-path-a-qwen3vl-first-run-plan.md). **Do not ship 4B
Thinking at 8k.**

Rollback of 005: Granite (or leftover 4B) stays on disk; flip the
constants back as 005 says.

## Phase 2 (not this PR)

Instruct Ollama tools+user-image, tools+tool-role-image, and Hermes ACP
`{type:image}` all quoted `OMB-EYES-7F3A` on 2026-08-23. Product paste
and MCP screenshots still send a path. Implementation:
[007](2026-08-23-007-hermes-eyes-plan.md). [005](2026-08-23-005-hermes-images.md)
is the fallback if that gold turn fails. Click format stays
`vm_click {index}` unless a later tee shows indexes are the bottleneck.
Do not drive the host desktop. JPEG-on-the-tool-role for `qwen3-vl`
overflowed 8k; 007 shipped skip-Hermes captions instead.

## Out of scope

Hermes replacement, EvoCUA, P6 `acp/core.ts`, extra `vm_*`, shipping
32k KV, upstream 0.1.32 merge,
`hermes update`, flipping `RECOMMENDED_MODEL`.
