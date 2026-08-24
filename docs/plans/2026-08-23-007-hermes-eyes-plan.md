# Hermes eyes (paste + VM screenshots)

Status: **in tree.** Parent: Path A seeing. Research:
[005](2026-08-23-005-hermes-images.md). Weight tee:
[006](2026-08-23-006-qwen3vl-replace-granite-plan.md).
P8: [008](2026-08-22-008-computer-safety-eval-plan.md).

Hermes stays. No first-party Ollama driver. No `hermes update`. No
`RECOMMENDED_MODEL` flip. P6 (`acp/core.ts` keep-alive) out of scope.
Eight `vm_*` only.

## Live (this box, 2026-08-23)

Ollama 0.32.15, Hermes 0.20.5, Instruct `qwen3-vl:4b-instruct`, Local VM.

| Slice | Result |
|---|---|
| **A paste** | Product `<attached-image>` + ACP `promptCapabilities.image` → `{type:"image"}`. Reply quoted `OMB-EYES-7F3A`. Bot `5e6acf20-1b58-4ffb-8a1a-b5290cc1e1d9`. |
| **B wiring** | `mcp_tool.py` mark `openmausbot-eyes-mcp`. `model.supports_vision` true for VL inject, false for Granite. Cua 0.20.0 `screenshot` is denied (`no reviewed risk classification`); `get_desktop_state` writes `screenshot_file_path`. Compact wrap `podman exec` + ffmpeg 512px JPEG. |
| **C Pipe A JPEG** | After `vm_open`, ACP `tool_call_update` held `_multimodal` content (`image_url` / data URL). **No `MEDIA:`.** Ollama then **400**: follow-up prompt **8500** tokens vs **8192**. Hermes: `Context length exceeded (~2235 tokens)`. |
| **D Pipe B caption** | Skip-Hermes `/v1` (no tools) captions the JPEG; Hermes gets **text only**. GoldEyes4 thread `f5d702b6-ca2e-48be-8253-aa1ffdadb7aa`. `vm_open` result AX has Poster / Restore pages, then a separate line **`OMB-GOLD-C9E2`**. Secret was not in title/AX. Chat model looped on `[155] Restore pages?` and did not quote the letters. Tools: `vm_open`, `vm_click`, `vm_window` only. |

Do not score chat prose. Eyes for VM shots are the caption line on the
mutating `vm_*` result. Paste still uses ACP image blocks. First-run
stays Granite.

## check-upstream-first

Fetched `upstream/main` 2026-08-23. This branch is **ahead**; they are
at least **0.1.32**. Catching up is a **separate** merge. Do not mix it
in.

