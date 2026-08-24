# Replace Granite with Qwen3-VL 4B (Hermes stays)

**In tree 2026-08-23. First-run default not shipped.**  
Hermes ACP stays. No first-party Ollama driver. Official 4B family is
~3.3 GB Q4_K_M. Apache-2.0. 8B (~6.1 GB) is not first-run.

At **8192** tokens, unsuffixed **`qwen3-vl:4b`** (same blob as
`4b-thinking`, digest `1343d82ebee3`) **thinks until the window is
full** and never emits ACP tools. The Path A **candidate** is
**`qwen3-vl:4b-instruct`** (digest `ee4b975b58c17ce2…` /
`ee4b975b58c1`). Same size, no think.

`RECOMMENDED_MODEL` / `modelForTier` stay `ibm/granite4.1:3b` until a
ship ask. This file is the tee record, not a license to flip defaults.

Upstream `main` (0.1.32+) has no `compact-computer-observe.ts` and no
this plan. Catching up is a separate merge.

## Why 4B

Official 8B cannot be squeezed below ~6.1 GB. 4B is ~800 MB more than
Granite 3B (~2.5 GB). Weaker at clicking than 8B. Phase 1 scored
**tools fire**, not Cowork.

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

Ollama died once mid-pull (`curl` recv reset). Resume recovered. Do not
pull 8B as first-run.

Hermes Agent v0.20.5, 207 commits behind. Do not `hermes update` as a
surprise.

## Ship checklist (not this change)

Only after you ask. **Do not ship the Thinking tag at 8k.**

- `RECOMMENDED_MODEL` → `qwen3-vl:4b-instruct`
- `modelForTier` / `APPROX_MODEL_BYTES` (~3.3 GB)
- `electron-builder.yml` `defaultModel`
- LocalModelArm comment; tests that assert the recommended tag
- Tight 4096 + Thinking is a known miss; Instruct on tight is unmeasured

Rollback: Granite stays on disk; flip the constants back.

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

Hermes replacement, EvoCUA, P6 `acp/core.ts`, extra `vm_*`, 32k KV,
upstream 0.1.32 merge, `hermes update`, flipping `RECOMMENDED_MODEL`.
