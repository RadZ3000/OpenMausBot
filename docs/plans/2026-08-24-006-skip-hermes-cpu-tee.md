# Skip-Hermes CPU tee: 4B vs 8B vs Hermes ACP

Status: **measured 2026-08-24.** Skip-Hermes on **Admin CPU**; Hermes ACP
also on **NVIDIA**. Not a product change. Path A gold is still Hermes ACP
([005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md)).
This file is the timing record so the next session does not re-tee the
same prompt.

Upstream `main` (fetched 2026-08-24, this branch even with `1602f97`):
no skip-Hermes tee, no first-party Ollama driver. Ours.

## What was run

Direct Ollama `/api/chat`, **not** Hermes ACP. Compact Path A catalog
from `thinkingAgentChatBody()` in `server/qwen3vl-context.ts` (ten tools:
`write_file`, `terminal`, eight `vm_*`). Combined prompt: write
`omb-tee.txt` with `8241`, `echo OMB-TEE-OK`, open `https://example.com`.
`stream: false`, `options.num_ctx: 32768`. Unsuffixed Thinking tags, not
Instruct.

Box: Admin Windows, **no NVIDIA**, Vulkan off, CPU, Local VM down,
Ollama **0.32.15**, `size_vram` 0. 48 GB RAM. Cold load each time
(nothing resident).

4B used the probe helper (`qwen3-vl:4b`). 8B posted the same body with
`model` overridden to `qwen3-vl:8b`. 8B wall clock is **curl
`--max-time 1800`**: Node `fetch` died at ~326 s with
`UND_ERR_HEADERS_TIMEOUT` because undici’s 5 min header wait fires
before Ollama returns a non-stream body. Do not treat that timeout as
an 8B hang.

## Results

| | Skip-Hermes 4B | Skip-Hermes 8B | Hermes ACP 8B (Admin CPU) | Hermes ACP 8B (NVIDIA) |
|---|---|---|---|---|
| Tag | `qwen3-vl:4b` | `qwen3-vl:8b` | `qwen3-vl:8b` | `qwen3-vl:8b` |
| Digest prefix | `1343d82ebee3` | `901cae732162` | `901cae732162` | `901cae732162` |
| Box | Admin CPU | Admin CPU | Admin CPU | RTX 2060 6 GB, 15.72 GB RAM |
| When (CDT) | 15:54 | 16:09 | earlier 24 Aug | 18:32 |
| Wall | **166 s** (2 min 46 s) | **240 s** (4 min 0 s) | **~20.7 min** then cancel | **~7.5 min** to first tool |
| Load | 7.0 s | 12.3 s | `session/new` ~6 s | `session/new` ~3 s |
| Prefill | 30.0 s · 734 tok · ~24.5 tok/s | 69.8 s · 734 tok · ~10.5 tok/s | no ACP chunks | thoughts streamed (1773 chunks) |
| Decode | 129.3 s · 582 tok · ~4.5 tok/s | 158.1 s · 369 tok · ~2.3 tok/s | — | then tools |
| `done_reason` | `stop` | `stop` | `session/cancel` (`TURN_STALL_MS`) | still busy on write approval |
| Truncated | no | no | no (not a full-window miss) | no |
| Tools | `write_file` (`omb-tee.txt` / `8241`), `terminal` (`echo OMB-TEE-OK`), `vm_open` (`https://example.com`) | **same three, same args** | **none** | `write` `omb-tee.txt` / `8241`, `terminal` `echo OMB-TEE-OK`, `terminal` `start https://example.com` |
| Thinking | 2046 chars | 1172 chars | unknown (no chunks) | long thought stream before tools |
| `size_vram` | 0 | 0 | 0 | 3509091040 |

Same three tools as the morning 4B CPU gates in
[006](2026-08-23-006-qwen3vl-replace-granite-plan.md) (8k ~3.5 min, 32k
~3.3 min). Decode length moves wall clock; 8B is slower tok/s, not stuck.

Hermes ACP 8B gold **on Admin CPU**: thread `7105ac50-…`, `llama-server -c 32768`,
`computer: off`, default 20 min stall watchdog. **No** `tool_call`, not
`0xc0000409`. Same shape as Hermes 4B @ 16k on that box (cancel mid-prefill
of a ~6k agent prompt). UI “hey” through Hermes still sits at 0 tok —
that path still sends the Hermes catalog.

Hermes ACP 8B gold **on NVIDIA** (same day, same prompt, thread `cf3a8ba9-…`):
**pass** at ~7.5 min. Three ACP `tool_call`s (write / echo / host `start` URL).
`size_vram` ~3.3 GB on a 6 GB RTX 2060. Spec write-up:
[005](2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md).

## What this means

The 20 min Retry card **on CPU** is **Hermes’s agent prompt without a GPU**,
not 4B/8B weights being unable to emit tools. Skip-Hermes compact catalog
finishes on Admin CPU. NVIDIA Hermes gold on the fat catalog **does**
emit tools (~7.5 min). Chat in the app still goes through Hermes until
someone asks for a first-party Ollama loop.

Do **not**: flip Path A gold to skip-Hermes from this file, bump
`TURN_STALL_MS` as a speed fix, treat undici’s 5 min header timeout as
a model hang, or re-run this tee unless the catalog, context, or box
changes.
