# Docs

Hop-on page for a new agent. **Rules** live in [`../AGENTS.md`](../AGENTS.md).
**Current state** lives in [`agent-status.md`](agent-status.md). This file is
only the map: where architecture, conventions, and docs live, and what not to
touch.

Overwrite [`agent-status.md`](agent-status.md) when facts change. Add, archive,
or delete files when the tree scatters (`keep-docs-current`: plans that left
Open are archived; duplicates and pass-throughs are deleted).

## Start here

1. [`../AGENTS.md`](../AGENTS.md) — always-on rules. Skills under
   `.claude/skills/<folder>/SKILL.md`.
2. This file — where to look.
3. [`agent-status.md`](agent-status.md) — git, what's in the tree, next work,
   stop-lines.
4. **One** plan from [`plans/README.md`](plans/README.md). Historical work is
   under [`plans/archive/`](plans/archive/README.md). Do not start from a walk
   log or a dated handoff.

Architecture is [`../server/contracts.ts`](../server/contracts.ts) — read that
before inventing a seam. Two processes: `src/` is the React app (HTTP out, one
SSE stream in); `server/` owns every agent process on `127.0.0.1:8799`.
Platform-specific code is `electron/`. Fork overlay is `brand/`.

## Living docs (ours)

One fact, one file. If a fact already has an owner, edit that file.

| File | Owns |
|---|---|
| [`../AGENTS.md`](../AGENTS.md) | Rules. Keep short. |
| [`agent-status.md`](agent-status.md) | State + goals. Overwrite in place. |
| **This file** | Where to look. Keep the hop-on path obvious. |
| [`plans/README.md`](plans/README.md) | Catalog of *our* plans (open / in tree / archive). |
| [`known-bugs.md`](known-bugs.md) | Defects we ship. Delete the entry when fixed. |
| [`local-model-path.md`](local-model-path.md) | Path A tensions and decisions. |
| [`identity-surface.md`](identity-surface.md) | Names that may change vs names that strand installs. |
| [`image-generation.md`](image-generation.md) | How image generation is wired (user-facing). |

## Layout

| Path | What it is |
|---|---|
| `src/` | React UI |
| `server/` | Node harness. New capability = new file at an existing seam. |
| `electron/` | Desktop shell (platform gates) |
| `brand/` | Fork overlay. Phase D unset — do not invent `appId` / icons / URLs. |
| `cloudflare/inference-broker/` | Path C Worker (ours) |
| `companion/` | LAN companion |
| `.claude/skills/` | Agent skills. Indexed in `AGENTS.md`. |
| `docs/plans/` | Specs we still act on |
| `docs/plans/archive/` | Done, superseded, walks, diaries. Git has them. |
| `docs/superpowers/` | **Upstream.** Do not start here. Do not add files. |

## Upstream docs (read, do not rewrite)

Everything under `docs/` that does **not** appear in
`git diff --stat upstream/main -- docs` is theirs. Product guides (`cursor.md`,
`voice-mode.md`, `releasing.md`, `composio.md`, `ios-*.md`, …) and their plans
(`docs/plans/2026-08-18-*`, `agent-harness-upgrades*.md`,
`opencode-go-integration.md`) stay byte-identical unless we are merging.
Do not park fork state in them.

## Do not

- Add `docs/plans/YYYY-MM-DD-*-handoff.md` or a second snapshot.
- Add a standing doc when an owner already exists.
- Leave a finished plan in the Open table — archive it (do not delete a
  tee or a stop-line because it is old).
- Delete a second snapshot or handoff without fixing inbound links.
- Edit an upstream doc when a new file will do.
