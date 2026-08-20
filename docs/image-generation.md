# Image generation

Bots can draw pictures. When image generation is configured, engines that
support it receive a `generate_image` tool; the finished picture is saved into
the bot's workspace and appears in the chat.

## Setup

1. Open OpenMausBot Settings → Connections and save a key under **Image
   generation key**. An OpenAI key works out of the box.
2. Turn it on for a bot in that bot's settings, under **Image generation**.
   The credential is workspace-wide; the grant is per bot, because every
   image costs money.

The key is stored locally as write-only configuration. OpenMausBot reports
only whether it is configured, never the value. It is injected as
`OMB_IMAGE_API_KEY` into the image proxy process alone — deliberately not as
`OPENAI_API_KEY`, which OpenMausBot strips from agent CLIs so that a key
cannot silently move Codex off its ChatGPT login and onto metered billing.

## Backends

Any endpoint that speaks OpenAI's `POST /v1/images/generations` works. Two
settings pick one:

| Variable | Default | Meaning |
| --- | --- | --- |
| `OMB_IMAGE_BASE_URL` | `https://api.openai.com/v1` | The OpenAI-compatible base URL |
| `OMB_IMAGE_MODEL` | `gpt-image-1` | The model id sent with each request |

Point the base URL at a local server — LocalAI, or ComfyUI behind its
OpenAI-compatible proxy — to generate without a hosted account. A local
endpoint that needs no key counts as configured on its URL alone.

The request deliberately omits `response_format`: `gpt-image-1` rejects it and
always answers with base64, while older models and local servers may answer
with a URL. OpenMausBot accepts either, so one client covers every backend.

## What the bot can do

`generate_image(prompt, size?)` writes a PNG under `images/` in the bot's
workspace and returns the saved path. `size` defaults to `1024x1024`.

The generator sees only the prompt, never the conversation, so the bot is
instructed to describe the picture in full.

## Approvals and limits

The tool is not marked read-only, so it goes through the normal approval card
before each call — generating an image spends money, and the prompt is worth
reading before it does. A bot may generate at most 8 images per agent session;
past that the tool refuses and tells the bot to ask first. The cap lives in the
proxy process, which the driver keeps alive across the turns of one session —
so it is not a fresh budget every turn.

Generated images are kept in the transcript at full size. Unlike desktop
screen frames, they are never pruned: they are deliverables, and the file on
disk is what the user came for. The transcript API strips the pixels from
stored messages and marks them `hasImage`, so the app fetches them back from
`/api/threads/:threadId/messages/:id/image` when it shows one.

## Engine support

The tool ships to every engine whose driver can mount an MCP server: Codex,
Claude, and the ACP engines (Gemini, Qwen, Kimi, Droid, Hermes, OpenCode Go,
and the other ACP-based agents).

`grok`, `antigravity` and `boxAgent` do **not** support it, and report so
through their capabilities — a bot is never told it has a tool its engine
cannot be handed.

## Testing

`server/drivers/image-proxy.test.ts` drives the proxy's MCP surface against a
stub images endpoint, covering the base64 and URL response shapes, truncated
images, endpoint errors, the per-turn cap, and the harness callback. No
credential or spend is involved.
