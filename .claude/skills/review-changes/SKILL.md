---
name: review-changes
description: Review changes since a fixed point (commit, branch, tag, or merge-base) along two separate axes — Standards (does it follow CONTRIBUTING.md and this repo's house rules?) and Spec (does it do what docs/plans asked for?). Use when asked to review a branch, a merge, work in progress, or "check the work we just did". Adapted from mattpocock/skills.
---

# Review changes

Two-axis review of the diff between `HEAD` and a fixed point:

- **Standards** — does it conform to [`CONTRIBUTING.md`](../../../CONTRIBUTING.md) and the
  house rules below?
- **Spec** — does it faithfully implement the plan it came from?

Run the axes as **parallel sub-agents** so neither contaminates the other, then
report them side by side. A change can pass one and fail the other: code that
follows every rule while implementing the wrong thing, or code that does exactly
what was asked while breaking the conventions.

## 1. Pin the fixed point

Whatever the user names — a SHA, `upstream/main`, `HEAD~4`. If they did not say,
ask. Confirm it resolves and the diff is non-empty *before* spawning anything:

```sh
git rev-parse <point>
git diff <point>...HEAD --stat
git log <point>..HEAD --oneline
```

Three dots, so the comparison is against the merge-base.

## 2. Find the spec

In order: a plan under `docs/plans/` matching the feature (they are named
`YYYY-MM-DD-NNN-<slug>-plan.md`); a path the user passed; the merge or commit
messages, which in this repo carry the reasoning. There is no issue tracker —
if none of those exist, skip the Spec axis and say so.

## 3. Standards the reviewer must carry

`CONTRIBUTING.md` is the authority. The rules it states that a diff most often
breaks, and which tooling does **not** catch:

- **Match the altitude.** Plain Node on the server, no frameworks, one store, one
  event bus. Thirty lines beat a dependency.
- **Secrets are write-only.** No key in argv where another local process can read
  it, none logged, none echoed back — the API reports `configured` booleans only.
  A new credential joins `syncCredentialEnv` and `WORKSPACE_CREDENTIAL_ENV`, or it
  leaks into every spawned CLI.
- **Never build command strings for a shell.** No `shell: true`; argv only.
- **Platform gates.** `server/` stays portable Node; macOS-only code lives in
  `electron/` behind a `darwin` check. POSIX-only calls need a Windows equivalent,
  not a silent failure.
- **Driver contract.** `decodeConfig` throws, `create` rejects, a broken CLI
  surfaces as `snapshot() → unavailable` — never a hang or a crash.
- **Tests.** New server behavior brings one. No sleeps: wait on the event
  (`recordEvents(...).until(...)`). Never touch the real `~/.openmausbot`.
- **Comments explain why.** This codebase's comments carry trade-offs and
  constraints, not narration. A comment restating the line below it is noise.

**Skip anything tooling already enforces.** `pnpm lint` carries a large
pre-existing baseline of `anti-slop` findings across upstream's own files;
re-reporting those is pure noise. Only flag a lint finding if the diff *added* a
pattern the surrounding file does not already use.

### Smell baseline

Beyond the documented rules, flag these as **judgement calls, never violations**
(Fowler, _Refactoring_ ch.3). A documented repo standard always overrides them.

Mysterious Name · Duplicated Code · Feature Envy · Data Clumps · Primitive
Obsession · Repeated Switches · Shotgun Surgery · Divergent Change · Speculative
Generality · Message Chains · Middle Man · Refused Bequest

## 4. Spawn both sub-agents in parallel

**Standards sub-agent** gets: the diff and commit list, `CONTRIBUTING.md`, and
the rules and smell baseline from step 3 pasted in full — it cannot see this
file. Brief it to report, per file or hunk, (a) every place the diff breaks a
documented rule, citing the rule, and (b) any baseline smell, naming it and
quoting the hunk. Hard violations and judgement calls must be labelled as such.
Under 400 words.

**Spec sub-agent** gets: the diff and commit list, and the plan's contents.
Brief it to report (a) requirements missing or only partly done, (b) behaviour in
the diff nobody asked for, and (c) requirements that look done but look wrong.
Quote the plan line for each finding. Under 400 words.

## 5. Fork divergence

Not an axis — one check this reviewer owns, because it is invisible in a diff
against our own history:

```sh
git diff --stat upstream/main
```

Every file listed should be something upstream genuinely lacks. A file we edited
that upstream also owns is a merge conflict we inherit forever. See
`check-upstream-first`.

Because this fork is sold, that list is also our record of what we own. Flag any
new dependency, any hardcoded endpoint or key, and any default that points at
upstream — `commercial-fork` has the standard.

On a merge review, run `pnpm check:upstream-license` (or confirm it was green
before the merge). A merge that landed on a red license is a spec fail — the
gate in `AGENTS.md` does not yield to a "fetch and merge" order.

## 6. Report

Present the two reports under `## Standards` and `## Spec`, then the divergence
note. Do **not** merge or rerank the axes — the separation is the point. Close
with the worst issue *within each axis*, not a single winner.
