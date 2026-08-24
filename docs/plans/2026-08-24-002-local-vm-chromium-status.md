# Local VM: Chromium stderr is not a desktop boot failure

Status: **in tree (unit + typecheck 2026-08-24).** Parent: [2026-08-22-002](2026-08-22-002-computer-use-coworker-loop-plan.md) honesty of the sandbox; live miss: Pixel Computer panel + chat Retry while RedCafe was on the thumbnail. Release-channel recording is [004](2026-08-20-004-release-channel-plan.md), not this file. P8: eight `vm_*`. No `RECOMMENDED_MODEL` flip.

## check-upstream-first (done before coding)

Fetched `upstream/main`. Their `container-computer.ts` / `vps-computer.ts` still tail `/var/log/supervisor/cua-driver.error.log` and prefix it with “desktop failed to start”. No `server/cua-desktop-status.ts`. No commits in the gap on `container-computer.ts` or `ComputerPanel.tsx`. Catching up 0.1.32+ is a separate merge. We did not take theirs.

## Why this

Cua Driver’s supervisor stderr is also Chromium’s. Two lines showed up as “The Local VM desktop failed to start” while XFCE/VNC was up:

- `pthread_create: Resource temporarily unavailable (11)` — Linux pids cgroup; Chromium + XFCE exceeded **512**.
- `GLib-GObject: g_value_type_compatible` / `browser_main_loop.cc` — Chromium GTK. The page then crashed, so this was a real browser warning, not a false alarm.

`status.ready` is `problem === null`, and `problem` used whatever the last four log lines were. Chat `startTurn` throws that string (Retry card). The thumbnail is live VNC, a different path.

## Binding decisions

- **Classify, do not dump.** Fork-owned [`server/cua-desktop-status.ts`](../../server/cua-desktop-status.ts). Boot (X display timeout, health `failed`, incomplete screenshot) still fails `ready` with “desktop failed to start”. Chromium process-cap / GLib / GPU mailbox becomes `desktop_warning` (“the page may crash”) and does **not** fail `ready`.
- **Do not paste the log.** One sentence. GLib must not overwrite a real health-report failure.
- **Pid cap 2048 on new runs.** Inspect still accepts 512–2048 so an existing 512 VM is not branded unsafe. Recreate to pick up 2048. Run flag, not `IMAGE_LAYER_VERSION`.
- **Panel:** Computer sidebar shows the warning in amber while phase is `vm`. Chat Retry stays off while Cua health is ok.

## Files

| File | Why |
|---|---|
| **New** [`server/cua-desktop-status.ts`](../../server/cua-desktop-status.ts) + test | Kind + copy. Two callers (Local VM, VPS). |
| [`server/container-computer.ts`](../../server/container-computer.ts) | Probe stages; `PIDS_LIMIT` 2048; `pidsLimitIsHardened`. |
| [`server/vps-computer.ts`](../../server/vps-computer.ts) | Same classifier; import `PIDS_LIMIT`. |
| [`src/components/ComputerPanel.tsx`](../../src/components/ComputerPanel.tsx) | Show `desktop_warning` on a ready VM. |
| [`src/components/LocalComputerSection.tsx`](../../src/components/LocalComputerSection.tsx) | Warning + 2048 copy. |
| This file | Plan. Catalog + overwrite [`docs/agent-status.md`](../agent-status.md). |

Not in the diff: image layer bump, Granite `vm_*`, first-run model flip, retargeting `electron-builder.yml` `publish:`.

## Tests

Verified 2026-08-24: `pnpm exec vitest run server/cua-desktop-status.test.ts server/container-computer.test.ts server/vps-computer.test.ts` — 66 passed. `pnpm typecheck` green. X display still “desktop failed to start”. GLib + healthy driver → `ready`, warning, no log dump.

## Live gold

Harness on this tree. Recreate the shared Local VM (pid cap is a run flag). Computer panel: thumbnail can be live; GLib/pthread must not be a red “desktop failed to start” or a chat Retry while Cua health is ok. A later Chromium tab crash is allowed; the warning said the page may crash. Recreate is required for 2048; a harness restart alone leaves a 512 container.

### Recorded 2026-08-24

`pnpm dev:server` restarted onto this tree (Instruct default). Shared container `openmausbot-computer` removed and run again. First status after `run` was a brief Cua-not-up-yet (`cua-driver status` failed) — not a GLib dump. Three seconds later: `ready` true, `desktopReady` true, `desktop_warning` null, setup command `--pids-limit 2048`. Durable workspace kept.

Do not commit `~/.openmausbot` or VNC passwords.

## Out of scope

Upstream 0.1.32 merge, Windows release channel (004), scoring 4B clicks, GPU inside the sandbox.
