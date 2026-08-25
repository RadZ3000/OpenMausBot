---
name: keep-docs-current
description: Read the hop-on map and standing snapshot before writing code, overwrite those docs when facts change, and keep the docs tree small by adding, archiving, or deleting files so the next agent can hop on. Use before any non-trivial change, after landing or abandoning work, when choosing whether a doc should be archived or deleted, when a plan's status moves, when a bug is found or fixed, when docs look scattered, and whenever asked to update docs, hand off, or record what happened.
---

# Keep docs current

The next agent on this repo starts from files, not from this chat. If the
snapshot is stale they redo finished work, miss a stop-line, or write a second
"current state" file. If the tree is a dump they cannot hop on. **Reading
first, overwriting after, and pruning the tree is the same job.**

**This exists because it already went wrong.** Two dated handoffs
(`2026-08-21-001-local-path-handoff.md`, `2026-08-23-001-path-a-cold-start.md`)
were deleted as duplicates of `docs/agent-status.md`. Agents that skipped the
snapshot treated yesterday's plan as today's state.

## When this matters most

Run it before writing code, and again in the same turn as the change — not as a
follow-up the next agent is supposed to remember.

- Any change that moves git, what's in the tree, a goal, a stop-line, or next work.
- Landing, abandoning, or superseding a plan under `docs/plans/`.
- Finding, fixing, or reclassifying a defect.
- A measurement that other agents would act on (tee, gold pass/fail, RAM, stall).
- Anything that looks like a handoff, "where we are", or "what to do next".
- The docs tree looking scattered: duplicate owners, a finished plan still in
  Open, a new standing file next to one that already owns the fact.

Skip only when **no fact another agent would act on moved**: a typo, a comment,
formatting, a test that locks in already-documented behaviour. When in doubt,
update. Stale is worse than a one-line touch.

## Which file owns which fact

One fact, one file. Do not copy the snapshot into a plan, or a plan into the
snapshot.

| File | Owns |
|---|---|
| [`docs/README.md`](../../../docs/README.md) | Hop-on map: where architecture, conventions, and docs live. Keep the path obvious. |
| [`docs/agent-status.md`](../../../docs/agent-status.md) | Git, what's in the tree, product goals, next work, do-not list. **Overwrite in place.** |
| [`docs/plans/README.md`](../../../docs/plans/README.md) | Catalog of *our* plans: Open / in tree / archive. |
| The plan for this job | Spec, leftovers, tee record for *this* job. Status line must match the catalog. |
| [`docs/plans/archive/`](../../../docs/plans/archive/README.md) | Done, superseded, walks, diaries. Not a place to start work. |
| [`docs/known-bugs.md`](../../../docs/known-bugs.md) | Defects we ship. Delete the entry when fixed; add with the next id when new. Never reuse an id. |
| [`docs/local-model-path.md`](../../../docs/local-model-path.md) | Path A tensions and decisions. Not outright bugs. |
| [`docs/identity-surface.md`](../../../docs/identity-surface.md) | Names that may change vs names that strand installs. |
| [`AGENTS.md`](../../../AGENTS.md) | Always-on rules. Keep short; do not park state here. |

Plans that appear in `git diff --stat upstream/main -- docs/plans` are ours,
including `docs/plans/archive/`. Other files in `docs/plans/` are upstream's —
do not rewrite those as a handoff.

## Process

### 1. Read before writing

In this order. Stop at the plan for *this* job; do not read the whole catalog.

1. [`docs/README.md`](../../../docs/README.md) — where to look.
2. [`docs/agent-status.md`](../../../docs/agent-status.md) — where we are, what
   not to do, what is already in the tree.
3. [`docs/plans/README.md`](../../../docs/plans/README.md) — pick the one **Open**
   (or in-tree spec) that matches the job.
4. That plan only.
5. If it might already be a known defect: [`docs/known-bugs.md`](../../../docs/known-bugs.md).
6. If it is Path A: [`docs/local-model-path.md`](../../../docs/local-model-path.md).
7. If it is brand, `appId`, data dir, or a name that looks like branding:
   [`docs/identity-surface.md`](../../../docs/identity-surface.md).

Do not start from a dated `*-handoff.md`, a walk log, `docs/plans/archive/`, or
`docs/superpowers/`. Walks are measurements; the snapshot is current.

Before writing code, say what you found that binds this job: the plan, whether
the work is already in the tree, any matching bug id, any stop-line. One short
paragraph is enough — same idea as `check-upstream-first` reporting before it
builds.

### 2. Overwrite after the change

Same turn as the code (or the decision to stop). A passing `pnpm test` with a
stale snapshot is an incomplete change.

- **`docs/agent-status.md`**: edit the existing sections. Bump "Last updated".
  Keep git, "In the tree", "Next work", and "Do not" honest. If the work is
  uncommitted, say uncommitted. If it shipped, take it out of "uncommitted".
  Do not append a dated section or a session diary.
