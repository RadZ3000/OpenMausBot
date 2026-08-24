# Handoff: Path A live walk, 2026-08-21 (later)

**Walk log (measurements), not the snapshot.** Current state:
[`../agent-status.md`](../agent-status.md).
Design decisions: [`docs/local-model-path.md`](../local-model-path.md).
Defects: [`docs/known-bugs.md`](../known-bugs.md).
B-24 diary: [`2026-08-21-004-b24-investigation.md`](2026-08-21-004-b24-investigation.md).
Local VM: [`2026-08-21-002-local-path-vm-considerations.md`](2026-08-21-002-local-path-vm-considerations.md).

## 0. What this commit holds

Branch `merge/upstream-0.1.27`. The working-tree checkpoint is the commit that
adds this file. It includes:

- Pinned Ollama zip on Path A (`server/ollama-setup.ts`) — already on the
  branch before this walk.
- Local VM first-run (`server/podman-setup.ts`) — memory sized at
  `machine init`, not `machine set`.
- Path A wizard: Hermes row uses `agentReady`; skip events are notices, not
  progress; Podman skip quotes the CLI `Error:` line.
- This walk's measurements (below).

`electron/vendor/electron-updater.cjs` dirties on `pnpm package:win` (LF→CRLF).
Do not commit it; `git checkout --` it.

`pnpm package:win` **never produced**
`release/OpenMausBot-0.1.27-setup.exe` on this box (GitHub timeouts fetching
electron-builder NSIS/winCodeSign). Dist (`dist/`, `dist-server/`) was already
built. Retry on a machine that can reach GitHub or
`ELECTRON_BUILDER_BINARIES_MIRROR`. Unsigned NSIS still hits [B-15](../known-bugs.md).

## 1. How the walk was run (not the packaged app)

UI: Vite `http://127.0.0.1:5199/` (`pnpm dev`). Harness: `pnpm dev:server` on
`127.0.0.1:8799`. **Not** Electron, **not** the NSIS installer, **not**
`~/.openmausbot`.

Throwaway home (do not point tests or the harness at the real user dir — that
has three Codex bots and would attach `agents` MCP, which is the wrong B-24
path):

```
OMB_DATA_DIR=C:\Users\Admin\AppData\Local\Temp\omb-b24-home
OMB_DEFAULT_ENGINE=hermesAgent
OMB_DEFAULT_MODEL=ollama::ibm/granite4.1:3b
```

Ollama binary: junction `omb-b24-home\local-runtime` → the probed v0.32.15
unpack. Zip at `%TEMP%\omb-ollama-probe\ollama-windows-amd64.zip`.

The browser tab does not change Podman/Ollama/Hermes — those run in the
harness. It does skip folder pickers, the desktop viewer, and SmartScreen.

## 2. What Path A actually did

| Step | Result |
|---|---|
| Ollama zip + serve | Binary on disk. Harness spawn with `windowsHide` and no `OLLAMA_HOST` did **not** bind 11434. A later serve **with** `OLLAMA_HOST=127.0.0.1:11434` did. Product `runtimeEnv()` still does not set `OLLAMA_HOST`. |
| Granite `ibm/granite4.1:3b` | Pull finished on the server. The browser NDJSON client timed out around 59%; `GET /api/local-model` then showed `modelReady: true`. |
| Hermes | Official `install.ps1` via `POST /api/local-model/agent` (`-SkipSetup -SkipComputerUse -NonInteractive`). Overlapping retries locked `%LOCALAPPDATA%\hermes\hermes-agent`. Eventually `hermes.exe` exists; `agentReady: true`. Config is session-time (`selectHermesInjectProvider`), not install-time. We do not pin the Hermes zip like Ollama. Leftover: `%LOCALAPPDATA%\hermes\hermes-agent.broken-20260821-151205`. |
| Checklist | After VM skip, a 1200 ms Ollama miss used to rewind to "Install the local runtime". Fixed: `pathAPane` treats Hermes present (`agentReady` / instance id) as the last required step. Skip is a notice, not a progress label. |
| Local computer | Optional. Continue never waits on it. **Did not become ready on this box.** |

The wizard ended on Continue with Ollama, Granite, and Hermes checked, Local
computer empty, skip text from Podman's `Error:` line.

## 3. Podman / Local VM — measured, do not productize the workarounds

Podman 6.0.2 per-user MSI, provider WSL, machine `podman-machine-default`.

**Memory.** Guest default is 2 GiB. `podman machine set --memory 6144` exits
125: `changing memory not supported for WSL machines`. Code now inits with
`--memory 6144` and recreates an undersized guest. That recreate **worked**
(inspect: 6144 MiB).

**Start on WSL 2.2.4 / kernel 5.15.** `podman machine start` exited 125 after
~38–48 s:

```
Error: machine did not transition into running state: ssh error: machine not in running state
```

Often preceded by Docker-API forwarding noise (`CreateFile \\.\pipe\…: All
pipe instances are busy`). `podman info` then failed with
`dial tcp 127.0.0.1:<ssh>: connection refused`. Quitting Docker Desktop
(`DockerCli.exe -Shutdown`) **did not** make start succeed. Nested systemd
from Podman's `/root/bootstrap` appeared for about a second and died.

