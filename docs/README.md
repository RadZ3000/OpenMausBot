# Docs

Hop-on page for a new agent. **Rules** live in [`../AGENTS.md`](../AGENTS.md).
**Current state** lives in [`agent-status.md`](agent-status.md). This file is
only the map: app shape, whose file, where architecture, conventions, and docs
live, and what not to touch.

Overwrite [`agent-status.md`](agent-status.md) when facts change. Add, archive,
or delete files when the tree scatters (`keep-docs-current`: plans that left
Open are archived; duplicates and pass-throughs are deleted).

## Start here

1. [`../AGENTS.md`](../AGENTS.md) — always-on rules. Skills under
   `.claude/skills/<folder>/SKILL.md`.
2. This file — app shape, whose file, where to look.
3. [`agent-status.md`](agent-status.md) — git, what's in the tree, next work,
   stop-lines.
4. **One** plan from [`plans/README.md`](plans/README.md). Historical work is
   under [`plans/archive/`](plans/archive/README.md). Do not start from a walk
   log or a dated handoff.

## What this app is

Electron chat. Each sidebar bot is a real agent CLI (or API driver), not one
boxed assistant.

Two processes: [`../src/`](../src/) is the React UI (HTTP commands out, one SSE
stream in); [`../server/`](../server/) owns every agent process on
`127.0.0.1:8799`. Platform code is [`../electron/`](../electron/). Fork overlay
is [`../brand/`](../brand/). [`../server/contracts.ts`](../server/contracts.ts)
is the driver SPI — read it before inventing a seam. It is types and events, not
a turn walkthrough; trace a send if you need the flow.

First-run arms (names from
[003](plans/2026-08-20-003-product-foundation-plan.md); spec
[005](plans/2026-08-20-005-three-path-first-run-plan.md)):

- **Path A** — local open-source (runtime, weights, Hermes, Local VM). No API key.
- **Path B** — bring your own key.
- **Path C** — hosted "just run" (capability then credits). Fail closed: no
  default Worker URL.

Path A computer is the **Local VM**. Upstream Box/cloud computer is inherited;
it is not the wedge.

Repo-root [`../README.md`](../README.md) is **upstream marketing** (their
downloads, Polar). Do not follow it for this fork. Campaign state:
[`agent-status.md`](agent-status.md).

## Living docs (ours)

One fact, one file. If a fact already has an owner, edit that file.

| File | Owns |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Rules. Keep short. |
| [`agent-status.md`](agent-status.md) | State + goals. Overwrite in place. |
| **This file** | App shape, whose file, where to look. Keep the hop-on path obvious. |
| [`plans/README.md`](plans/README.md) | Catalog of *our* plans (open / in tree / archive). |
| [`known-bugs.md`](known-bugs.md) | Defects we ship. Delete the entry when fixed. |
| [`local-model-path.md`](local-model-path.md) | Path A tensions and decisions. |
| [`identity-surface.md`](identity-surface.md) | Names that may change vs names that strand installs. |
| [`image-generation.md`](image-generation.md) | How image generation is wired (user-facing). |

## Layout

| Path | What it is |
|---|---|
| [`../README.md`](../README.md) | **Upstream** marketing. This file is the hop-on map. |
| `src/` | React UI |
| `server/` | Node harness. New capability = new file at an existing seam. |
| `electron/` | Desktop shell (platform gates) |
| `brand/` | Fork overlay. Phase D unset — do not invent `appId` / icons / URLs. |
| `cloudflare/inference-broker/` | Path C Worker (ours) |
| `companion/` | LAN companion (desktop pairing / phone setup UI) |
| `android/` | **Upstream** Android companion. Inherit; do not rewrite. |
| `android/` / `ios/` | **Upstream** phone companions. Read, do not rewrite. |
| `.claude/skills/` | Agent skills. Indexed in `AGENTS.md`. |
| `docs/plans/` | Specs we still act on |
| `docs/plans/archive/` | Done, superseded, walks, diaries. Git has them. |
| `docs/superpowers/` | **Upstream.** Do not start here. Do not add files. |

## Whose file (fork vs upstream)

The rule is `git diff --stat upstream/main`. In that list → ours. Absent →
theirs. The table below is a cheat sheet for files that look like "the docs";
if it disagrees with the diff, the **diff** wins.

| Ours | Theirs — read, do not rewrite |
|---|---|
| This map, [`agent-status.md`](agent-status.md), [`plans/README.md`](plans/README.md), [`known-bugs.md`](known-bugs.md), [`local-model-path.md`](local-model-path.md), [`identity-surface.md`](identity-surface.md), [`image-generation.md`](image-generation.md), [`../AGENTS.md`](../AGENTS.md), [`../brand/`](../brand/), [`../cloudflare/inference-broker/`](../cloudflare/inference-broker/) | Repo-root [`../README.md`](../README.md), [`../CONTRIBUTING.md`](../CONTRIBUTING.md), [`releasing.md`](releasing.md), [`superpowers/`](superpowers/), [`../android/`](../android/), `docs/plans/2026-08-18-*`, product guides (`cursor.md`, `voice-mode.md`, `composio.md`, `ios-*.md`, …) |

Product guides and their plans (`agent-harness-upgrades*.md`,
`opencode-go-integration.md`) stay byte-identical unless we are merging.
Do not park fork state in them.

## Do not

- Add `docs/plans/YYYY-MM-DD-*-handoff.md` or a second snapshot.
- Add a standing doc when an owner already exists.
- Leave a finished plan in the Open table — archive it (do not delete a
  tee or a stop-line because it is old).
- Delete a second snapshot or handoff without fixing inbound links.
- Edit an upstream doc when a new file will do.