- **Plan + catalog**: flip status if it moved (`proposed` → `in tree`). If the
  plan is no longer Open, **archive or delete** it (the rule below) — do not
  leave it in Open.
- **`docs/known-bugs.md`**: delete a fixed entry; add a new one with the next
  `B-NN` id. A heading that still says `open` while the body says fixed is how
  [B-14](../../../docs/known-bugs.md) already lies — believe and fix both.
- **Tensions / identity / hop-on map**: only if those facts moved. A new
  standing doc gets a row on `docs/README.md` the same turn.

Never create `docs/plans/YYYY-MM-DD-*-handoff.md`. Never add a second standing
snapshot. The deletion of the two handoffs is the precedent.

### 3. Leave the map consistent

After the edit, these must not contradict each other:

- agent-status "In the tree" vs the plan's status vs `plans/README.md`
- agent-status "Next work" vs a plan that already landed
- a bug id cited as open that was deleted, or deleted while still open in the snapshot
- `docs/README.md` vs files that actually exist (no links into a dump that moved)

If two files disagree, the snapshot wins for *now*, and the other file is what
you fix in this turn.

### 4. Keep the workspace organized

Same turn. A new agent must be able to hop on from `docs/README.md` without
wading a dump. The deletion test decides *delete vs keep*. For a plan that
left Open, keep means **archive**, not leave it in Open.

- **Add** only when a fact has no owner. New plans go under `docs/plans/` with
  an Open-table row the same turn. Do not invent a shadow tree
  (`docs/superpowers/`, a second `docs/plans/`, a "notes" folder).
- **Overwrite** the owner. Do not write a second copy of the same fact.
- **Archive or delete** using the rule below. If `docs/plans/` looks like
  everything is equally current, the catalog is wrong. Fix it in this turn.

### 5. Archive vs delete

Two different verbs. Mixing them is how stop-lines vanish and how dumps grow.

**Default for a plan that left Open: archive. Default for a duplicate or
pass-through: delete. When in doubt, archive** — git still has deletes, but
tee records and "do not resurrect X" reasoning are what the next agent
actually needs, and those die if the file is gone.

#### Archive (`git mv` into `docs/plans/archive/`)

The file still earns its keep as history or as a stop-line.

- The work landed and the spec, leftovers, or tee still explain *why*.
- The plan was superseded or abandoned — keep the old sketch so nobody
  rebuilds it from memory (image-gen 001/002, Instruct 4B 003).
- It is a walk log, diary, or measurement (not the snapshot).
- It is a stop-line ("do not implement X"). Also leave **one line** in
  [`docs/plans/README.md`](../../../docs/plans/README.md); do not rely on
  the file sitting in archive unread.

Same turn: drop it from Open, add a row to
[`docs/plans/archive/README.md`](../../../docs/plans/archive/README.md),
fix inbound links (`archive/` prefix from live docs, `../` from inside
archive). Do not rewrite the archived body into a second snapshot.

#### Delete

The file (or entry) fails the deletion test: removing it loses nothing the
map already says.

- A second snapshot, handoff, or "current state" file. Precedent: the
  2026-08-21 morning handoff and 2026-08-23 cold-start were **deleted**,
  not archived. Git still has them.
- A pass-through: every fact already lives on the owner
  (`agent-status.md`, a plan, `known-bugs.md`).
- A `known-bugs.md` **entry** whose defect is fixed. Never reuse the id.
  Do not delete the `known-bugs.md` file.
- An empty standing doc after its fact moved to the owner.

Same turn: fix every inbound link. Do not leave a stub whose only sentence
is "deleted, see X" — that is either a catalog line or an archive
tombstone, not a new file.

#### Never archive

- Upstream files. Do not `git mv` theirs into our archive.
- Living standing docs (`AGENTS.md`, `docs/README.md`, `docs/agent-status.md`,
  `docs/plans/README.md`, `known-bugs.md`, `local-model-path.md`,
  `identity-surface.md`). Overwrite in place.
- Work that is still Open.

#### Never delete

- Upstream files (`git diff --stat upstream/main -- docs` does not list
  them), including `docs/superpowers/`.
- The standing docs listed above, as files.
- An in-tree spec that is still how the landed work is supposed to behave
  — that stays in the **In tree** table, not in archive and not in `/dev/null`.

## What not to write

- A new current-state file because this chat feels special.
- "Session notes", "handoff", or "cold start" documents under `docs/plans/`.
- Restating AGENTS.md rules inside the snapshot.
- Inventing brand slots, publish URLs, or `appId` values in docs to look complete.
- Updating docs for work you did not actually land (or marking landed work as still a proposal).
- A finished plan left in Open "for context". Archive it.
- Deleting a plan because it is old. Age is not the test; the deletion test is.
