# Routing other computers

Status: **in tree (first slice).** Parent:
[`2026-08-22-002-computer-use-coworker-loop-plan.md`](2026-08-22-002-computer-use-coworker-loop-plan.md).
Written 2026-08-22 after the coworker-loop live probe.

## check-upstream-first

Fetched `upstream/main` 2026-08-22. This branch is **33 ahead, 0 behind**.
No `server/computer-routing.ts`. `computer-proxy.ts` stays Box-only.
`local-routing.ts` already refuses Windows host Cua and Linux Auto host
fallback. The gap is product: Auto-approve still waving through Path A
`vm_*`, HTTP `grok` looking like Grok Bot, Granite marketed as unsupervised
hands, Qwen `computer_use__*` on Windows (B-19).

## Behaviour (this slice)

- Path A `vm_*` never auto-approves (Auto mode and always-allow). Watch
  and approve, or pick Claude / grokAgent.
- PATCH refuses Auto-approve + local-inject + Local VM / VPS.
- Copy: Local VM is the sandbox; coworker hands are Claude / Codex /
  grokAgent. HTTP Grok has no computer tools. Granite: you watch.
- Host Cua who-is-driving, VPS viewer, iOS take-wheel stay later.

## Out of scope

- Cowork host-desktop on Windows Path A.
- Restoring Hermes web/extract on Path A.
- Per-bot screens on one VM.

## Verify

```sh
pnpm vitest run server/computer-coworker-loop.test.ts server/computer-routing.test.ts server/auto-approve.test.ts src/lib/computer-routing.test.ts
```
