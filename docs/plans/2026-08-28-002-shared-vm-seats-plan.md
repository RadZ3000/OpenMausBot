# Shared Local VM: one Chrome, two piles

Status: **decided 2026-08-28.** Product is **one Chromium, many windows,
each bot drives its pile, the app shows a crop.** Not two Chromes. Not a
second VNC. Phase 0 probe (below) killed the two-process / two-X chair;
the user then picked this shape. Parent:
[`2026-08-22-002-computer-use-coworker-loop-plan.md`](2026-08-22-002-computer-use-coworker-loop-plan.md).
House (disk, cookies, leftover apps):
[`2026-08-22-006-computer-durable-shared-plan.md`](2026-08-22-006-computer-durable-shared-plan.md).

Do not mutate the Admin Local VM while the user has a live Computer
session. Ask first.

## What we want (binding)

There is **one Chrome**, already logged in (the diary). Each bot gets
**its own windows**, not its own Chrome. Underneath it is still **one**
Linux desktop. In the app we show bot A only A’s windows (a crop), bot B
only B’s. It *looks* like two desks.

We will **not** run two Chromes with the same login. There is no Chrome
flag for that; two processes on one profile corrupt cookies.

Grok’s docs match this contract (shared browser, per-Bot screen as a
work surface). We did not install Grok Bot; we are not cloning their
guest. Isolation **Per bot** stays the other product (separate
containers, separate cookies).

Shared without piles stays today’s mutex (one turn, whole VM). Piles are
a property of **Shared**, not a third isolation mode.

**User-visible today (must go away for two bots):** Isolation Shared,
bot B mid-turn, bot A sends a message → red Retry card
`this Local VM is already being used by another turn — wait for that turn to finish`
([B-29](../known-bugs.md)). After P1, two different bots overlap. Same
bot, second thread still gets that card.

## What the guest already does (Phase 0)

Pinned **cua-driver 0.20.0**, `driver-0.20.0-v7`. One `DISPLAY=:1`, one
socket, one VNC. One Chromium pid, two windows. Two Cua `start_session`
labels, overlapping `click` (`delivery_mode=background`), both `rc=0` in
3.16 s, windows not raised. Cua `get_desktop_state` is always the full
1280×900 `primary` — so **our UI crops**; we do not wait for Cua to grow
`display_id`. RandR split is optional later (park piles left/right), not
required for v1.

