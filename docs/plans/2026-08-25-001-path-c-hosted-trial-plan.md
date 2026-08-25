# Path C — hosted models, capability then credits

Status: **decided; in tree** (capability-then-credits router, hosted instance,
chooser). Parent:
[003](2026-08-20-003-product-foundation-plan.md) Phase 1 Path C, and
[005](2026-08-20-005-three-path-first-run-plan.md) Phase 1c. The 2026-08-25
morning draft called this a hard-capped trial that dies into Path B. That
is **abandoned**. Path C stays on. Capability picks the SKU; frontier credits
are a ceiling, not the picker. When credits run out, hard turns stay on the
basic model. Monthly top-ups restore frontier. Rate limits bound heavy users.
Nothing about this path is "the app stops answering."

## check-upstream-first

Merged `upstream/main` through `dae7631` (0.1.33). **0 behind.**

| Looked for | Result |
|---|---|
| Inference / trial LLM proxy under `cloudflare/` | **Absent.** `composio-broker` (Composio MCP) and `control-plane` (email + companion tunnels) only |
| HTTP drivers that can consume an OpenAI-compatible proxy | **Present:** `openai-compat`, `grok`, `minimax` |
| Polar in this repo | **Upstream donate badge** to `polar.sh/supamaus`. Not ours. Do not take payments there |

Do not reuse `control-plane/` (email OTP breaks "no account") or
`composio-broker/` (wrong secret, wrong D1). Ours:
`cloudflare/inference-broker/`, `server/hosted-inference.ts`,
`electron/managed-inference.mjs`.

## Product

All three first-run paths should feel **unlimited**, with rate limits for
abuse rather than a brick wall.

| Path | Spend | Limit |
|---|---|---|
| A local | Customer's machine | Hardware |
| B BYOK | Customer's key | Their provider |
| C hosted | **Our** key, behind a Worker | Capability routing; frontier **credits** as a ceiling. Rate limit both. Buy more frontier credits per month |

Path C is still "no account, no pasted key" at first run. It is not a demo
that expires. The Worker is the per-request router because the desktop cannot
be trusted with billing or with our provider key. Do not classify in Electron
or honour a client "this is hard" flag.

```
Desktop
  instance hostedInference, driver openai-compat
  url    = our Worker
  bearer = per-install token (credentials.bin → child env)
        │
        ▼
Inference Worker
  1. Bearer → SHA-256 → D1
  2. Rate limit (heavy users wait, they do not get cut off)
  3. Lazy-reset the monthly included allotment
  4. Capability first, credits as a ceiling:
       want  = assessCapability(messages)   // obvious basic / obvious frontier
               or a nano classify in the middle band (fail closed to frontier)
               skipped when frontier credits are already 0 (ceiling forces basic)
       allow = frontier credits remaining > 0
       tier  = want === frontier && allow ? FRONTIER : BASIC
       reason = credits | capability | frontier
  5. Client cannot pick the SKU. Requested `model` is ignored.
  6. Inject OUR key, proxy SSE, debit frontier usage only
        │
        ▼
One OpenAI-compatible upstream (OpenRouter first; failover later)
```

Obvious chitchat and short "ok"/"thanks" skip classify (`want = basic`).
Fenced code, long user text, or verbs like implement/refactor/debug/fix skip
classify (`want = frontier`). Only the middle band pays for a nano SKU
(`CLASSIFY_UPSTREAM_MODEL`, default `meta-llama/llama-3.2-3b-instruct`,
~400–800 input tokens, ~2 output tokens). If frontier credits are already
gone, classify is skipped too — the ceiling already forces basic. A
classifier outage must **not** silently dump coding work on the basic model.

`GET /v1/me` reports `frontierAllowed` / `frontierCreditsRemaining` — the
credit ceiling. It has no prompt, so it must not claim the next turn's tier.
Each completion returns `x-openmausbot-tier` and `x-openmausbot-route` for
the desktop to grow into later.

Purchased credits add to `purchased_remaining` and survive the monthly
included reset. Polar checkout is **later, on our org**, not upstream's
sponsor link. Until then `POST /v1/credits` with `CREDIT_GRANT_SECRET`
is the test/admin grant.

## In the tree

- Pure router in `cloudflare/inference-broker/src/route.ts` (`assessCapability`,
  `selectTier(ledger, want)`, debit, period reset) plus a Worker that
  authenticates, optionally classifies, rate-limits, rewrites, and proxies
  `/v1/chat/completions`. Completions set `x-openmausbot-tier` and
  `x-openmausbot-route`. `GET /v1/me` reports the credit ceiling only.
- `server/hosted-inference.ts` enables a **distinct** `hostedInference`
  instance so a later OpenRouter BYOK row cannot inherit our URL.
- Electron registration in `electron/managed-inference.mjs`, **no packaged
  fallback URL** (fail closed). Token stripped from CLI child env via
  `WORKSPACE_CREDENTIAL_ENV`.
- Chooser hosted arm live (not "Coming soon"). Copy: hard tasks use a stronger
  model while frontier credits last; easy tasks stay cheap; exhausting credits
  keeps chat on the lighter model.

Chat-only on this arm until a later decision: HTTP `openai-compat` has no
computer/tools. Copy must not imply a VM on our dime.

## Ownership (keep it this shape)

Weight is in files upstream does not have. Registration is one-line-class
calls at seams they own — same pattern as Composio and Path B. Do not invent
a plugin map for one hosted arm.

| Ours | Theirs (registration only) |
|---|---|
| `cloudflare/inference-broker/` | `server/index.ts` — import, parent-port, GET/POST `/api/engines/hosted-inference` |
| `server/hosted-inference.ts` | `electron/main.mjs` — child env, parent-port sync, IPC, packaged ensure |
| `electron/managed-inference.mjs` | `electron/preload.cjs`, `src/types/ogb.d.ts` |
| `src/components/InstallPathChooser.tsx` (copy) | `server/config.ts` `WORKSPACE_CREDENTIAL_ENV`, `electron/diagnostics.mjs` |
| | `package.json` scripts; `src/App.tsx` chooser mount (two lines, all three paths) |

Do not classify in Electron. Do not honour a client "this is hard" flag.

## Explicitly later

- Polar (our org) monthly credit packs and a webhook into `/v1/credits`.
- Tool-calling / Hermes / Local VM on hosted.
- A second upstream behind Cloudflare AI Gateway.
- Chat UI badge for `capability` vs `credits`.
- Raising `FRONTIER_UPSTREAM_MODEL` off `gpt-4o-mini` to a true frontier SKU
  (config change, not a redesign).
- A classifier-plugin interface (one implementation; a second would earn a seam).
- OpenRouter `auto` as the capability picker (we would lose the catalog and
  the reason code).
- Desktop middleware that picks providers. The Worker already does that.

## Open (numbers, not shape)

- Included frontier tokens per 30-day period (code default is a starting
  guess; tune without a schema change).
- Which upstream ids are FRONTIER vs BASIC vs CLASSIFY (Worker vars).
