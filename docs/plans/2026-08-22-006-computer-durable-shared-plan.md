# Durable shared computer

Status: **in tree.** Parent:
[`2026-08-22-002-computer-use-coworker-loop-plan.md`](2026-08-22-002-computer-use-coworker-loop-plan.md).
Written 2026-08-22.

Grok Bot: one persistent Linux VM per user; leftover apps expected; cookies
and files are shared; each bot has a screen, not a security boundary. Our
default is one XFCE desktop (`LocalVmLease` is a mutex, not screens).
Per-bot mode is the isolation product. Do not invent per-bot screens on one
VM in this change.

## check-upstream-first

Fetched `upstream/main` 2026-08-22. This branch is **33 ahead, 0 behind**.
No `shared/local-vm-lifecycle.ts`. Box owns `computer-proxy.ts` (untouched).
Layer 7 already migrates Chromium into
`/home/cua/workspace/.browser-profiles` (`prepare-openmausbot-workspace.sh`).
The gap was policy: `POST /start` always 409’d and idle **removed** the
container, so leftover apps and a Start button could not exist.

## Behaviour

- A stopped VM whose image, labels, network, hardening, and workspace mount
  still match **starts** (`docker`/`podman start`). Drifted image or an
  unsafe contract still 409s with recreate.
- Idle after 8 hours **stops** the container. Workspace bind and
  `.browser-profiles` survive. GUI windows do **not** (live 2026-08-22:
  Chromium pid 509 died on `podman stop`/`start`; Start was not 409).
  Recreate remains last resort (layer bump, public viewer, missing
  workspace). Leftover apps survive harness quit while the container stays
  running.
- Restart policy stays `"no"`: host reboot and idle stop must not
  surprise-start the desktop.
- Prompt and Settings/Computer panel name
  `/home/cua/workspace/.browser-profiles`, leftover Chromium as expected on
  shared mode, and Per bot as isolation. Image layer stays **7** (no
  Dockerfile bump).
- B-06 (Start always 409, layer note stuck on v4) is gone from
  `docs/known-bugs.md`.

Out of scope: closing leftover tabs in the harness, isolated-profile Cua
launch (SIGTRAP), Grok lid-closed always-on cloud (Box/VPS), per-bot
screens on one VM.

## Verify

```sh
pnpm typecheck
pnpm vitest run server/container-computer.test.ts server/local-vm-lifecycle.test.ts
pnpm test
```

Live: stop a healthy layer-7 VM, Start, leftover Chromium still there,
`.browser-profiles` still on the host bind. Overlay `index.js` (idle +
start live in the harness) **and** `resources/ui` (Start vs Recreate).
Full quit/relaunch.
