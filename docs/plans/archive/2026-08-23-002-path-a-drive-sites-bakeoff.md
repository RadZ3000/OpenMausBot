# Path A drive-sites bake-off, 2026-08-23

**Walk log (measurements), not the snapshot.** Current state:
[`../agent-status.md`](../../agent-status.md). Tensions:
[`../local-model-path.md`](../../local-model-path.md). P8:
[`2026-08-22-008-computer-safety-eval-plan.md`](../2026-08-22-008-computer-safety-eval-plan.md).

Scored **native tees** (`tool_call` / `tool_call_update`), not chat prose.
Same prompts on the same Local VM. Did **not** change `RECOMMENDED_MODEL`
or `modelForTier`.

## This box (not the 48 GB walk box)

| | |
|---|---|
| RAM | 15.7 GB total |
| GPU | NVIDIA RTX 2060, 6 GB VRAM + Intel UHD 730 |
| Ollama | `C:\Users\NEW\.openmausbot\local-runtime\ollama.exe serve` `:11434`, models in `C:\Users\NEW\.openmausbot\local-models` |
| Hermes | 0.20.5 (`hermes.exe` ACP) |
| VM | WSL `podman-machine-default` Running; Cua `openmausbot-computer` Up; viewer `127.0.0.1:6080` |
| App | Packaged harness `127.0.0.1:8799` (live gold turns). Overlay/`pnpm dev` was **not** the gold-turn method. |

3B + VM was already resident before the 8B pull. 8B **loads** at 8k:

| | Before 8B chat ping | After 8B loaded (`/api/ps`) |
|---|---|---|
| Free RAM | 3.8 GB | **0.6 GB** |
| GPU used / free | 2730 / 3226 MiB | **5564 / 392 MiB** |
| Resident | — | 6.2 GB total; `size_vram` 4.17 GB; `context_length` 8192 |

Weights: `ibm/granite4.1:8b` Q4_K_M, 5.35 GB on disk, tools capability.
First `/api/chat` ping: 11.3 s load, then 5 tokens in 0.28 s.

**Do not ship 8B as a 16 GB first-run default.** It fits this discrete GPU
for a short probe and leaves almost no headroom for Electron + the 6 GiB
Podman guest. `server/machine.ts` already refuses that combo for the
product; this measurement agrees.

## Gold prompts

1. Open `https://example.com` in the Linux VM browser. Then click the first
   link on that page.
2. Open `https://www.beehiiv.com/login` in the Linux VM browser. If the page
   did not load, use a numbered control from the look. Do not describe login
   steps.

Pass (same **turn**): next tool after an honest `vm_open` look is a numbered
`vm_click` / `vm_keys` that matches the look, **or** an honest stop. Fail:
MFA / how-to essay instead of a tool. One lucky click is not a win. Both
error-page **and** example.com have to land.

Temporary bots `Bake3b` / `Bake8b` — fleet dumps not committed. Tees under
`%USERPROFILE%\.openmausbot\native\<threadId>.ndjson`.

## 3B control (`ollama::ibm/granite4.1:3b`)

Thread `cf0d9b22-6d66-462d-9634-bd1116a48f23`.

| Turn | Tee | Score |
|---|---|---|
| example.com | `vm_open` look is Example Domain + `[81] link Learn more`. Same-turn `vm_click` `{index:81}`. | **Pass** |
| beehiiv | First `vm_open` `net::ERR_HTTP_RESPONSE_CODE_FAILURE`. Then `https://beta.beehiiv.com/login` look is **404 Not found** plus Chromium chrome (`[55] Work`, `[63] Debian.org`, …). Same-turn `vm_click` `{index:55}` (chrome, not page). Chat still asked for auth steps. | **Fail** (wrong control + login prose) |

## 8B (`ollama::ibm/granite4.1:8b`)

Thread `9ab4ec7a-ba97-498a-8f90-d345c520c819`. Compact wrap was still
**text-only** in the packaged app (JPEG fuse is in-tree, not overlaid).

| Turn | Tee | Score |
|---|---|---|
| example.com | Same Example Domain look (`[81] Learn more`). Same-turn `vm_click` `{index:1}` — **1 is not a look index**. Chat claimed `[63] Debian.org`. Look after click still Example Domain. | **Fail** targeting (click happened, did not match the look) |
| beehiiv | `vm_open` failed `net::ERR_HTTP_RESPONSE_CODE_FAILURE`. Next tool was Hermes `search: browser` on the workspace, not a numbered `vm_click`. Chat: page did not load, no numbered controls, stop. No MFA essay. | Honest **stop**, not a recover-and-click |

8B did **not** meet the pass bar (error-page click **and** example.com).

## VL arm — stopped before pull

`server/compact-computer-mcp.ts` `reply()` is text-only unless
`OMB_COMPACT_OBSERVE_IMAGE=1`. Frontier JPEGs in `observe-computer-mcp`
never reach Path A.

Hermes 0.20.5 `tools/mcp_tool.py` `_cache_mcp_image_block` converts MCP
`ImageContent` to a `MEDIA:<path>` string (gateway cache under
`%LOCALAPPDATA%\hermes\cache\images\`). MEDIA tags are for sending files
to the user, not an Ollama `images[]` array. Path A catalog is `file` +
`terminal` (no vision toolset). **Pixels do not reach the local VL
weight.** Do not pull `qwen2.5vl:7b` until that forwarding is real.

In-tree harness (not live on :8799 until overlay/rebuild):
`server/compact-computer-observe.ts`. Flag only for VL inject ids
(`qwen2.5vl`, `granite-vision`, `llava`). **Off** for Granite 3B/8B **and**
`qwen3-vl` until Hermes MCP pixels (plan 006 phase 2). Imports
`fuseObservation` / `ObservationCoordinator` — does not
edit `computer-proxy.ts` or wrap Path A in `observe-computer-mcp`. Direct
Ollama JPEG probe of `qwen2.5vl:7b` was **not** run (RAM/VRAM + Hermes
drop).

## Product table

| Tee result | Product |
|---|---|
| 8B recovers, VL dead | Comfortable-tier default → 8B. **Did not happen.** |
| VL recovers, 8B how-tos | JPEG fuse only for VL ids. **VL not live.** |
| **Neither** | **Path A stays “open and read”.** Unsupervised hands stay Claude / Codex / grokAgent on the same VM. No extra `vm_*`. |
| Both help | One loaded model. Pick one first-run weight. |

`RECOMMENDED_MODEL` remains `ibm/granite4.1:3b`. Ship a new default only
if asked after a tee that actually wins.

## Out of scope (still)

P6 Hermes keep-alive, P2 CDP URL, image layer 8, host Windows desktop,
restoring Hermes `web` / `extract`, catching upstream 0.1.32.