Full tee and what the live session skewed: [Phase 0 record](#phase-0-record).

## How we get there

No image bump. No second `cua-driver serve`. No second TigerVNC. Work is
harness + Computer panel. Path A still watches `vm_*` ([007](2026-08-22-007-computer-routing-fleet-plan.md));
parallel piles are for engines that may already drive the VM (Claude /
Codex / grokAgent). P8: no extra `vm_*` names. Do not edit
`computer-proxy.ts`.

**P1 — two turns on one VM (closes [B-29](../known-bugs.md)).** Lease per
pile (reuse `LocalVmLeasePool` keys, e.g. `${vmKey}:pile:${botId}`), not
one mutex for the whole container. Two MCP clients to the **existing**
socket. `claimDesktop` wipes looks for **that pile**, not every bot.
Clicks must use `window_id` / CDP / `delivery_mode=background`.
Desktop-wide coordinate clicks that move the XFCE pointer stay out of
parallel mode. Tests: two claims on different piles succeed; two claims
on one pile still throw the current “another turn” error. No
`child_process` mocks. Do not delete the `LocalVmLease.claim` throw.

**P2 — whose window is whose.** Sticky `botId → window_id[]` (and CDP
tab binds) while the container is up. Windows the bot opens join its
pile. Tools that target another pile’s id are refused. Prompt: one
shared Chrome; leftover apps on *your* windows stay; do not drive
another bot’s windows; cookies/files are house-wide. Cap concurrent
piles (2, max 4). More bots than piles: wait (same altitude as today’s
“another turn”).

**P3 — the crop.** Computer panel (and last-look) for a bot shows that
pile: union of its window bounds on the full screenshot, or
`get_window_state` / `zoom` of those windows — not a second noVNC port.
Raw full-desk noVNC may remain as “see the whole XFCE.” Do not reuse
upstream 0.1.38 two-up copy (that is two Per-bot VMs). iOS Local VM
preview stays later.

**P4 — live tee** (only when the user says the VM is free). Two frontier
bots, two URLs, overlapping turns, one Chromium pid, both succeed, each
preview is the other’s crop. Then default concurrent piles may go from
opt-in 1 to 2.

**Later, not v1:** `set_window_frame` / RandR halves so piles sit
left/right on the raw VNC. Replacing TigerVNC to unlock MPX.

First ship: **opt-in** concurrent piles (default 1) until P4.

## check-upstream-first

Fetched `upstream/main` 2026-08-28. License **green** (Apache-2.0) on
`677538e`. This branch still through `ec7b487` (0.1.37). Per-bot VMs and
**two-up** (watch two Per-bot desktops, one pane interactive) are not
this. No upstream “window pile + crop.” Build in fork files; register at
existing lease / panel seams.

## Out of scope

- Two Chromium processes, one `--user-data-dir`.
- Second `DISPLAY` / second VNC as the product.
- Clone `.browser-profiles` into Per-bot `vm-homes/` and call it Shared.
- Third isolation enum.
- Host Windows / host Cua / Wayland #345.
- Box/VPS (already per-bot computers).
- Lid-closed cloud; Grok phone.
- Extra Path A `vm_*` (P8).
- `computer-proxy.ts`.
- A 10-bot roster of piles (cap 4).

## Verify

```sh
pnpm typecheck
pnpm vitest run server/local-vm-lease.test.ts server/computer-thread-state.test.ts
pnpm test
pnpm lint
```

P1–P3: unit tests as above. P4: live two-bot tee on a **free** VM.

## Do not

- Implement two Chromes or a second TigerVNC for this product.
- Drop the VM mutex without P1 pile leases behind it.
- Crop by trusting Cua `display_id` (only `primary` in 0.20.0).
- Call two-up workspace “piles” after merging 0.1.38.
- Bump `IMAGE_LAYER_VERSION` for piles.
- Mutate the Admin Local VM while the user has a live Computer session.

## Phase 0 record

Probe 2026-08-28, Admin, `driver-0.20.0-v7`. Original four-bar **Grok
chair** (second framebuffer + one diary + two mice) **failed**. That
bar is retired for this plan; the crop in P3 replaces old bar 4.

| Original bar | One X (`:1`) | Two X (`:2`) |
|---|---|---|
| Overlapping clicks | Two sessions, both `rc=0` in 3.164 s; z_index unchanged. OS cursor moved (live VNC). MPX `parallel_mouse_drag` **unsupported on Xtigervnc**. | Not dual-clicked. Dual `startxfce4` failed (stock `xstartup.sh`). |
| One Chromium identity | **Pass.** pid 502, two windows. | Second `chromium` on `:2`: `Opening in existing browser session.` |
| 4 GB / 2048 pids | Pass. | ~3.12 GiB / 51 pids with `:2` + second `serve`. |
| Isolated Cua screenshot | **Fail** as Cua API: still 1280×900 `primary` after `xrandr --setmonitor`. | Different PNGs (`:1` vs empty `xfwm4` `:2`) — wrong product. |

Live session during the probe: clicks hit leftover Chromium, RandR
split, `:2` came and went. Restored: monitors unsplit, `:2` killed,
sessions ended. Do not redo the whole probe. Optional idle check
(Chrome on `:2` with no existing Chrome) does not change P1–P3.

Cua 0.20.0 already has per-session overlay cursors, background click,
`session` labels, browser binds scoped to the lifecycle session. Use
those; do not invent a second daemon.
