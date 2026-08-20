---
name: diagnosing-bugs
description: Diagnosis loop for hard bugs and regressions in the harness, the drivers, or the app. Use when the user says debug this, or reports something broken, hanging, throwing, or silently doing nothing. Adapted from mattpocock/skills.
---

# Diagnosing bugs

A discipline for hard bugs. The easy ones do not need it; skip straight to the
fix and say you did.

## Phase 1: build a feedback loop

**This is the skill.** With a tight pass/fail signal that goes red on *this*
bug, everything after is mechanical. Without one, reading code produces
confident theories and no fix.

Spend disproportionate effort here, in roughly this order:

1. **A vitest test at the seam that reaches the bug**, run alone:
   `pnpm vitest run <file> -t "<name>"`. Seconds, deterministic, and it becomes
   the regression test for free.
2. **A driver contract test** against the scripted fake CLIs in
   `server/testing/` (`fake-claude-cli.ts`, `fake-codex-app-server.ts`,
   `fake-acp-cli.ts`). Failure modes toggle by env var — `FAKE_CLAUDE_MODE=exit-early`
   and friends. **Extend a fake rather than mocking `child_process`**: the fakes
   are the only place a protocol-level bug is reproducible at all.
3. **The dump-file trick.** The fakes write what they were invoked with
   (`FAKE_CLAUDE_DUMP`), so "was this mounted / did the key reach argv / what
   did the prompt look like" is a file read, not a guess.
4. **The real HTTP surface.** `server/index.test.ts` boots the real server
   against a throwaway `HOME` — copy that setup and drive the route directly.
5. **The per-thread NDJSON logs** in `~/.openmausbot`, and the native protocol
   tee in `server/drivers/native.ts`. When a turn misbehaved once and will not
   do it again, that log is the repro. Note `elideBulk` truncates bulk payloads,
   so a base64 blob is deliberately not there in full.
6. **The real CLI.** Some questions are only answerable by the actual agent
   binary — whether Codex accepts a bare path for an image, what shape its
   approval request really takes. Two of this repo's nastiest bugs were settled
   this way after protocol reasoning had produced the wrong answer twice.

### Tighten it

Faster, sharper, more deterministic. Assert the user's exact symptom, not
"didn't throw". A test that needs a timeout to pass is wrong — wait on the event
that proves the behaviour with `recordEvents(...).until(...)`, per
`CONTRIBUTING.md`. Never point a repro at the real `~/.openmausbot`.

### Done when

You can name **one command you have already run** that drives the real code path,
asserts the actual symptom, is deterministic, and finishes in seconds. If you
catch yourself building a theory before that command exists, stop — jumping to a
hypothesis is the exact failure this prevents.

If you genuinely cannot build one, say so, list what you tried, and ask for the
environment or a redacted log rather than proceeding on vibes.

### Secrets

The logs and dumps here carry API keys and the per-boot comms token. `redact.ts`
covers the native tee, but anything you paste into the conversation you have
redacted yourself. Quote the lines that carry the signal, not the whole frame.

## Phase 2: reproduce and minimise

Watch the loop go red, and confirm it is the user's failure rather than a
neighbouring one — the wrong bug gets the wrong fix. Then cut inputs, config and
steps one at a time until every remaining element is load-bearing.

## Phase 3: hypothesise

Write **3-5 ranked, falsifiable** hypotheses before testing any of them, each
stating its prediction: "if X is the cause, then Y makes it disappear." A
hypothesis with no prediction is a vibe — sharpen it or drop it. Show the list
before testing; the user often re-ranks it instantly.

Beware the plausible-and-wrong story. The first diagnosis of the rejected MCP
calls was a mode setting, which read perfectly and was not it; the cause was the
request shape, which only the real CLI revealed.

## Phase 4: instrument

One probe per prediction, one variable at a time. Prefer a breakpoint or a
targeted log at the boundary that distinguishes two hypotheses over logging
everything. Tag debug output with a unique prefix like `[DEBUG-a4f2]` so cleanup
is one grep.

## Phase 5: fix, with a regression test

Write the test first, at a seam that exercises the real bug pattern.
`CONTRIBUTING.md` requires one for new server behaviour anyway. If no honest
seam exists, that is itself the finding — say so rather than writing a shallow
test that gives false confidence.

## Phase 6: cleanup

- The original repro no longer reproduces.
- The regression test passes, or the missing seam is documented.
- Every `[DEBUG-...]` line is gone.
- `pnpm typecheck && pnpm test` are green.
- The hypothesis that turned out correct is stated in the commit message, so the
  next person debugging this learns what you learned.
