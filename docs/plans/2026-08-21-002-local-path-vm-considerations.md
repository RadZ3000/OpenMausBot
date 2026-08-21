# Local-path Local VM: considerations, not a spec

Status: **decided, first cut in tree.** Written 2026-08-21 as research; the two product
lines were settled the same day: Path A **offers computer control out of the box**,
and **chat still works if the VM step fails**. Code: `server/podman-setup.ts`,
`GET`/`POST /api/local-model/{vm,wsl}`, and a fourth row on
`src/components/LocalModelArm.tsx`. This file keeps the measurements.

The standing register is [`docs/local-model-path.md`](../local-model-path.md).
Defects stay in [`docs/known-bugs.md`](../known-bugs.md).

## check-upstream-first

Required because a plan in `docs/plans/` is exactly when the skill applies.
**Re-fetch `upstream/main` before every implementation pass on this arm**, not
only when the plan was written — they ship into `container-computer.ts`,
Settings Local VM, and onboarding while we work.

- Fetched `upstream/main` 2026-08-21 (morning and again before this pass);
  this branch was **0 commits behind** both times.
- Upstream **already has** the Local VM: `server/local-computer.ts`,
  `server/container-computer.ts`, `src/components/LocalComputerSection.tsx`,
  `src/lib/local-computer.ts`, Settings → Local VM, and
  `GET`/`POST /api/local-computer/{pull,run,start,stop,remove}`.
- Upstream **does not have** an install-path chooser or a first-run arm. Putting
  a VM wizard inside `Onboarding.tsx` or `LocalComputerSection.tsx` would be
  another merge we hand-resolve forever.

**If this is built at all:** call the existing HTTP surface from
`src/components/LocalModelArm.tsx` (ours). Do not fork their Settings cards, and
do not create a second image-pull implementation.

## What we actually mean by "Local VM"

Two different computer-use stacks have already been easy to conflate:

| Stack | What it is | First-run status today |
|---|---|---|
| Hermes computer-use | Their CUA / scheduled-task / host-desktop tools | **Skipped** on purpose (`-SkipComputerUse` in `server/hermes-install.ts`) |
| OpenMausBot Local VM | A Cua Linux desktop in Podman/Docker, durable workspace, loopback VNC | Settings only; not on the local arm |

"Include local VM installation in run a model on this computer" refers to the
**second** stack. Turning Hermes' own CUA back on is a separate question and is
not implied by this note.

On Windows the VM stack is, in order:

1. A container runtime on PATH (Podman preferred; Docker accepted) —
   `setupCommands()` already suggests `winget install -e --id Podman.CLI`.
2. The runtime's machine actually running (`podman machine start`, etc.).
3. `POST /api/local-computer/pull` — prepare the pinned Cua derivative.
4. `POST /api/local-computer/run` (shared mode) — create and start the container.

Settings already does (3) and (4) in-app. (1) and (2) are still "install a
runtime," the same honesty as Get Ollama. Image pull is a **blocking POST** with
~5 s status polling and no byte progress (`server/index.ts`); that limitation is
known from plan 005 and would be inherited, not invented.

## Why this is not already "just do it"

Plan 003/005's current position: this arm downloads a small Apache-2.0 weight
and should **say** it is weak at long multi-step tool work, and should **not**
offer computer control. That was about product honesty, not missing code.

Including the VM in first-run would mean one of:

- the sandbox exists even if Granite rarely drives it well, or
- we are reversing the "no computer control on Path A" line.

Neither has been chosen. A 3B model issuing correct tool calls against Ollama
(the 2026-08-21 probes) is **not** the same as that model operating a Linux
desktop through MCP for a twenty-step task. Measure the latter before promising
it.

## Working hypotheses — to confirm or drop

Treat these as questions with a preferred guess, not as requirements.

1. **Placement.** A fourth checklist row on `LocalModelArm` after Ollama /
   Granite / Hermes, talking to `/api/local-computer`, is the cheapest shape
   that keeps the chooser additive. Isolation policy (shared vs per-bot) stays
   in Settings.
2. **Continue vs required.** Chat can work without a VM. Making the VM a hard
   gate may strand people who only wanted a local model. Making it optional may
   hide it forever. Needs a real first-run walk, not a preference.
3. **RAM.** Granite at long context plus a VM capped at 4 GB / 2 CPUs may not
   fit a nominal 16 GB laptop that `machine.ts` currently calls `comfortable`.
   The `tight` tier might skip or warn. **Unknown until measured** with both
   resident.
