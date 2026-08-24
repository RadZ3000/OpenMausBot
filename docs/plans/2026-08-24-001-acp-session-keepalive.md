# ACP keep-alive (intern stays in the chair)

Status: **in tree (unit green 2026-08-24).** Parent: [2026-08-22-002](2026-08-22-002-computer-use-coworker-loop-plan.md) P6; live miss: Ember Beehiiv follow-up 2026-08-23 (new `initialize` / empty `session/load` / stale last-look). Eyes stay [007](2026-08-23-007-hermes-eyes-plan.md). P8: eight `vm_*`. No `hermes update`. No `RECOMMENDED_MODEL` flip. This does **not** make 4B a coworker.

## check-upstream-first (done before coding)

Fetched `upstream/main`. Their `server/drivers/acp/core.ts` still `stop()`s inside `settle()` (`the agent process does not exit on its own`). No `server/acp-session.ts`. Latest upstream ACP core change in the gap is opencode auth, not keep-alive. Catching up 0.1.32+ is a separate merge.

We edited that one call site (do not `stop()` on successful `end_turn`) and put the pool in a name they are unlikely to collide with.

## Why this, not Hermes-only

ACP is a long-lived stdio session. The next user message is another `session/prompt` on **that pipe**. Spawn-per-turn is leak-safe and wrong for coworker follow-ups. Hermes is only the CLI whose `session/load` after a kill returns `{}` (`sessionLoadLived` in `server/drivers/acp/hermes.ts`). Grok/Cursor/Gemini/Kimi/Droid ride the same core. No `if (hermes)`. No `keepSessionAlive` support flag until a second harness is **proven** to break on a second prompt (two-or-more seam).

Claude/Codex/HTTP drivers never enter this file.

## Binding decisions

- **Session identity** is bot + thread, not thread alone. Rooms share `group.threadId` across members. Optional `sessionKey` on `SendTurnInput`. Harness sets `"${bot.id}:${threadId}"` for 1:1 and rooms. Tests that omit it key on `threadId` (today’s behaviour).
- **In-flight vs idle.** `active` stays “turn running” (`hasSession` unchanged). A second map in `AcpSessionPool` holds idle children. `if (active.has(threadId)) throw` still serializes one turn per thread.
- **Keep** after successful `end_turn`. **Kill** on user Stop / `session/cancel` timeout, rewind (`dropIdleSession`), spawn/rpc failure, child `close`, `stopAll` / `dispose`, cwd/model/MCP-name fingerprint miss, idle, cap eviction.
- **Idle: 15 minutes. Cap: 3 live children per ACP `ProviderInstance`.** LRU. Injected clock in tests; no `sleep`.
- **Fingerprint** (not secrets): `cwd`, **picker** model (`turn.model`, not `resolveTurnModel` — the harness skip-last-look check cannot see that rewrite), MCP **names** (computer/agents/composio/image/phone). If the user turns Local VM on mid-thread, miss and respawn so `session/new` can mount MCP.
- **Skip stale last-look on a hit.** If `hasIdleSession(sessionKey, fingerprint)` the harness does not append `[LAST COMPUTER OBSERVATION]`. Last-look stays the bandage when the pool misses.
- **Do not skip transcript replay on a miss.** Empty load + replay stays. On a hit, send the latest user text (plus persona/system as today via `buildPromptText`); do not wrap “previous session could not be resumed”.
- **Windows Hermes** still uses `windowsDetachedSpawn`. Idle/Stop go through `killCliTree`.
- **`forgetIf`:** a replaced child’s `close` must not delete a later occupant of the same key.

## Files

| File | Why |
|---|---|
| **New** [`server/acp-session.ts`](../../server/acp-session.ts) + test | Pool, idle, cap, fingerprint, kill. Fork-owned. |
| [`server/drivers/acp/core.ts`](../../server/drivers/acp/core.ts) | `settle` must not `stop()` on success; `sendTurn` reuses a live child; still spawn on miss. |
| [`server/contracts.ts`](../../server/contracts.ts) | Optional `sessionKey`; optional `hasIdleSession` / `dropIdleSession` on the adapter (Claude/Codex omit them). |
| [`server/index.ts`](../../server/index.ts) | Pass `sessionKey`; skip last-look when idle session exists; drop idle on rewind. Room `sendTurn` too. |
| [`server/testing/fake-acp-cli.ts`](../../server/testing/fake-acp-cli.ts) | Stays alive after `session/prompt` (already did if not killed). RPC dump is the prompt count. |
| [`server/drivers/acp/acp.test.ts`](../../server/drivers/acp/acp.test.ts) | Two `sendTurn` → one spawn; room isolation; rewind; fail; cap 3; idle via fake clock. |
| This file | Plan + tee record. Catalog + overwrite [`docs/agent-status.md`](../agent-status.md). Light link from 002 P6. |

Not in the diff: extra `vm_*`, Beehiiv recipes, first-run model flip, `attachments.ts`, P6 mixed with Granite wrappers, merging bot brains, one process for all bots.

## Tests (the feedback loop)

1. **Reuse:** two turns, same `sessionKey` → RPC dump `initialize` once, `session/new` once, `session/prompt` twice. `hasSession` false between turns.
2. **Room isolation:** same `threadId`, two `sessionKey`s → two children.
3. **Rewind / fingerprint miss / failed turn:** next turn spawns.
4. **Cap:** fourth session evicts the oldest idle child (`killCliTree`).
5. **Idle:** advance clock 15m → child killed; next turn spawns.
6. Existing load-miss / resume-wrap tests stay green.

Verified 2026-08-24: `pnpm exec vitest run server/acp-session.test.ts server/drivers/acp/acp.test.ts` — 68 passed. `pnpm typecheck` green.

## Live gold

Instruct + Local VM, **new thread**. Message 1: open a URL (or Beehiiv if already logged in). Message 2: a follow-up that needs the same screen. Native tee: **one** `initialize` for both messages; second frame is `session/prompt` only; no `session/load` miss wrap. Do not score whether 4B clicks Publish.

Do not commit `~/.openmausbot`.

### Recorded 2026-08-24

Harness restarted onto this tree (`pnpm dev:server`, Instruct default). Shared Local VM container **started** but `desktopReady` was false (Cua Chromium `SharedImageManager::ProduceMemory` mailbox errors), so the URL/Beehiiv pair could not mount computer tools. That false boot failure is classified in [2026-08-24-002](2026-08-24-002-local-vm-chromium-status.md).

Protocol gold on a **new** Hermes Instruct thread with `computer: off` (bot `KeepAliveRpc`, thread `9ceeb692-91a7-42ce-8df5-912238689de6`):

| RPC | Count |
|---|---|
| `initialize` | **1** |
| `session/new` | **1** |
| `session/load` | 0 |
| `session/set_model` | 1 (first turn only) |
| `session/prompt` | **2** |

Two user messages (`alpha` / `beta`). Second frame was `session/prompt` only. Pass bar met. A healthy-desktop URL follow-up is the same RPC pattern plus MCP already mounted; do not score 4B clicks.

## Out of scope

Hermes-only flag, fixing 4B click quality, 32k KV, upstream 0.1.32 merge, `ask_bot` / rooms as a substitute for keep-alive, unified agent process for the whole fleet.
