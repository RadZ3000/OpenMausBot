# Make Hermes images work (keep Hermes)

**Investigation, 2026-08-23. Not shipped.**  
Hermes stays. Granite 3B first-run unchanged.

2026-08-23 later: Path A candidate through Hermes is
**`qwen3-vl:4b-instruct`**
([006](../2026-08-23-006-qwen3vl-replace-granite-plan.md)). Unsuffixed
`qwen3-vl:4b` (Thinking) **fills 8k and never calls tools**. Ollama dummy
tools **and** a PNG together returned **200** on the Thinking tag (unlike
`qwen2.5vl:3b`). **007 is in tree:** paste = ACP image blocks; VM shot =
Pipe B caption (Pipe A JPEG+tools overflowed 8k). This file stays the
Granite + aux VL fallback if someone turns caption off.

Replacing Hermes is **paused**. The replacement was never a second copy of
the whole product (Telegram, cron, browser, skills hub). It would have been
**our** loop + the tools Path A actually uses: files, run-command, VM
computer. That list was not written clearly enough. Until Hermes pictures
work (or we prove they cannot), we keep Hermes and fix images **through
it**.

Installed: **Hermes Agent v0.20.5** (`2eaa8631`) at
`%LOCALAPPDATA%\hermes\hermes-agent`. Ollama on this PC.

## What we already knew

Skip-Hermes: `qwen2.5vl:3b` + native `/api/chat` `images[]` read the secret
string `OMB-EYES-7F3A` off a PNG. **Pass.** The weight can see.

Hermes as **main** model `qwen2.5vl:3b` + ACP tools: Ollama **400** `does
not support tools`. **Fail.**

MCP screenshots: Hermes caches bytes and gives the model `MEDIA:<path>`
(`tools/mcp_tool.py` `_cache_mcp_image_block`). That tag is for **chat
apps** (Telegram/Discord), not for Ollama pixels.

## What this machine proved today

`POST http://127.0.0.1:11434/api/show`:

| Tag | `capabilities` |
|---|---|
| `ibm/granite4.1:3b` | `completion`, `tools` — **no vision** |
| `qwen2.5vl:3b` | `completion`, `vision` — **no tools** |

Ollama **`/v1/chat/completions`** (what Hermes `vision_analyze` uses):

| Request | Result |
|---|---|
| `qwen2.5vl:3b` + `image_url` **no tools** | Quoted `OMB-EYES-7F3A`. **Pass** (8 s). |
| Same + a dummy `tools` array | **400** `does not support tools`. Same error as the ACP probe. |

So: **one model cannot be both the toolbox and the eyes** on this Ollama.
That is not a Hermes bug. It is how these two tags are shipped.

## How Hermes actually wants pictures (0.20.5)

First-party vision doc: user-pasted images go **native pixels** if the
**main** model `supports_vision`; otherwise they go through
`vision_analyze` (a **second** vision model describes the picture as
**text**). Config: `agent.image_input_mode` (`auto` / `native` / `text`)
and `auxiliary.vision`.

MCP `ImageContent` in **this** build is still **only** `MEDIA:<path>`.
Nous PR `#85994` (auto-summarize MCP images when `auxiliary.vision` is
set) is **not** in 0.20.5. `mcp_tool.py` returns the tag and stops.

Path A ACP catalog is `file` + `terminal` + computer MCP
(`LOCAL_HERMES_ACP_TOOLSETS`). The Hermes **`vision` toolset**
(`vision_analyze`) is **not** on that list. Even a perfect aux VL would
not be callable unless we add that tool (or summarize without a tool).

`vision_analyze` **can** read a local file path (Windows path / `file://`).
A 3B will not reliably notice `MEDIA:C:\...png` and call it.

## The stack that can work (still Hermes)

Keep **Granite as the brain** (tools: files, terminal, `vm_*`).

Add **`qwen2.5vl:3b` as auxiliary vision only** — no tools on that call.
Hermes already has this job. We never turned it on.

| Knob | Why |
|---|---|
| `auxiliary.vision.provider` / `model` / `base_url` → local Ollama `qwen2.5vl:3b` | Eyes without making VL the main model |
| `agent.image_input_mode: text` | User ACP pictures go through `vision_analyze`, not native pixels on Granite (blind) or on VL-as-main (400 + tools) |
| Add `vision` to the Path A tool list **or** auto-caption MCP images | Otherwise screenshots stay a path string |

**MCP screenshots** still need an extra step in 0.20.5:

1. **Carried Hermes patch** — after `_cache_mcp_image_block`, call the
   same aux vision path and append the caption (same idea as `#85994`).
2. **Our MCP wrap** — `compact-computer-observe` already can attach a
   JPEG; instead of hoping Hermes forwards it, call Ollama VL **once**
   and return **text** to Hermes (fork-owned, no Hermes upgrade).
3. **Upgrade Hermes** — 143 commits behind; only if `#85994` (or better)
   is in the build we pin. Do not `hermes update` as a surprise.

(1) and (2) both keep Hermes as the loop + files + terminal + VM. (2)
does not wait on Nous.

**RAM:** two Ollama weights plus the VM. 3B + 3B VL is smaller than 8B
Granite, but both can sit in VRAM/RAM if `keep_alive` is long. Probe
before shipping.

## What “replace Hermes” would have meant (so it is not fuzzy)

Hermes-the-product is huge. Path A already turns most of it off (`web` /
browser disabled; ACP toolsets shrunk).

Jobs we still need, whether Hermes or us:

1. **Loop** — talk to the model, run tools, repeat until done. ACP today.
2. **Files** — read/write workspace.
3. **Run a command** — including Python, preferably **in the VM**.
4. **Computer** — screenshot / click / type via Cua.
5. **Eyes** — pixels or a caption the brain can trust.
6. **Stay up** — one process for follow-ups (P6). Separate from pictures.

Dropping Hermes without owning **1–4** is what you were afraid of. This
investigation does **not** drop them. It uses Hermes for 1–4 and a second
local VL for 5.

## Next probe (when asked)

Do **not** set `qwen2.5vl` as the Path A chat model.

1. Point `auxiliary.vision` at `http://127.0.0.1:11434/v1` +
   `qwen2.5vl:3b` (throwaway `HERMES_HOME` or a documented config write —
   do not silently rewrite the user’s global Hermes profile).
2. One ACP user image (same secret PNG) with **Granite** main + `vision`
   toolset + `image_input_mode: text`. Pass = Granite’s reply contains
   `OMB-EYES-7F3A` from the caption, and Ollama never 400s on tools.
3. Then MCP: either wrap caption (2) or a one-line patch after MEDIA
   cache. Pass = after `vm_look` / fused screenshot, Granite’s next
   tool/chat names something **only in the pixels**.

Fail of (2) with a working OpenAI-compat VL (already proven) means our
ACP/config wiring, not Ollama.
