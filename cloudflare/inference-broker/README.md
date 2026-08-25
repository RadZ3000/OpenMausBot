# OpenMausBot hosted inference broker

Path C: the desktop never holds our provider key. Each install gets a random
bearer stored only as a SHA-256 hash in D1. Every `/v1/chat/completions` is
authenticated, rate-limited, and **routed**: capability first (hard tasks want
frontier, easy tasks stay on a cheap model), then credits as a ceiling. When
frontier credits run out, chat keeps answering on the basic model. Extra
frontier credits are `purchased_remaining` (Polar, our org, later).

Obvious turns skip the nano classify call. The middle band asks
`CLASSIFY_UPSTREAM_MODEL` (default `meta-llama/llama-3.2-3b-instruct`, ~4
tokens out); a classifier error fails **closed to frontier**, never dumps a
possible hard task onto the cheap SKU. Classify is also skipped when frontier
credits are already gone — the ceiling forces basic either way. Classify
usage is not debited from frontier credits. `GET /v1/me` reports the credit
ceiling only — it has no prompt, so it cannot claim the next turn's tier.
Completions return `x-openmausbot-tier` and `x-openmausbot-route`.

This is not upstream's Composio broker and not the companion control plane.
Create your own D1 database and rate-limit namespaces, replace the placeholder
`database_id` in `wrangler.jsonc`, and put `UPSTREAM_API_KEY` in Worker secrets.
Set `OMB_INFERENCE_BROKER_URL` on packaged builds. There is **no** default URL
— a build without it keeps the hosted arm unavailable.

```sh
pnpm inference:test
pnpm inference:deploy
```

`REGISTRATION_MODE=closed` stops new installs without touching existing ones.
`CREDIT_GRANT_SECRET` (optional secret) authorizes `POST /v1/credits` via the
`x-credit-grant` header until Polar webhooks exist.

See `docs/plans/2026-08-25-001-path-c-hosted-trial-plan.md`.
