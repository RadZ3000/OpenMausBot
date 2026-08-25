# Upstream license merge gate

Status: **in tree (2026-08-25).** `pnpm check:upstream-license` is green on
`upstream/main` `bb087fa` (Apache-2.0). Fetch stays vanilla. Merge does not.

## check-upstream-first (done before coding)

Fetched `upstream/main`. No license gate, no `scripts/check-upstream-license.mjs`.
`package.json` `"license": "Apache-2.0"`. `LICENSE` is Apache 2.0. This is a
fork-owned file at the existing `scripts/check-*.mjs` seam.

## Why this exists

Apache §2 is irrevocable for the copy we already have. A later upstream
relicense applies to **new commits**. The dangerous step is merging those
commits — including when the user says “fetch upstream and merge.” Without a
hard stop, an agent fetches, merges, and only then notices `LICENSE` moved.

`pnpm check:licenses` will not catch this. That script owns the npm tree.

## Binding decisions

- **Do not wrap `git fetch`.** Fetch is how we see they changed `LICENSE`.
- **Do not fold this into `check-licenses.mjs`.** New file, `pnpm check:*` family.
- **Do not edit `ci.yml`.** Upstream-owned; a normal checkout has no `upstream`
  remote. Backstop is the additive workflow
  [`.github/workflows/check-upstream-license.yml`](../../.github/workflows/check-upstream-license.yml)
  (Monday 12:00 UTC + `workflow_dispatch`).
- **Hard stop in `AGENTS.md`**, not only in `upstream-merges`, so a merge order
  still binds when the agent never opened that skill.
- **User merge orders do not skip the gate.** “Fetch and merge” / “catch
  upstream” is the normal path, not an exception.
- **Red → refuse merge / cherry-pick / rebase of `upstream`.** Fetch-only is
  allowed. Paste the script’s alert. Wait.
- **Acknowledgment is a new message after the alert** that names the detected
  license (AGPL, SSPL, Commons Clause, …).
- **Does not count:** the original merge request; `ok` / `continue` / `do it` /
  `proceed` / `lgtm`; leftover plan-approval from before the alert; a bare
  “I acknowledge”.
- **After a named acknowledgment, default is freeze** at the last clean SHA the
  script printed. Taking the new terms requires that same (or a later) message
  to also say to merge **despite that named license**.
- **SPDX:** reuse `permitted()` from `check-licenses.mjs`. Apache-2.0 / MIT /
  BSD pass. GPL / AGPL / SSPL / `AND` with copyleft fail. Dual
  `Apache-2.0 OR GPL-3.0` still passes (we elect Apache; GPL text in that file
  is not a tripwire).
- **Body scan** of `LICENSE` / `NOTICE` when SPDX is a single permissive
  license: Commons Clause, BSL, Elastic, PolyForm Noncommercial, CC-NC. MIT
  replacing Apache is exit 0 with a note.
- **Missing `LICENSE` or `package.json` `license`:** fail. NOTICE is optional.
- **Default ref `upstream/main`.** `--ref REV` for a named revision. Do not
  silently check `HEAD` when the remote is missing.

## Files

| File | Why |
|---|---|
| [`scripts/check-upstream-license.mjs`](../../scripts/check-upstream-license.mjs) + test | Gate. Fork-owned. |
| [`package.json`](../../package.json) | `pnpm check:upstream-license` |
| [`.github/workflows/check-upstream-license.yml`](../../.github/workflows/check-upstream-license.yml) | Weekly + dispatch backstop |
| [`AGENTS.md`](../../AGENTS.md) | Hard constraint + verify line |
| `.claude/skills/upstream-merges`, `check-upstream-first`, `commercial-fork`, `review-changes` | Procedure |

Not in the diff: a fetch wrapper, a new skill, edits to `ci.yml` /
`CONTRIBUTING.md` / `LICENSE`.

## If it fails

1. Stop. Do not merge.
2. Paste the script alert (SPDX, restrictions, last clean SHA, two allowed replies).
3. Wait. Freeze unless the user names the license **and** says to merge despite it.
4. Looking at their tree for ideas is fine. Copying those commits is not.
