---
name: check-upstream-first
description: Check whether milind-soni/OpenMausBot already built a feature before implementing it here, and decide whether to adopt theirs or write our own. Use before starting any non-trivial feature, before creating a new top-level module under server/ or src/, and whenever a plan is written in docs/plans/. Also use when deciding how to reconcile a feature we already built against one upstream shipped.
---

# Check upstream first

This repo is a **one-way tracking fork**. `origin` is ours, `upstream` is
[milind-soni/OpenMausBot](https://github.com/milind-soni/OpenMausBot), and nothing
here is ever pushed there. That makes upstream a free source of work — and a
source of duplicated work if nobody looks.

**This exists because it already went wrong.** A full user-image-attachment
stack was built here — disk store, per-driver image blocks, plumbing through
`startTurn`, the steer queue and room turns, with tests — while upstream shipped
`feat: add secure image attachments (#295)` using the *same filename*,
`server/attachments.ts`. The whole thing was thrown away at merge. Ten minutes of
looking would have saved it.

## When this matters most

The cost is highest where it is least visible: a feature is not obviously
"upstream's" until you have already written it. Run this before, not after.

- Any new file under `server/`, `src/components/`, or `src/lib/`.
- Any change to the driver SPI in `server/contracts.ts`.
- Any new capability flag, HTTP route, or config section.
- Any plan written into `docs/plans/`.

## Process

### 1. Refresh

```sh
git fetch upstream
git log --oneline HEAD..upstream/main | head -40
```

If we are behind by more than a handful of commits, say so — the feature may
already be sitting in the gap.

### 2. Ask whether they built it

Search their history and their tree, not just ours. Both, because a feature can
land under a name we would not have picked.

```sh
git log --oneline upstream/main --grep=<feature>
git log --oneline HEAD..upstream/main -- <path we intend to touch>
git ls-tree -r --name-only upstream/main | grep -i <noun>
```

Then check the specific files we are about to create:

```sh
git cat-file -e upstream/main:<path we intend to create>
```

A hit here is the whole point. Two implementations of one idea at one path is a
permanent merge conflict, and we lose it every time because they own the file.

### 3. Read theirs before judging it

Read the diff, not the commit title: `git show <sha>`. Upstream sometimes solves
a problem in fewer lines by making a different trade — the attachment case turned
on their design handing engines a *path* rather than pixels, which looked like a
shortcoming and was not.

### 4. Settle it with a probe, not an opinion

Where the question is "does their simpler approach actually work", answer it
empirically against the real CLI rather than reasoning about the protocol. The
attachment question was settled in one run: given only a path, Codex opened the
file with its own `imageView` tool and read the image correctly.

### 5. Decide, and say why

- **Upstream has it** → take theirs, keep the file byte-identical, and layer our
  additions in files they do not own. Verify with
  `git diff upstream/main -- <path>` returning empty.
- **Upstream lacks it** → build it, and prefer paths and names they are unlikely
  to collide with.
- **Both have it** → theirs wins on files they own, unless ours does something
  theirs cannot; then keep ours in a *separate* file and note why.

Report the finding before writing code: which upstream commits are relevant,
what they do, and the recommendation.

## Keeping the divergence honest

After any merge, `git diff --stat upstream/main` should contain only things
upstream genuinely does not have. Anything else is a file we will hand-resolve
forever.
