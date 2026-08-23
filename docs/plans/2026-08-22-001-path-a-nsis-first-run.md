# Path A NSIS first-run — 2026-08-22

Status: **WSL probe and virt skip in tree (B-25, B-27).** Chooser stickiness
is still [B-26](../known-bugs.md). Rebuild NSIS to walk it. Decisions:
[`docs/local-model-path.md`](../local-model-path.md).
Dev-server walk (not NSIS): [`2026-08-21-005-path-a-live-walk.md`](2026-08-21-005-path-a-live-walk.md).

## check-upstream-first

`LocalModelArm.tsx`, `server/podman-setup.ts`, and `src/lib/install-path.ts`
are fork files. Upstream has no Path A WSL/Podman probe and no
`omb-install-path` chooser.

## How this walk was run

Virgin-ish Windows box after removing Ollama, Hermes, Cua scheduled task,
`~/.openmausbot`, leftover `Programs\openmausbot`, then installing
`release/OpenMausBot-0.1.27-setup.exe` (built 2026-08-21). WSL was not
installed at the start. Chat/harness fixes landed in git after that NSIS
build and were **not** in the `.exe`.

First launch still skipped Path A until `%APPDATA%\OpenMausBot` was wiped
(B-26). After that, the chooser appeared.

## What the wizard actually did

| Step | Result |
|---|---|
| Run a model on this computer | Chooser → LocalModelArm checklist |
| Install the local runtime | Ollama ✓ (pinned zip; ~5 min) |
| Download the model | Granite `ibm/granite4.1:3b` ✓ |
| Install Hermes | Hermes ✓ (in-app `install.ps1`) |
| Install WSL (UAC) | Component installed; **UI did not change** |
| Continue / Local computer | Not reached honestly — still showing Install WSL |

Chat is allowed here (`Continue`). The Local computer row stayed empty.

## What Windows said after the WSL click

Nothing in Path A was still installing (`msiexec` was the idle service).

- `wsl.exe` exists; `wslservice` running.
- `wsl --status`: Default Version 2.
- `wsl -l -v`: **no distributions**, **exit -1** — expected after
  `--no-distribution`.
- Same status: **virtualization is not enabled** (Virtual Machine Platform /
  firmware). WSL2 cannot start until that is on. A reboot may still be
  required after the component install.

## Work to do (local arm)

The VM is **on the path**, not a footnote. Observed 2026-08-22: after Hermes
the screen still said "Chat works now", labelled the row "(optional)", and
hid the trigger behind **Install WSL**, so a person could not tell whether
the Local computer was installed or how to start it.

Ordered:

1. **Wizard copy and CTAs (in tree, 2026-08-22).** Drop "(optional)". After
   Hermes, a dedicated Local computer step: auto-start, primary **Set up the
   Local computer**, Continue secondary until `vmReady`. Packaged 0.1.27
   does not include this until the next `package:win`.
2. **B-25 — `wslPresent`.** Treat `--no-distribution` success as WSL ready.
   Then auto-kick Podman. Without this, auto-start UAC still leaves
   `wslReady: false` and Podman never runs. Regression test: `wsl -l -v`
   non-zero + "no installed distributions" ⇒ `wslReady: true`.
3. **Wizard after WSL.** Never return to an **Install WSL** button. Keep
   reboot/firmware copy through `refresh()`. Tick or skip the row with a
   reason a person can act on.
4. **B-27 — virt/VMP, split the skip (in tree).** Feature off → elevate DISM.
   Reboot pending → Restart Windows. Firmware off → BIOS copy only.
5. **B-26 — first-run flag.** Chooser must reappear when the harness has no
   local runtime/agent, even if `localStorage` remembers a path. Defer must
   not dump a first-run user onto clipboard EngineSetup as the only next
   step.
6. **One action (standing register).** Checklist exists; CTAs are still
   serial (runtime, then model, then Hermes, then Local computer). Target
   remains one pass with progress, VM in the background; Continue is the
   labelled skip, not the success path.
7. **Next NSIS.** Rebuild `package:win` so this wizard, Hermes CRLF
   `model.provider` inject, and empty `session/load` → `session/new` ship.
   Overlaying `dist-server/index.js` is not a customer path.
8. **Still open, not this walk:** [B-24](../known-bugs.md) (tool call hang
   in Hermes local environment; Granite often skips tools). Do not call Path
   A "done" because chat Continue works.

## Do not

- Hide the Local computer behind "WSL" or "(optional)".
- Make Continue the primary action while the guest is not running and has
  not been skipped with a reason.
- Hard-gate the app on `vmReady` (firmware-off machines must still reach chat).
- Uninstall WSL as part of a "reset demo" unless the walk says so — this
  walk needed the component on.
- Treat "I'll set this up later" as the Path A success path.

## VMP vs firmware (research, 2026-08-22) — not activated on this box

Question: can Path A **check** whether virt is on and **turn it on** as
part of the arm? Two different switches. Not enabled from the app in this
session.

### Windows optional features — yes, detect and activate

Microsoft's own WSL install ([manual steps](https://learn.microsoft.com/en-us/windows/wsl/install-manual))
enables them with elevated DISM, then a reboot:

```
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

`wsl --install --no-distribution` is the same enable (it tries
`VirtualMachinePlatform` for us). We already UAC that. What we do not do:
read feature state, or treat **reboot pending** as the next step.

Unprivileged detect (this box, Lenovo 90T00007US, 12th-gen i5-12400):

| Signal | API | Result |
|---|---|---|
| `VirtualMachinePlatform` | `Win32_OptionalFeature.InstallState` ([1=Enabled, 2=Disabled](https://learn.microsoft.com/en-us/windows/win32/cimwin32prov/win32-optionalfeature)) | **1 Enabled** |
| `Microsoft-Windows-Subsystem-Linux` | same | **2 Disabled** |
| `HypervisorPlatform` | same | 2 Disabled (not required for WSL2) |
| CBS reboot pending | `HKLM\...\Component Based Servicing\RebootPending` | **true** |

`Get-WindowsOptionalFeature` / `dism /Get-FeatureInfo` need elevation
(exit 740). CIM does not. Enable still needs the same RunAs we already use
for WSL. After enable, the next honest CTA is **Restart Windows**, then
re-probe — not Continue.

### Firmware virtualization — detect only, cannot activate

VT-x/AMD-V lives in UEFI. No argv, DISM, or UAC can turn it on.

`Win32_Processor.VirtualizationFirmwareEnabled` on this box is **False**,
and SLAT **False**, while `Win32_ComputerSystem.HypervisorPresent` is
**True** and Device Guard VBS is running. Those CPU fields go false once
a hypervisor owns the hardware — they are not a firmware-off proof.
Trust `HypervisorPresent` / VBS / a working `vmcompute` over the CPU
boolean.

If hypervisor is absent **and** features will not enable, copy is "turn
virtualization on in firmware, then come back." No in-app button.

### What `wsl --status` actually meant here

It printed "virtualization is not enabled" / "enable Virtual Machine
Platform" while VMP was already Enabled and a reboot was pending. Treating
that string as firmware-off is why the wizard offered only Continue. Split
the skip: feature off → elevate DISM/WSL; reboot pending → restart;
firmware actually off → explain BIOS.
