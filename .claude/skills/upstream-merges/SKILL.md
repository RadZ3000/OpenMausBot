---
name: upstream-merges
description: Merge milind-soni/OpenMausBot into this fork and resolve the conflicts without losing our features or widening our divergence. Use when pulling upstream, resolving an in-progress merge or rebase, or reconciling a feature we built against one upstream shipped. Adapted from mattpocock/skills.
---

# Upstream merges

Merging upstream is this fork's most recurring high-stakes operation, and the
one where a wrong call is most expensive: a file we keep at a path upstream also
owns is a conflict we hand-resolve forever.

Before building anything, see `check-upstream-first`. This skill is for after
the divergence already exists.

## 1. Know what you are merging

```sh
git fetch upstream
git log --oneline HEAD..upstream/main
git diff --stat upstream/main
```

The second command is what is coming. The third is what we own, and it is the
list you are defending. Read it before you start — every entry you cannot
justify is a conflict you are about to pay for again.

Merge onto a branch, never straight onto `dev`. Commit our work first so there
is a recoverable base if the merge goes badly.

## 2. Resolve each hunk on ownership, not preference

The rule that settles most conflicts here:

- **A file upstream owns → take theirs, whole.** Not "mostly theirs". Byte
  identical, verified with `git diff upstream/main -- <path>` returning empty.
  Our version loses even when it is better, because the alternative is
  re-resolving it every merge for the life of the fork.
- **A file only we have → keep ours.**
- **A feature we both built → theirs wins at their path.** If ours genuinely
  does something theirs cannot, keep that part in a file they do not own, and
  write down why.

Understand the intent behind both sides before choosing: read `git show <sha>`
for the upstream commits touching the file, not just the commit titles. Never
invent new behaviour while resolving, and never `--abort` — resolve it.

## 3. Reconcile our features on top

Ours generally survive as additive layers: a capability flag in
`server/contracts.ts`, a mount in the turn paths, a proxy under
`server/drivers/`, a component in `src/`. After taking upstream's version of a
shared file, re-apply our additions to it deliberately rather than by keeping
our side of the hunk.

**Check what upstream built while you were away that our feature now has to join.**
This is the step that is easiest to skip and most expensive to miss: our image
generation predated upstream's encrypted credential store, so on first merge its
API key would have gone on writing itself to `config.json` in plaintext while
every other credential moved to the OS keychain. Nothing conflicted. Nothing
failed. For any credential we own, confirm it is registered in
`electron/workspace-credentials.mjs`, `electron/main.mjs`, `src/types/ogb.d.ts`,
`src/components/ApiKeys.tsx`, and both `syncCredentialEnv` and
`WORKSPACE_CREDENTIAL_ENV` in `server/config.ts`.

## 4. Take the whole feature, including its consequences

If upstream shipped a feature we are adopting, adopt its surface too. Their
image attachments landed with the tag rendering handled in one view and not the
other, so a room showed users raw `<attached-image path="..."/>` markup. Walk
the feature through every place it can appear — 1:1 and rooms, the export, the
iOS companion — rather than assuming their coverage is complete.

## 5. Prove it

```sh
pnpm typecheck
pnpm test
```

Both must be green before the merge is finished. Lint carries a large
pre-existing baseline that is mostly upstream's, so compare against that
baseline rather than chasing zero: the only question is whether *our* files
added anything new.

## 6. Leave the record honest

- `git diff --stat upstream/main` should now contain only things upstream
  genuinely lacks. Revert cosmetic drift — a reflowed call, a rename that only
  dodged a local we deleted, a deleted blank line. Each one is a permanent
  conflict bought for nothing.
- If the merge abandoned a design, say so **in the plan document**, not only in
  the commit message. A plan left describing code that no longer exists is worse
  than no plan, because the next reader follows it.
- Record the reasoning in the merge commit: what upstream did, what we dropped,
  and why theirs won.
