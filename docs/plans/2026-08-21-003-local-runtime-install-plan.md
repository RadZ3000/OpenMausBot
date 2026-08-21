# Local-path runtime install: fetch a pinned Ollama zip and launch it

Status: **first cut in tree.** Written 2026-08-21. The product line was already
settled in [`docs/local-model-path.md`](../local-model-path.md): fetch a
checksum-pinned portable zip on first use of Path A, launch `ollama serve`
ourselves so `server/local-runtime.ts` is no longer inert, and do **not**
send the customer to ollama.com. The wizard stays serial for now.

This file pins the release we would actually fetch and the seam to hang it on.
The standing register stays in `docs/local-model-path.md`. Defects stay in
[`docs/known-bugs.md`](../known-bugs.md).

## check-upstream-first

Fetched `upstream/main` 2026-08-21 (afternoon); this branch was **0 commits
behind**.

- Upstream **does not have** `server/local-runtime.ts`, `server/local-model.ts`,
  or any Ollama installer. `git cat-file -e upstream/main:server/local-runtime.ts`
  misses.
- Upstream **does** inject whatever is already listening on `127.0.0.1:11434`
  (`server/drivers/local-inject.ts`). We keep that. Installing and launching is
  a new file, not a fork of theirs.
- Do not put this in `Onboarding.tsx` or `EngineSetup.tsx`. Call it from
  `src/components/LocalModelArm.tsx` (ours), the same way Hermes and Podman
  already work.

## Why this is not "Get Ollama"

`runtimeEnv()` in `server/local-runtime.ts` only applies to a process we spawn.
A tray install someone else started keeps Ollama's laptop-hostile defaults
(three resident models, five-minute keep-alive, 4096-token context). That is
the truncation bug in the 2026-08-21 handoff: an agent prompt was evaluated as
2,050 tokens and picked the wrong tool.

Fetching the zip is therefore a **memory decision** before it is a convenience
one. It also lets us set `OLLAMA_MODELS` under `~/.openmausbot` so uninstalling
the app reclaims the weights, and it is a version we pin instead of an update
channel we do not audit.

## What Ollama actually publishes (probed)

