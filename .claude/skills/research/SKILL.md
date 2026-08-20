---
name: research
description: Investigate a question against primary sources and capture the findings in the repo. Use when a decision turns on how an agent CLI, protocol, or third-party API actually behaves, or when reading legwork should run in the background. Adapted from mattpocock/skills.
---

# Research

Run it as a **background agent** so the reading happens while you keep working.

## What counts as a primary source here

Most of what this repo needs to know is about other people's programs — Codex,
Claude Code, the ACP agents, Cua, Composio — and their write-ups go stale faster
than the tools change. Ranked by trust:

1. **The behaviour of the installed binary.** A probe beats every document.
2. **The tool's own source or protocol schema**, at the version we actually run.
3. **First-party docs and changelogs**, pinned to that version.
4. **`upstream/main`.** For anything about this product, upstream is a primary
   source and often already has the answer — see `check-upstream-first`.

A blog post or a secondary summary is a lead, not a finding. Follow every claim
back to the thing that owns it.

## Prefer a probe to an argument

The two costliest questions in this codebase's history — what shape Codex's
approval request takes, and whether an engine handed a bare file path can read
the image — were both argued from protocol knowledge, twice, wrongly, and then
settled in one run against the real CLI. If a question can be answered by
running something, run it. Say what you ran and what came back.

Version matters: pin what you tested against. "Codex accepts this" is a claim
with a shelf life, and agent CLIs change their protocols between minor releases.

## Capture it

Write the findings to one Markdown file, citing the source for each claim:

- A durable fact about how we integrate something → `docs/`, matching the
  existing files there.
- Input to a piece of work → the plan in `docs/plans/`, named
  `YYYY-MM-DD-NNN-<slug>-plan.md` like its neighbours.
- Anything superseded later → go back and say so in the document. A note that
  quietly stops being true is worse than no note.

Say where you put it. Do not paste secrets, tokens, or transcript contents into
the file.