Writing `[boot] systemd=true` then `wsl --terminate` produced
`Wsl/Service/E_UNEXPECTED` on that kernel (distro unusable until
`podman machine rm --force` and re-init). **Do not** put Docker-kill, guest
`systemd=true`, `wsl --update`, or linger/`sshd` outside Podman's bootstrap
into Path A.

**Start on WSL 2.7.12.0 / kernel 6.18.33.2-2 (re-probed 2026-08-21 evening).**
Dropped the experimental guest (`machine rm --force`), inited
`--provider wsl --memory 6144` (42 s, image already cached). Stock
`/etc/wsl.conf` is only `[user] default=user`. Nested `/lib/systemd/systemd`
was still running three seconds after `/root/bootstrap`. Cold `machine stop`
(~6 s) then `machine start` exited **0 in ~10 s**. `podman info` and
`podman run --rm quay.io/podman/hello` both succeeded. Docker Desktop distro
was Stopped; no `systemd=true`.

Native `systemd=true` on 2.7 did boot `sshd` and made `podman info` work, but
`machine start` still exited 125 (`machine not in running state` / later
`already running`) because Podman's isRunning grep wants
`^/lib/systemd/systemd`, not pid 1 `/sbin/init`. Do not ship that write;
stock nested bootstrap is the customer path and it works on current WSL.

`POST /api/local-model/vm` on the throwaway harness (2026-08-21 evening):
inspect already `running` → **Podman is ready** (did not call `machine start`).
An overlapping POST saw `Another Local VM setup action is still running` while
the first request pulled `trycua/xfce-cua` and built
`localhost/openmausbot/cua-local-vm:driver-0.20.0-v4`. That first request
finished in **230 s**: Preparing 2.2 s → 220.7 s, then Starting the Local VM
→ **Local VM is ready** (`vm: true`) at 229.7 s. A later POST with the image
already present returned ready in ~15 s. Viewer
`http://127.0.0.1:6080/vnc.html`. Workspace
`%TEMP%\omb-b24-home\vm-home`.

**Follow-up, not a 5-minute patch:** if inspect says stopped but start exits
125 (`already running` or `not in running state`), still try `podman info`.
If info works, yield ready. We only saw `already running` after a leftover
manual `/root/bootstrap`, not on a cold customer start (that exited 0). Do
not add an inspect-vs-ps sync.

## 4. B-24 — next probe, not done

Hermes + Granite **are** installed. The B-24 turn was **not** sent (we stopped
to get Podman honest, then to checkpoint).

On a throwaway `OMB_DATA_DIR`, one Hermes bot, no Composio, VM skipped:

1. Continue out of Path A.
2. Prompt: `what's in this folder`.
3. Read `OMB_DATA_DIR/native/<threadId>.ndjson` for `mcpServers` (expect `[]`).
4. Hermes log under `%LOCALAPPDATA%\hermes` for
   `Creating new local environment` / `environment ready`.

That is hypothesis 1 in plan 004. Do not use real `~/.openmausbot`. Do not
mock `child_process`.

Windows one-bot Path A is B-24**(b)** (`mcpServers: []`, hang in file-tools
sandbox). **(a)** needs a second bot, Composio, or a working Local VM — the
shared Cua VM is now up on this throwaway home, so (a) is reachable if the
bot's `computer` is `vm`.

## 5. Next steps, in order, on another system

1. **B-24(b) one-bot turn** as above. That is the live question.
2. Packaged NSIS + B-15 only if that machine can download electron-builder
   binaries. Not required to settle B-24.
3. Local VM is settled on this box for current Store WSL (2.7.x): stock
   guest, `machine start`, Cua layer v4 pull/build (~3.5 min), `run`. Old
   2.2.x still skip with the CLI `Error:` line. Do not copy a guest
   `wsl.conf`. Do not treat a skip as "not enough RAM".
4. Optional product holes **not** blocking B-24: set `OLLAMA_HOST` when we
   spawn owned Ollama; poll Path A status while Hermes installs; Granite pull
   NDJSON client timeout vs server finish.

## 6. Traps from this walk

- Path A auto-kicks VM setup once runtime+model+agent are ready
  (`LocalModelArm` `vmKickoff`). Skip must not rewind the wizard.
- `GET /api/local-model` `runtimeUp` is a 1200 ms `/api/tags` probe. WSL
  machine init can make it miss; Hermes on disk is still `agentReady`.
- Official Hermes installer is not re-entrant; overlapping `POST /agent`
  locks the install dir.
- `wsl -l -v` from PowerShell is often UTF-16. Prefer `cmd /c "wsl -l -v"`
  or decode.
- Nested systemd dying is **not** the same bug as the Docker named pipe.
  The pipe warning can appear while the real failure is SSH/systemd.
- Native systemd in the Podman distro bricked WSL on 2.2.4. Re-init; do not
  ship that write.