Source: GitHub Releases API for `ollama/ollama`, tag **v0.32.15**, published
2026-08-19. First-party Windows docs
([`docs/windows.mdx` at that tag](https://github.com/ollama/ollama/blob/v0.32.15/docs/windows.mdx)):
the zip exists specifically so you can "embed Ollama in existing applications"
and run `ollama serve` yourself. Licence at that tag: **MIT**
(`https://raw.githubusercontent.com/ollama/ollama/v0.32.15/LICENSE`).

Windows amd64 standalone zip (the one we fetch):

| Field | Value |
|---|---|
| URL | `https://github.com/ollama/ollama/releases/download/v0.32.15/ollama-windows-amd64.zip` |
| Size | 1,460,302,386 bytes (~1.36 GiB) |
| SHA-256 | `a1d11d46a944f9c7521f5e9a3a5db51cd3365401da627d96c204698fc6914ff9` |

Review the URL and SHA-256 together before bumping a release, same comment we
use on the Podman MSI.

Other Windows assets, **not** this pass:

| Asset | Size | Why not |
|---|---|---|
| `ollama-windows-amd64-rocm.zip` | ~235 MiB | AMD overlay to extract *on top of* the base zip |
| `ollama-windows-amd64-mlx.zip` | ~1.00 GiB | extra CUDA/MLX overlay |
| `ollama-windows-arm64.zip` | ~200 MiB | Snapdragon; we have no arm64 first-run yet |

There is **no CPU-only Windows amd64 zip**. Integrated-graphics laptops still
download the NVIDIA libraries. That is the cost already recorded in the
register; llama.cpp remains the smaller-runtime research item, not this pass.

Darwin `ollama-darwin.tgz` is ~147 MiB. Linux amd64 is another ~1.3 GiB
`.tar.zst`. Windows-first, same as Podman; Darwin can follow in the same
shape if the zip work is clean. Do not invent a zstd unpacker for Linux this
pass.

The standalone zip **does not include the tray app**. First-party (Ollama
maintainer on [issue #6944](https://github.com/ollama/ollama/issues/6944)):
CLI + GPU libs only; the embedder owns process lifetime. Auto-update lives in
`ollama app.exe` from `OllamaSetup.exe`, not in `ollama serve`. That is the
structural answer to the unverified CVE write-up in the register — we never
install the tray.

Unzip: Windows 10+ ships `C:\Windows\System32\tar.exe` (bsdtar, zip-capable).
This box: `bsdtar 3.8.4`. `scripts/prepare-android-tools.mjs` already uses that
absolute path so git-bash GNU tar cannot steal the name. Argv only; no
`shell: true`. No new unzip dependency.

## Behaviour

If `GET /api/tags` on `127.0.0.1:11434` already answers, **do nothing**. Do not
kill someone else's daemon. Do not download 1.4 GB. The memory policy stays
inert in that case — same as today — and that is honest.

Otherwise:

1. If we already unpacked a pinned runtime under our data dir, skip the
   download.
2. Else download the pinned zip, verify SHA-256, extract with System32
   `tar.exe` into `~/.openmausbot/local-runtime/` (never the real home in
   tests). Leave their `LICENSE` in that tree.
3. Spawn `ollama.exe serve` with argv, `windowsHide: true`, and
   `runtimeEnv({ modelsDir: join(DATA_DIR, "local-models"), contextTokens })`.
   No `shell: true`.
4. Wait on `/api/tags` becoming ok (the event that proves it), not a sleep.
5. Keep the child for the life of the harness. On server shutdown, kill the
   tree we spawned. Next launch: if our binary exists and 11434 is free, spawn
   again without re-downloading.

Do not spawn `%LOCALAPPDATA%\Programs\Ollama\ollama.exe` from their installer.
That is an unpinned binary next to a tray updater. Either we own the zip, or
we are a guest on a daemon that is already up.

## Seam

New files, ours:

- `server/ollama-setup.ts` + `server/ollama-setup.test.ts` — download, verify,
  unpack, spawn. Inject `fetchImpl`, `run`, dirs, `exists`. Follow
  `server/podman-setup.ts` and `server/hermes-install.ts`.
- `POST /api/local-model/runtime` — NDJSON progress, same as pull / Hermes /
  VM. Failures in-band. One import line in `server/index.ts`.
- Boot: if our binary is on disk and the port is free, spawn (so a second
  app launch does not sit on "Get Ollama").
- `src/components/LocalModelArm.tsx` — replace the ollama.com link with
  "Install the local runtime" that hits the new route. Keep the checklist
  row. Continue stays gated on a runtime that actually answers, which this
  route is what makes true.

Do not edit `server/drivers/local-inject.ts`. Do not bundle the zip into
`electron-builder.yml`. Do not add a dependency for unzipping.

Disk: `diskNeededBytes` today is model + 3 GB. Add the zip size (and some
unpack headroom) before offering the download, or the runtime fetch can fail
halfway after we already promised it would fit.

## Still unprobed

This machine has no NVIDIA (`nvidia-smi` missing). A live unpack of v0.32.15
and `ollama serve` from the zip was started against a temp dir; the 1.4 GB
download was still in flight when the first cut landed. CPU-only serve from
the NVIDIA-flavoured zip remains the question to close on the next pass.

## Out of scope

- Bundling the zip in the NSIS installer (air-gap SKU later, via
  `VITE_INSTALL_PATHS`).
- AMD ROCm / MLX overlay zips.
- llama.cpp as a substitute runtime.
- GPU detection (still RAM-only; see the register).
- Collapsing the wizard into one button.
- B-24 (Hermes MCP / sandbox hang).