4. **Podman.** Do not depend on Docker Desktop, and do not send a layperson to
   install it. A one-time UAC is acceptable if WSL is missing (`wsl --install`).
   The CLI itself installs per-user with no admin. Fetch the checksum-pinned MSI
   and `msiexec` with argv (`MSIINSTALLPERUSER=1 MACHINE_PROVIDER=wsl`) rather
   than a "Get Podman" clipboard command. Then `machine init --memory 6144`
   (WSL rejects `machine set --memory` after create) and `machine start`. See the
   Podman probe below.
5. **Bot default.** If the VM is ready, pointing the starter bot at
   `computer: "vm"` (Computer panel's Local VM destination, not host `local`
   CUA) would stop dumping people into Settings. Only makes sense if the engine
   actually exposes `localComputerMcp` / `computerMcp` on that bot.
6. **Order.** VM-before-chat vs chat-before-VM. A failed 2 GB image pull should
   not block "hello." That is a guess.

## What to measure before writing code

On a machine that has just done a scratch install of the Hermes/Granite arm
(the 0.1.27 NSIS with in-app Hermes), not on a developer overlay:

- Free RAM before and after Granite is loaded, then after `podman machine start`
  and after the Cua container is `running`.
- Whether `podman machine start` succeeds on a machine **without** Docker
  Desktop (this box failed to start while Desktop was running).
- Wall-clock and failure modes of `POST /api/local-computer/pull` and `run`.
- Whether Hermes + Granite issues *any* computer-use tool call when the VM is
  attached (B-24 and MCP attachment are still open; a VM that never gets a tool
  call is dead weight).
- Whether skipping the VM on `tier === "tight"` is the right cut, or whether
  the whole arm should stay chat-only until a larger model is offered.

If those numbers kill the idea, record that in `local-model-path.md` as
**Decided (not on this arm)** rather than leaving this file to age into a spec.

## Measured 2026-08-21 — this Windows box, not the Granite machine

Not the scratch Hermes/Granite install the list above asked for. Windows 11
Home, **47.8 GB** RAM, **~21 GB** free on `C:`, WSL2 present (`docker-desktop`
distro). Docker Desktop **is** (`docker` 26.1.4 at
`C:\Program Files\Docker\Docker`), daemon was down until `Docker Desktop.exe`
was launched; `docker info` then succeeded in under a second. The Linux VM
reports 6 CPUs / ~23 GB. Host `vmmemWSL` sat around **3.3 GB** with Docker's
other compose stack (`eigent_*`) already auto-started — launching Desktop is
not a quiet probe on this machine.

A Local VM **already existed** from an earlier session:

- Image `localhost/openmausbot/cua-local-vm:driver-0.20.0-v3` (1.45 GB).
  Current code pins `IMAGE_LAYER_VERSION = "4"`, so today's app would treat
  this as stale and ask to recreate.
- Base `trycua/xfce-cua` uncompressed **1.32 GB**; Hub lists the pinned
  digest `sha256:274eb636…` (same as `0.1.0` / `latest`) at **~472 MB**
  compressed for amd64.
- Container `openmausbot-computer`, 4 GB / 2 CPU cap, viewer `127.0.0.1:6080`,
  workspace `~\.openmausbot\vm-home`. It had `Exited (255)` from Docker
  Desktop shutting down.

`docker start openmausbot-computer` returned in **0.7 s**. After ~8 s: VNC
`/vnc.html` **HTTP 200**, `cua-driver 0.20.0`, health report **`overall: ok`**
(X11, AT-SPI, screen capture all pass). Resident memory inside the cap was
**~270 MB / 4 GiB**. Host free RAM moved by a few hundred MB; `vmmemWSL`
grew ~340 MB. The 4 GB figure is a cgroup limit, not 4 GB extra on the
laptop. `docker stop` then exited 0.

So on Docker, **resume after a host daemon restart worked**. That contradicts
the API's blanket `POST /start` → 409 ("cannot safely resume; remove and
recreate"). Settings already folds a stopped container into **needsRecreate**,
so the "Start Local VM" button is unreachable; [B-06](../known-bugs.md) is
now "dead button + policy that this host did not need."

### Podman 6.0.2 — installed on this box, 2026-08-21

