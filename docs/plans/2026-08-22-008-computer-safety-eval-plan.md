# Safety, eval, and stop-lines

Status: **in tree.** Parent:
[`2026-08-22-002-computer-use-coworker-loop-plan.md`](2026-08-22-002-computer-use-coworker-loop-plan.md).
Written 2026-08-22 after the routing live probe.

## check-upstream-first

Fetched `upstream/main` 2026-08-22. This branch is **33 ahead, 0 behind**.
No `docs/plans/2026-08-22-008-computer-safety-eval-plan.md`. Last-look
lives in fork-owned `server/computer-thread-state.ts`. Do not edit
`computer-proxy.ts` or `acp/core.ts` for this slice. B-24 stays
`docs/known-bugs.md`; this family does not fix it.

## P8 — Granite wrappers stop

Live Path A (thread `98f767f9-ad0f-4c90-93a4-fb9ed2a72938`, overlay +
quit + relaunch): `vm_open` `tool_call_update` named Example Domain and
did not claim a verified URL. Granite **did** call `vm_open` (not a
how-to with zero tools). A follow-up that asked only for the last look
replayed the stanza and did not click. Earlier the same day a huge AX
tree produced a how-to instead of `vm_click`.

**Decision:** the allowlist stays eight `vm_*` names (`LOCAL_COMPUTER_TOOL_NAMES`).
Do not add more Granite-specific computer tools. Honesty + last-look still
change so Path A Hermes can run observe → act (chrome-skip, do not claim
`opened` on a chrome-only look). A bigger local model or frontier still
helps on long unsupervised tasks; that is not a license for the harness
to hide page controls or lie that a URL landed.

## Untrusted last-look

AX trees and titles are attacker-controlled. `formatComputerObservation`
already labeled the stanza untrusted. This slice also **neutralizes**
`[LAST COMPUTER OBSERVATION]` / `[/LAST COMPUTER OBSERVATION]` inside
title and excerpt so a page cannot close the fence and inject
instructions.

Who-is-driving on the VM still goes through `mcp-bridge` while the
person holds. `control-client.ts` **fails open** (a harness hiccup must
not brick every click). That is cooperation, not a hostile-agent
boundary — do not claim Box parity.

## Gold-turn matrix (score the tee, not chat)

| Turn | Pass |
|---|---|
| Sensors | Native `tool_call_update` has the seen title; unverified navigation is explicit |
| Same-turn look | Second `vm_*` can use in-process binds |
| Cross-turn P3 | Next `session/prompt` has the fenced stanza; no `vm_*` in the stanza; take-wheel / wipeVm drops it |
| Host idle | Windows Path A never mounts host Cua |
| Two-window leftover | Beehiiv + Example Domain: report the front window, do not claim the requested URL |
| Path A vs frontier | Path A text AX, no JPEG; frontier wrap is `observe-computer-mcp` |
| Auto | local-inject + Local VM cannot Auto-approve `vm_*` |
| P8 | Catalog stays eight `vm_*`; no new Granite wrappers |

Scored **2026-08-22** against thread `98f767f9-…`: sensors, P3, Path A
text, leftover honesty, Auto PATCH 400, B-06 container survived quit.
Claude-on-VM JPEG A/B still **unknown**.

## Hermes computer patches (must not regress)

`server/drivers/acp/hermes.ts` `transformEnv` / `applyTurnEnv`:

- `ensureHermesComputerDisablesWeb`
- `ensureHermesAcpMcpWait`
- `ensureHermesAcpMcpRebind`
- `ensureHermesComputerToolsEager`
- `ensureHermesBridgeNoCall`
- `ensureHermesBridgeUnwrap`
- `ensureHermesComputerShortNames`
- `ensureHermesLocalCatalog`
- `applyLocalHermesAcpToolsets`

Do not restore native `web`/`extract` on Path A. Do not mix Hermes
keep-alive (`acp/core.ts`) with this family.

## Out of scope

- B-24(a)/(b) (zero tools / Git Bash hang)
- P2 URL from Cua, P5 image layer 8, P6 ACP keep-alive
- Host Cua `ComputerControl` parity, VPS viewer, iOS (routing later)

## Verify

```sh
pnpm vitest run server/computer-thread-state.test.ts server/computer-coworker-loop.test.ts server/compact-computer-tools.test.ts server/turn-context.test.ts
```
