# Path A goal: EvoCUA-shaped local stack

**Conclusion of the 2026-08-23 discussion. Not shipped.**  
Granite 3B first-run stays until a live tee wins **and** a ship ask.  
Fork-owned rework is in bounds. Do not push `upstream`.

Weights research: [`2026-08-23-003-open-computer-use-brain.md`](archive/2026-08-23-003-open-computer-use-brain.md).  
Granite bake-off (dead end for this goal): [`2026-08-23-002-path-a-drive-sites-bakeoff.md`](archive/2026-08-23-002-path-a-drive-sites-bakeoff.md).

---

Goal: a local bot that can talk, use files, and actually drive the VM — see the screen, click, recover. No API key. Not “Granite with a cheat sheet.”

Brain

Granite 3B is the wrong brain for that. It calls text tools; it guesses when the page is ugly.

EvoCUA (32B, or 8B if we shrink) is the open model that fits the goal: see + click, and it should still talk.

32B does not fit this laptop. It wants a GPU box.

Eyes

Computer use needs real screenshots in the model.

Hermes today does not do that (it sends a file-path note). **Paused:** keep Hermes and make images work through it — [`2026-08-23-005-hermes-images.md`](archive/2026-08-23-005-hermes-images.md). Do not start a replacement driver until that is tried.

Hands

The VM + Cua are already real hands.

The eight vm_* names are a Granite crutch. For EvoCUA, drop that and do picture → click. Don’t throw away Cua.

Memory

We kill the agent every message. Grok doesn’t. The session has to stay up, or follow-ups stay dumb.

---

## Also true (keep short)

- **Laptop sleep:** a “keep awake while busy” toggle is worth it. It does **not** mean work continues with the lid shut.
- **Where it runs:** the VM is on this PC unless we put it on a server. The **brain** is 32B on a GPU box, or 8B if we try the laptop.
- **Not Grok Bot.** We own the machines. Quality is unproven until a live run.

The stack is **viable if** eyes, memory, and EvoCUA-besides-clicking are solved, **and** a live VM run doesn’t flop.

**Hermes replacement (this goal):** we do not use Hermes. A **driver we own** calls EvoCUA with **pictures**, runs the **loop**, and uses **Cua + files**. No second CLI.

---

## Research holes (only these)

1. **Eyes** — screenshot bytes in the model request, not `MEDIA:path` text.
2. **Memory** — same agent process (or a real resume) across user messages.
3. **EvoCUA besides the computer** — talk + files with the same brain.

Then: **drive our VM** (picture → Cua click). That is the proof, not OSWorld.

---

## Simplest tests (cheap first)

Do not pull EvoCUA-32B onto this laptop. Do not change `RECOMMENDED_MODEL`.

### 1. Memory — already answered, no GPU

`server/drivers/acp/core.ts` starts a new `hermes acp` every send and kills it when the turn ends. `session/load` comes back `{}`.

**Pass:** we treat that as a fact. Fix = keep the process (P6) **or** stop using Hermes.

**No new experiment needed** unless we are testing a keep-alive patch.

### 2. Eyes — skip Hermes first (this PC is enough)

Hermes dropping pictures is **already probed** (MCP image → `MEDIA:<path>`).

**Cheapest next check:** one screenshot (Chromium error / 404) → **Ollama `/api/chat` with `images`**, any small VL (`qwen2.5vl:3b` if we pull it). No Hermes. No EvoCUA.

- **Pass:** the model names buttons / “error” from the **pixels**. Then we know: bypass Hermes works; Hermes is the hole.
- **Fail:** even direct Ollama is blind or useless — then VL-on-Ollama is the hole, not only Hermes.

**Skip Hermes (already ran):** secret text on a PNG, not in the prompt. Ollama `qwen2.5vl:3b` quoted it. **Pass.**

**Hermes images (2026-08-23).** Two sockets:

- **MCP screenshot** (what Cua would send): `_cache_mcp_image_block` → `MEDIA:<path>` text. **Fail** for pixels.
- **ACP chat image** (user-attached PNG, same secret picture, `qwen2.5vl:3b`): Hermes logged `[1 image]`, then Ollama **400**: model **does not support tools**. **Fail** as a turn. Hermes still sends a tool catalog with the picture.

So: skip-Hermes Ollama vision **works**. Hermes+this VL **does not** (MCP strips pixels; ACP+tools blows up on a no-tools VL).

Only after pass: try the **same JPEG** through Hermes MCP and confirm it is still a path string.

### 3. EvoCUA besides clicking — needs a GPU box

vLLM as they document. No Path A. No `vm_*`.

- **Talk:** “reply in one sentence.”
- **Files:** paste a short file **in the prompt** (or one OpenAI-style tool if their server exposes tools). Ask what’s in it.
- **See:** same error-page JPEG. Ask what to click. Must describe the **picture**, not invent a login.

**Pass:** it talks, it uses the file text, it describes the real screen.

**8B vs 32B:** run **8B** if the box is small; **32B** if we have the GPUs. Same three prompts.

### 4. Drive our VM — only after 2 and 3

Screenshot from Cua → EvoCUA → click x,y → Cua `click`. Same gold ideas as the bake-off (example.com, ugly/error page, recover). Score the **action**, not chat.

Keep Cua. Do not add Granite `vm_*`.

---

## Do not

- Dual Granite+EvoCUA in RAM, or a router brain.
- JPEG to Granite 3B.
- Treat OSWorld as a ship.
- Edit `computer-proxy.ts` to “port Box.”
- Call laptop-keep-awake “works with the lid closed.”