Primary sources: Podman's
[Windows tutorial](https://github.com/containers/podman/blob/main/docs/tutorials/podman-for-windows.md)
and [build_windows.md](https://github.com/containers/podman/blob/main/build_windows.md)
(user-scope MSI is the default; `MSIINSTALLPERUSER=1` needs no admin;
`ALLUSERS=1` does). Hyper-V is **not** on Windows Home; WSL is the only
provider on this SKU. The installer **no longer installs WSL**;
`wsl --install` is the admin-shaped step, and only when WSL is absent. This
box already had WSL2.

**CLI install, no UAC.** Downloaded
`podman-installer-windows-amd64.msi` v6.0.2 (27,381,760 bytes, SHA-256
`c0940598…79396f` matching `winget show Podman.CLI`). Ran
`msiexec /i … /quiet /norestart MSIINSTALLPERUSER=1 MACHINE_PROVIDER=wsl`.
Exit 0 in ~26 s. `podman.exe` at
`%LOCALAPPDATA%\Programs\Podman\podman.exe` (client 6.0.2). User PATH gained
that directory. `%APPDATA%\containers\containers.conf.d\99-podman-machine-provider.conf`
contains `provider="wsl"`. No reboot.

**`windowsKnownDirs()` does not list that folder.** A GUI app started before
the MSI will not see `podman` until restart, same class as [B-12](../known-bugs.md).
If we install Podman in-app, scan `%LOCALAPPDATA%\Programs\Podman` the way we
already scan Hermes.

**Machine init, no admin.** `podman machine init --provider wsl` completed in
**167 s**, pulled `quay.io/podman/machine-os:6.0`, registered WSL distro
`podman-machine-default`. Defaults: **3 CPUs, 2 GiB RAM, 100 GiB disk**
(sparse). Our Cua container is `--memory 4g`. A default machine cannot host
it.

**WSL cannot raise guest RAM after create.** Path A first-run 2026-08-21,
Podman 6.0.2, host ~48 GB: `podman machine set --memory 6144` exited 125
with `changing memory not supported for WSL machines`. `--memory` is valid
on `machine init`. First-run now inits with `--memory 6144` and recreates
an existing undersized guest (`machine rm --force` then init). Do not treat
that skip string as "the laptop is too small."

**Machine start depends on the WSL kernel, not on Docker or guest RAM.**

On **WSL 2.2.4 / kernel 5.15** (this box, earlier 2026-08-21), after the guest
was sized to 6 GiB, `podman machine start` exited 125 in ~38–48 s:

```
Error: machine did not transition into running state: ssh error: machine not in running state
```

`podman info` then refused the SSH port. Docker-API forwarding often printed
`All pipe instances are busy` first; that is a warning. **Quitting Docker
Desktop did not make start succeed.** Inside the guest, Podman's
`/root/bootstrap` nested systemd (`unshare --kill-child --fork …
/lib/systemd/systemd`) appeared and died in about a second; nothing listened
on SSH. Writing `[boot] systemd=true` then `wsl --terminate` yielded
`Wsl/Service/E_UNEXPECTED` until `podman machine rm --force` and re-init.

On **WSL 2.7.12.0 / kernel 6.18.33.2-2** (same box, after `wsl --update`,
stock guest, no `systemd=true`, Docker Desktop still Stopped): nested
`/lib/systemd/systemd` was still alive three seconds after bootstrap. Cold
`machine stop` then `machine start` exited **0 in ~10 s** ("started
successfully"). `podman info` reported the remote socket; `podman run --rm
quay.io/podman/hello` printed Hello Podman World. A leftover bootstrap from a
manual probe made a later `machine start` exit 125 with `already running`
while the client still worked — inspect-then-start in Path A skips start when
State is already `running`.

Do not encode Docker-kill, guest `systemd=true`, or `wsl --update` into the
installer. Old in-box WSL 2.2.x still skip with Podman's `Error:` line;
Continue is never gated on the VM. Current Store WSL is enough for start.

Walk log: [`2026-08-21-005-path-a-live-walk.md`](2026-08-21-005-path-a-live-walk.md).

Settings today only copies `winget install -e --id Podman.CLI`. That is not
enough: WSL, silent MSI + provider, `machine init --memory`, `machine start`,
and PATH scan are all load-bearing.

Still unmeasured, and still load-bearing for putting this on Path A:

- Granite resident + this VM on a **16 GB** machine.
- Whether Hermes + Granite issues a computer-use tool call (B-24). The Cua
  layer **v4** pull/build on this box was **~218 s**, then `run` ~9 s.

## Explicitly out of scope until someone argues otherwise

- Editing `LocalComputerSection.tsx` / `Onboarding.tsx`.
- Bundling Podman, WSL, or the Cua image into `electron-builder.yml`.
- Re-enabling Hermes `-SkipComputerUse`.
- A new progress SSE kind for the container pull.
- Per-bot desktops as a first-run default.