| Path | Upstream |
|---|---|
| `server/attachments.ts` | **Theirs** (`6b2ca7e`, #295). Path on disk; prompt carries `<attached-image path="…"/>`. |
| `src/lib/composer-attachments.ts` | Same contract. |
| `server/drivers/acp/core.ts` | **Theirs.** `session/prompt` is still `prompt: [{ type: "text", text }]`. No image blocks. |
| `server/compact-computer-observe.ts` | **Ours.** Not on `upstream/main`. |
| `SendTurnInput.images` / per-driver image SPI | **Absent** on both sides. The abandoned stack in [002](2026-08-20-002-user-image-attachments-and-lightbox-plan.md) must not come back. |

Upstream’s attachment design is correct for Codex: given a path, Codex
opens it with `imageView`. Path A Hermes has no `vision_analyze` in
`LOCAL_HERMES_ACP_TOOLSETS`, so a path in the text is a filename the
model cannot open.

**Recommendation:** keep upstream’s path-in-text as the product
contract. Add pixels only at the last hop that already speaks a
protocol with image parts (ACP `session/prompt`, Hermes tool-result
`_multimodal`). New files for the logic. One call in `acp/core.ts`.
Hermes `mcp_tool.py` via the existing `ensureHermes*` patch seam, not a
vendored copy.

## What we already proved (this box, 2026-08-23)

Secret PNG painted `OMB-EYES-7F3A`. Model
`qwen3-vl:4b-instruct`. Ollama 0.32.15. Hermes 0.20.5.

| Probe | Result |
|---|---|
| Ollama user `image_url` + tools, `tool_choice: none` | **200**, quoted the secret |
| Same + `tool_choice: auto` | **200**, `tool_calls` `ping` |
| Ollama **tool-role** `{text, image_url}` | **200**, quoted the secret |
| Ollama tool-role string `MEDIA:<path>` | **200**, invented text. Path is not pixels. |
| Product paste (`<attached-image>` as ACP **text**) | **Fail.** Hermes asked for `vision_analyze`. Native tee: `prompt: [{type:"text"}]` only. |
| Hermes ACP `{type:"image", mimeType, data}` | **Pass.** Reply was exactly the secret. No tools. |

Two leaks, same symptom:

1. **Paste** — we send the filename. Hermes would show the photo if we
   handed it over. Easy.
2. **VM screenshot** — we can attach an MCP image. Hermes 0.20.5 caches
   it and returns `MEDIA:<path>` as a **string**. Its own vision tool
   already returns a `_multimodal` envelope; the MCP path never does.
   Then `run_agent._tool_result_content_for_active_model` strips
   tool-role images unless `model.supports_vision` is set (custom
   Ollama is not on the provider allowlist).

Do not score chat prose. Score the native tee / Ollama HTTP.

## Binding decisions

- **Keep the path tag.** Do not add `SendTurnInput.images`. Do not
  teach every driver a different image shape. That failed the deletion
  test once already (skill `module-design`).
- **ACP last hop, all ACP agents that advertise images.** Not a
  Hermes-only `buildPrompt` hook. One adapter is a hypothetical seam;
  ACP `ImageContentBlock` is the protocol. Gate on
  `initialize.agentCapabilities.promptCapabilities.image`. Fake ACP
  stays text-only unless a test turns that flag on.
- **Hermes MCP last hop, existing patch seam.** Same pattern as
  `ensureHermesComputerShortNames`: pure `patch*Source`, idempotent
  mark, `transformEnv` applies it, tests against a stock snippet in
  `server/drivers/local-inject.test.ts`. Do not vendor all of
  `mcp_tool.py`.
- **Hermes-documented VL knob, not a second loop.** For local-inject
  VL tags, write `model.supports_vision` next to the `model.provider`
  upsert we already do. Set it **false** (or omit) when the inject
  model is not VL so Granite never inherits a sticky true. This is
  Nous’s escape hatch for custom endpoints that are missing from
  models.dev. Do not add `vision` to Path A toolsets. Do not point
  `auxiliary.vision` at a second weight unless Pipe A’s gold turn
  fails (that is 005’s fallback, not this job).
- **Fuse on for `qwen3-vl` only after the MCP envelope is in the
  patch and `supports_vision` is wired.** Today
  `compactObserveImageForModel` is false so we do not feed Hermes
  pictures it will stringify. Flip that helper; reuse it for the
  YAML knob so fuse and vision stay one list.
- **Pipe B was taken.** Pipe A put `image_url` on the tool role
  (patch stuck) then overflowed 8k. Caption is in
  `compact-computer-mcp.ts` via skip-Hermes `/v1` **without** tools.
  Fork-owned. No Hermes upgrade. JPEG is still not attached when the
  caption env is set.
- **Do not `hermes update`.** 0.20.5 is what we patch. Nous `#85994`
  is not in this build; we are not waiting on it.

## Leak 1 — paste (ACP image blocks)

Product contract stays: composer emits `<attached-image path="…"/>`,
file lives under `~/.openmausbot/attachments`,
`server/attachments.ts` stays byte-identical to upstream.

New fork file (name they are unlikely to collide with), e.g.
`server/acp-prompt-blocks.ts`:

- Parse the same tag `splitAttachedImages` already knows.
- Read bytes **only** via the attachments name-lock (basename matches
  `readAttachment`; path must resolve under `ATTACHMENTS_DIR`). A
  forged tag pointing at `config.json` stays text.
- Missing / oversized / non-image: leave the tag in the text, do not
  fail the turn.
- Return ACP content blocks: text (tag stripped or replaced with a
  short “[Attached image]”) plus `{ type: "image", mimeType, data }`
  base64. We already proved that shape against Hermes 0.20.5.

`acp/core.ts` change: one call. After `buildPromptText` (or the
default persona prepend), if this session’s initialize advertised
`promptCapabilities.image`, send `prompt: blocks` instead of
`[{ type: "text", text }]`. Do not mix this with P6 keep-alive.

Tests (same seam as callers):

- Pure helper: good PNG under attachments dir → image block; path
  escape / missing file → text only.
- Fake ACP: advertise `promptCapabilities.image`, dump the
  `session/prompt` params, assert an image block is present. Existing
  tests stay green because the fake does not advertise the flag today.

Codex / Claude / grok HTTP are unchanged. They never go through this
`session/prompt` array.

## Leak 2 — VM screenshot (Hermes keeps the photo)

Compact wrap can already attach a JPEG when fuse is on
(`server/compact-computer-mcp.ts` `reply()`). Hermes
`tools/mcp_tool.py` (~1118, ~5875, ~5906) joins `MEDIA:<path>` into
`json.dumps({"result": text_result})` — a **string**. Registry
`_normalize_handler_result` already accepts the one structured
exception: `{ _multimodal: true, content: [...] }`. That is the
envelope `vision_analyze` uses
(`tools/vision_tools.py` `_build_native_vision_tool_result`).

Patch (mark e.g. `openmausbot-eyes-mcp`): when an MCP result had
image blocks, return that envelope (text parts + `image_url` data
URL) instead of the JSON string. Still caching to disk is fine.
Idempotent. CRLF-safe like the other patches. Call from
`transformEnv` next to `ensureHermesComputerShortNames`.

That is not enough by itself: `run_agent.py`
`_tool_result_content_for_active_model` flattens the envelope to
`text_summary` when `_model_supports_vision()` is false.
`_supports_media_in_tool_results("custom" | "ollama")` is **false**
in 0.20.5. The documented override is `model.supports_vision: true`.
Wire it in `selectHermesInjectProvider` / the existing YAML upsert
for VL inject ids only.

Then `compactObserveImageForModel('qwen3-vl…')` → true. Tests that
assert the qwen3-vl skip must flip with the helper.

## Order

1. Leak 1 helper + `acp/core.ts` one call + fake ACP test.
   Re-probe: product paste of the secret PNG on Instruct. Pass =
   reply contains `OMB-EYES-7F3A`. Native tee has `type:"image"`.
2. Leak 2 `mcp_tool.py` patch + `supports_vision` for VL inject +
   tests on the stock snippet / YAML upsert.
3. Fuse on for `qwen3-vl`.
4. Gold turn (below). Native tee, not chat.
5. **Taken:** Pipe B caption after Pipe A overflowed 8k. JPEG is
   captured then described; Hermes gets text. Write-up in this file.

`pnpm typecheck` and `pnpm test` after each code step. `pnpm lint`
is already red on unrelated files; do not expand that.

## Gold turn

Pixel-only secret **not** present in AX / title (Rio’s clashofclicks
turn was a bad bar: leftover Chromium AX looked like “the site”).
Instruct + Local VM. Secret used live: **`OMB-GOLD-C9E2`**.

| Check | Result |
|---|---|
| Native tee after mutating `vm_*` | Pipe A: `_multimodal` / `image_url`, **no `MEDIA:`**, then Ollama **400** (8500 > 8192). Pipe B: caption line **`OMB-GOLD-C9E2`** after AX. Thread `f5d702b6-ca2e-48be-8253-aa1ffdadb7aa`. |
| Model output or next tool args | Chat looped on Chromium `[155] Restore pages?` and did not quote the letters. Do not score chat prose. |
| Fuse | Capture on for `qwen3-vl`. JPEG **not** forwarded to Hermes+tools at 8k. |
| P8 | Eight `vm_*`. Gold used `vm_open`, `vm_click`, `vm_window`. |
| Granite | Helper still false. YAML `supports_vision` cleared on Granite inject (unit). |

Pipe A overflow is not needle drift. Slice D was taken.

## Out of scope

Hermes replacement, `hermes update`, P6, extra `vm_*`, Beehiiv
recipes, driving the host desktop, flipping `RECOMMENDED_MODEL`,
upstream 0.1.32 merge, committing `~/.openmausbot`, editing
`dist-server/`, wrapping Path A in `observe-computer-mcp`, sending
JPEGs to Granite 3B/8B.

## Implementation

Do not start slice B until slice A’s live paste probe passes. Do not
flip fuse (slice B helper) without the MCP patch and the YAML knob in
the same slice. Pipe B is slice D, only after a failed gold turn.

`pnpm typecheck` and `pnpm test` after each slice. Do not expand the
existing lint red. Do not edit `server/attachments.ts` or
`src/lib/composer-attachments.ts`.

### Slice A — paste (ACP image blocks)

**New** `server/acp-prompt-blocks.ts` + `server/acp-prompt-blocks.test.ts`.

Interface (the only thing `acp/core.ts` learns):

```ts
acpPromptAcceptsImage(initializeResult: unknown): boolean
buildAcpPrompt(text: string, opts: { images: boolean }): AcpPromptBlock[]
```

`AcpPromptBlock` is `{ type: "text", text: string } | { type: "image", mimeType: string, data: string }`.

Behaviour:

- `images: false` → `[{ type: "text", text }]` (today’s shape). Existing
  fake ACP tests stay green because fake `initialize` does not advertise
  `promptCapabilities.image`.
- `images: true` → parse `<attached-image path="…"/>` with the same
  regex / entity unescape as `splitAttachedImages` (copy the regex into
  this file; do not import `src/`). Strip tags from the text block.
- Load bytes only when `path.basename` passes `readAttachment`’s name
  lock **and** `path.resolve(path)` is inside `path.resolve(ATTACHMENTS_DIR)`.
  `C:\Windows\foo.png` must stay text even if the basename looks like an
  image. Missing / oversized / `readAttachment` null: leave that tag in
  the text, skip the block, do not throw.
- Empty text after stripping, with images: one `[Attached image]` text
  part plus the image blocks (Hermes wants a text part next to
  `image_url`).

`server/drivers/acp/core.ts` (one hop, not P6):

1. After `initialize` returns, `const promptImages = acpPromptAcceptsImage(init)`.
2. Replace `prompt: [{ type: "text", text }]` with
   `prompt: buildAcpPrompt(text, { images: promptImages })`.

`server/testing/fake-acp-cli.ts`: `FAKE_ACP_IMAGE_PROMPT` is already
cleared in `acp.test.ts` `afterEach` and unused. When it is `"1"`:

- `initialize` result includes
  `agentCapabilities: { promptCapabilities: { image: true } }`.
- `session/prompt` writes `msg.params.prompt` onto `FAKE_ACP_DUMP` (same
  file as argv/env). Do not stringify megabytes of PNG into expect() —
  assert `type === "image"`, `mimeType`, and `data` length / prefix.

`server/drivers/acp/acp.test.ts`:

- Default turn with an `<attached-image>` tag and **no** env flag → dump
  (if any) has only `type: "text"` (or no dump; the text still contains
  the tag).
- `FAKE_ACP_IMAGE_PROMPT=1`, real file from `saveImage` under the test
  HOME attachments dir → dump `prompt` has `{ type: "image", mimeType: "image/png", data }`
  and the text block does not contain the raw path as the only payload.

**Live gate before slice B:** Instruct bot, `POST /api/attachments` +
message with the tag, native tee has `type:"image"`, reply contains
`OMB-EYES-7F3A`. Same secret PNG as the 2026-08-23 probes.

### Slice B — screenshots (patch + knob + fuse)

Three edits, one slice. Fuse on without the patch re-feeds `MEDIA:`.

1. **MCP patch** in `server/drivers/acp/hermes.ts`, same shape as
   `patchHermesComputerShortNamesSource` / `ensureHermesComputerShortNames`.

   Mark: `openmausbot-eyes-mcp`. Needle: the 0.20.5 loop at
   `_cache_mcp_image_block` + `text_result = "\n".join(parts)` +
   `return json.dumps({"result": text_result}`. Copy those exact lines
   from the installed `mcp_tool.py` into `STOCK_*` in
   `server/drivers/local-inject.test.ts` (do not invent a shorter loop
   the real file will not match).

   When any image block decoded: return Hermes’s existing envelope
   (`_multimodal: true`, `content: [{type:text},{type:image_url}]`,
   `text_summary`) instead of the JSON string. Do not join `MEDIA:` into
   the text part. Caching to disk may stay. CRLF-safe. Idempotent.
   Unrelated files unchanged.

   `transformEnv` calls `ensureHermesMcpImageEnvelope(env)` next to
   `ensureHermesComputerShortNames(env)`.

2. **`model.supports_vision`** in the existing
   `upsertHermesModelProvider` / `selectHermesInjectProvider` path.
   Set `true` when `compactObserveImageForModel` (post-flip) is true for
   the inject id; set `false` or omit when it is not, so Granite cannot
   inherit a sticky true. Leave `model.default` / `model.base_url`
   alone (existing tests). Add cases in
   `describe("selectHermesInjectProvider")`.

3. **Fuse:** delete the qwen3-vl early-return in
   `compactObserveImageForModel`. Flip
   `server/compact-computer-observe.test.ts` and
   `server/computer-coworker-loop.test.ts` (`qwen3-vl*` → `true`;
   Granite stays `false`).

### Slice C — gold turn (live, not unit tests)

Instruct + Local VM. Secret **only in pixels** (not title, not AX).
`vm_open` / `vm_click` as needed.

Pass table is above. Record thread id + native tee facts in this file
and overwrite `docs/agent-status.md`. Do not commit `~/.openmausbot`.

### Slice D — taken after C overflowed 8k

Caption in `compact-computer-mcp.ts` (`captionShot`) via skip-Hermes
`/v1` without tools. `observeCompactText` last arg `captioner`: append
text, do **not** attach an image (even on caption miss). Env
`OMB_COMPACT_OBSERVE_CAPTION_MODEL` set in `index.ts` when the fuse
helper is true. JPEG capture still runs. GoldEyes4 tee had the secret
as a caption line, `MEDIA:` count 0, no context-length error.

### Files (expected)

| File | Slice | Why |
|---|---|---|
| `server/acp-prompt-blocks.ts` + `.test.ts` | A | New. Fork-owned. |
| `server/drivers/acp/core.ts` | A | One initialize read + one `prompt:` call. |
| `server/testing/fake-acp-cli.ts` | A | Advertise image + dump prompt. |
| `server/drivers/acp/acp.test.ts` | A | Fake round-trip. |
| `server/drivers/acp/hermes.ts` | B | Patch + YAML knob + `transformEnv` one line. |
| `server/drivers/local-inject.test.ts` | B | STOCK snippet + YAML cases. |
| `server/compact-computer-observe.ts` + tests | B | Fuse on for qwen3-vl. |
| `server/computer-coworker-loop.test.ts` | B | Expectation flip. |
| `server/compact-computer-mcp.ts` | C+D | Cua `screenshot_out_file` guest read + skip-Hermes caption |
| `server/compact-computer-open.ts` | C | `screenshot_out_file` on `CuaCallArgs` |
| `server/index.ts` | D | Caption model env when VL fuse helper is true |
| this plan + `docs/agent-status.md` | C+D | Tee record. |

Not in the diff: `attachments.ts`, `composer-attachments.ts`,
`contracts.ts` (`SendTurnInput.images`), `computer-proxy.ts`, extra
`vm_*`, first-run constants.
