---
title: "feat: Image generation as a cross-engine capability"
plan_type: feature
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
execution: code
product_contract_source: ce-plan-bootstrap
created: 2026-08-20
---

# feat: Image generation as a cross-engine capability

## Summary

OpenMausBot has no image-generation capability. When a bot is asked for a mockup it
reports "no built-in `image_gen` tool is attached" and, on Codex, sometimes invents a
fallback path involving `OPENAI_API_KEY` that this app deliberately does not support.
That message is accurate: the harness exposes tools only through MCP proxies
([server/proxy-paths.ts](server/proxy-paths.ts)), and none of them generate images.

This plan adds `generate_image` as a first-party MCP tool, mounted by every driver that
can mount MCP (Claude, Codex, and all seven ACP engines), backed by any
OpenAI-compatible `/v1/images/generations` endpoint so the same client serves both a
hosted provider and a local diffusion server. It also closes the gap that would
otherwise make the feature useless: **tool results never reach the transcript today**, so
a generated image would land in the agent's context and never be shown to the user.

## Problem Frame

**Root cause:** there is no image capability at any layer — no `integrations` slot in
[server/contracts.ts](server/contracts.ts), no proxy in `SPAWNED_PROXIES`, no credential
section in [server/config.ts](server/config.ts).

**The non-obvious half.** Tool output is discarded on the way to the UI. Every driver
normalizes a finished tool call to `item.completed` carrying only `ok`, and the harness
folds that into an activity chip of `{ name, ok, spoken }`. The single existing path for
an image in the transcript is `Message.kind === "screen"` with `png`/`mime`
([server/store.ts:66-82](server/store.ts#L66-L82)), and it is written only by the
computer-screenshot poller at turn end
([server/index.ts:802-806](server/index.ts#L802-L806)). A `generate_image` tool that
returns an MCP image block would therefore be invisible to the user. Making the image
visible is a required unit of this plan, not a follow-up.

**Coverage limit.** Nine of twelve drivers can mount MCP. `grok` (HTTP API driver),
`antigravity` (`--print` mode) and `boxAgent` (Box REST) cannot receive MCP tools at all.
They are out of scope and must report `imageGen: false` so the harness never advertises
the tool to a bot that cannot call it.

**Scope:** new `server/image-proxy.ts`; contract/capability additions; credential storage
and settings UI; mounts in three driver files; a transcript-visibility path; tests.

## Key Technical Decisions

**KTD1 — One OpenAI-compatible images client, configured by `{ baseUrl, apiKey }`, rather
than a provider-specific SDK.** `/v1/images/generations` returning `b64_json` is
implemented by OpenAI (`gpt-image-1`), by LocalAI natively for Stable Diffusion / Flux,
and by a ComfyUI reverse proxy. A single `fetch` client therefore covers hosted and local
backends with no branching. This mirrors `LOCAL_HOSTS` in
[server/drivers/local-inject.ts:19-27](server/drivers/local-inject.ts#L19-L27), which
already solves the identical problem for text models. Rejected: an OpenAI SDK dependency
(forecloses local hosts, and proxies are bundled by esbuild where a fat dependency is a
cost), and a pluggable per-provider adapter layer (no second shape to justify it yet).

**KTD2 — A dedicated credential section and env name; never `OPENAI_API_KEY`.**
[server/drivers/codex.ts:120-122](server/drivers/codex.ts#L120-L122) deletes
`OPENAI_API_KEY` from the Codex child on purpose, because a stray key silently flips
billing off the ChatGPT subscription. Reusing that variable name — or routing the image
key through `injectedEnvironment()` in [server/config.ts:218-223](server/config.ts#L218-L223),
which flows into CLI children — would defeat that protection. The key is injected into
the image proxy's own child env only.

**KTD3 — The tool is not annotated `readOnlyHint`, so every call raises an approval
card.** Codex's `default_tools_approval_mode="auto"` runs read-only-annotated MCP tools
without asking and routes everything else to the client for approval
([server/drivers/codex.ts:70-73](server/drivers/codex.ts#L70-L73)). Image generation
spends money, so it must stay in the approval path. The proxy additionally enforces a
per-turn call cap, because an agent in a retry loop is the realistic way a user gets a
surprise bill.

**KTD4 — The proxy reports produced images to the harness out-of-band, over the existing
internal HTTP channel.** Tool results flow from the proxy to the CLI child and never pass
through the harness, so the harness cannot observe them by listening. `agents-proxy` and
`connector-proxy` already solve this with `OMB_HARNESS_URL` + `OMB_COMMS_TOKEN` against
`/api/internal/*`. Reusing that channel is strictly cheaper than teaching three drivers to
parse tool-result payloads out of three different native protocols. Rejected: having the
agent markdown-embed base64 in its reply — it works today with zero code, but burns a
large number of tokens per image and produces no file the user can open.

**KTD5 — A new `Message.kind` of `"image"` rather than reusing `"screen"`.** `"screen"`
carries defined semantics elsewhere (the Computer panel prefers the last screen message
as a live preview fallback, [src/components/ComputerPanel.tsx](src/components/ComputerPanel.tsx));
a generated mockup appearing there would be wrong. The new kind reuses the existing
`png`/`mime` fields, the existing slimming rule
([server/index.ts:299-303](server/index.ts#L299-L303)) and the existing image endpoint
`/api/threads/:threadId/messages/:id/image`, so serving and export handling come for free.

**KTD6 — Ship the tool to the nine MCP-capable drivers; report `false` for the other
three.** The counterexample to avoid is `dweb`, which is attached to turns with no
capability flag and mounted only by Claude, so other engines silently ignore it. The
`computerMcp` doc comment in [server/contracts.ts](server/contracts.ts) states the rule:
a bot must never be told it has a tool its driver cannot mount, because it burns turns
hunting for something that is not there.

## Implementation Units

### U1. Contract, capability flag, and registry exposure

**Goal:** a driver can declare it mounts image generation, and the harness can see it.

**Files:** `server/contracts.ts`, `server/harness/registry.ts`, `src/state/store.tsx`

**Approach:** add `imageGen?: { command: string; args: string[]; env: Record<string,string> }`
to `SendTurnInput.integrations`, and `imageGen?: boolean` to
`ProviderAdapter.capabilities` with a doc comment matching the existing `computerMcp`
rationale. Copy the boolean through `registry.describe()` alongside the other capability
flags, and mirror it on `InstanceInfo.capabilities` client-side.

**Verification:** `pnpm typecheck`. No behavior change yet.

### U2. The image proxy

**Goal:** a standalone MCP server exposing `generate_image`, returning an image block and
writing a file to the bot workspace.

**Files:** create `server/image-proxy.ts`, `server/image-proxy.test.ts`; modify
`server/proxy-paths.ts`, `scripts/bundle-server.mjs`

**Approach:** follow the house transport exactly — raw JSON-RPC 2.0 over
newline-delimited stdio, no MCP SDK, handling `initialize` / `tools/list` / `tools/call`
(`server/drivers/agents-proxy.ts` is the closest template). Read `OMB_IMAGE_BASE_URL`,
`OMB_IMAGE_API_KEY`, `OMB_IMAGE_MODEL` and the target directory from env. `tools/call`
POSTs `{ model, prompt, size, response_format: "b64_json" }`, validates the returned
bytes, writes `<workspace>/images/<timestamp>-<slug>.png`, and returns a text block
naming the path plus `{ type: "image", data, mimeType }`.

Guards, following `computer-proxy.ts` precedent: decode and verify the PNG signature and
`IEND` terminator before trusting the payload; cap inline bytes and omit the image block
(keeping the file path) when over budget; enforce a per-process call cap; never log the
key or the response body.

Register in **both** `SPAWNED_PROXIES` and the `ENTRY_POINTS` array of
`scripts/bundle-server.mjs` — omitting the second builds cleanly in dev and fails only in
the packaged app, which is the documented 0.1.24 regression class called out in
[server/proxy-paths.ts](server/proxy-paths.ts).

**Verification:** contract test spawning the proxy against a stub HTTP server, asserting
tool list, request shape, auth header, written file, image block, truncation rejection and
cap enforcement. Then `pnpm build:server && pnpm test:packaged-server`.

### U3. Credential storage and settings UI

**Goal:** the key is persisted write-only and never echoed.

**Files:** `server/config.ts`, `server/index.ts`, `src/components/ApiKeys.tsx`,
`src/components/SettingsModal.tsx`, `src/state/store.tsx`, `server/config.test.ts`

**Approach:** add `imageGen?: { apiKey?: string; baseUrl?: string; model?: string }` to
`AppConfig`, `appConfigSchema` and the `saveConfig` merge list, with an env fallback in
`loadConfig` under a dedicated name (`OMB_IMAGE_API_KEY`). Add the variable to the strip
list in `cliProbeEnvironment()` so a user-selected wrapper binary cannot inherit it.
Report `{ configured: Boolean(...), baseUrl, model }` from `configStatus()` — the key
itself is never returned, per the rule documented on `describeVoice()`
([server/tts/index.ts:33-40](server/tts/index.ts#L33-L40)). Add an `ApiKeyRow` section and
render it in Settings → Connections; extend `ConfigStatus` client-side.

**Verification:** a test asserting the key is absent from `GET /api/config` and from the
serialized `configStatus()` body, alongside the existing config tests.

### U4. Harness wiring and the per-bot toggle

**Goal:** the tool is attached only when it should be, and the bot is told about it only
when it is attached.

**Files:** `server/index.ts`, `server/store.ts`, `src/components/SettingsPanel.tsx`

**Approach:** add an `imageGenIntegration()` helper beside `phoneIntegration()`, building
`{ command: process.execPath, args: [SPAWNED_PROXIES.image], env }` with
`ELECTRON_RUN_AS_NODE: "1"`, the credential, and the resolved per-turn workspace path.
Attach it behind the same three gates Composio uses
([server/index.ts:1222-1225](server/index.ts#L1222-L1225)): per-bot toggle
(`bot.imageGen !== false`), workspace configured, and
`instance.adapter.capabilities.imageGen === true`. Add the matching system-prompt hint
under the same condition — gating must stay aligned across capability, mount and prompt.
Add `imageGen?: boolean` to `BotRecord`/`Bot` with opt-out semantics, validate it in the
`PATCH /api/bots/:id` handler, and add the toggle to `SettingsPanel` gated on
`engine?.capabilities?.imageGen === true`. Apply the same block to the room-turn path,
which currently attaches only phone and composio.

**Verification:** tests asserting no attachment when the driver lacks the capability, when
the key is unset, or when the bot toggle is `false`.

### U5. Driver mounts

**Goal:** all nine MCP-capable engines expose the tool.

**Files:** `server/drivers/codex.ts`, `server/drivers/claude.ts`,
`server/drivers/acp/core.ts`, plus their tests

**Approach:** Codex — one `mountMcpServer(appServerArgs, env, "openmausbot_image", ...)`
call. Claude — `mcpServers.image` plus `allowed.push("mcp__image")`. ACP —
one entry in `acpMcpServers()`, which covers Hermes, OpenCode Go, Qwen, Droid, Grok CLI,
Gemini and Kimi at once. Set `imageGen: true` in each adapter's `capabilities`; leave
`grok`, `antigravity` and `boxAgent` untouched so they report `false`.

**Verification:** extend the existing fake-CLI suites — assert the argv contains the
mounted server for Codex, the written `mcp.json` contains it for Claude, and the
`session/new` payload contains it for ACP.

### U6. Transcript visibility

**Goal:** the user sees the generated image in chat.

**Files:** `server/image-proxy.ts`, `server/index.ts`, `server/store.ts`,
`src/components/ChatView.tsx`, `src/components/GroupView.tsx`, `src/state/store.tsx`

**Approach:** after a successful generation the proxy POSTs
`{ botId, threadId, path, mime }` plus the base64 payload to a new authenticated
`/api/internal/images` endpoint, using the `OMB_COMMS_TOKEN` bearer pattern the agents and
connector proxies already use. The handler validates the token, verifies the bytes, and
calls `pushMessage({ role: "bot", kind: "image", png, mime })`. Add `"image"` to the
`Message.kind` union; extend `slimMessage()` so the pixels are stripped from list
responses exactly as for `"screen"`; render it in `ChatView` by reusing the existing
`ScreenFrame` component, and add the case to `GroupView`, which today handles no image
kinds at all.

**Verification:** an end-to-end test driving the fake CLI through a generate call and
asserting an `image` message lands in the thread with retrievable bytes; a rejection test
for a missing or wrong comms token.

### U7. Documentation and final verification

**Files:** `docs/image-generation.md`, `README.md` if the capability index requires it

**Approach:** document the two supported backends (hosted OpenAI-compatible endpoint, and
a local one such as LocalAI), the write-only key, the per-bot toggle, the approval
behavior and the spend cap, and state plainly that `grok`, `antigravity` and `boxAgent`
do not support the tool.

**Verification:** `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm check:electron`,
`pnpm test:packaged-server`. Grep the diff and test output for the key value; only
variable names and configured booleans may appear.

## House conventions to honor

- **Lint parity, measured not assumed.** `pnpm lint` runs `oxlint` with a custom
  `anti-slop` plugin (`no-runtime-typeof`, `no-unknown-parameters`,
  `require-safety-comment-for-type-assertion`, `no-conditional-empty-object-spread`,
  `no-known-value-widening`). The repo-wide run currently fails, so the meaningful check
  is *per-file parity*: count violations for each touched file, `git stash`, count at
  HEAD, and confirm the counts match. New files should aim for zero. In practice this
  means coercing untrusted JSON at the boundary (`String(x ?? "")`) instead of narrowing
  it with `typeof`.
- **Secrets in env, never argv.** Codex is passed only the *names* of environment
  variables so credentials never appear in process listings
  ([server/drivers/codex.ts:67-69](server/drivers/codex.ts#L67-L69)).
- **Proxies resolved only through `SPAWNED_PROXIES`**, never by relative path from a
  bundled module.
- **Fakes, not mocks.** Extend the fake CLIs and stub HTTP servers; do not mock
  `child_process`.
- **Verify protocol claims against a version.** Driver comments in this repo cite the CLI
  version they were verified against; do the same for the images API shape.

## Risks

- **Spend.** Mitigated by KTD3: no read-only annotation (so every call is approved), plus a
  per-turn cap in the proxy. Worth revisiting whether `autoApprove` bots should be allowed
  to call it at all.
- **Transcript weight.** Base64 images inflate `messages.db`. The existing slimming rule
  and out-of-band image endpoint keep list responses small; exports already strip pixels.
- **Local backend variance.** LocalAI and the ComfyUI proxy accept the OpenAI request
  shape but differ on `model` semantics and extra parameters. Keep `model` user-configured
  and pass it through unmodified rather than validating it against a fixed catalog.

## Out of scope

- Native tool-calling for `grok`, `antigravity` and `boxAgent`.
- Image *editing* / img2img, and reference-image inputs.
- Rendering images produced by any other MCP tool; U6 covers this tool's output only.
