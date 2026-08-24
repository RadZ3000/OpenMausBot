# AGENTS.md

Always-on conventions for any AI agent working in this repo, in the shortest form
that still binds. The reasoning behind them lives in `.claude/skills/`, indexed at
the bottom — plain files any agent can read even when its host does not load them
automatically.

Keep this file short, and state each rule in one place only. Two copies of a rule
drift, and a drifted rule is worse than no rule.

## What this is

A local-first Electron chat app where each bot is a real agent CLI, driven by a
Node harness on `127.0.0.1:8799`. Two processes: `src/` is the React app (HTTP
commands out, one SSE stream in) and `server/` owns every agent process. Read
`server/contracts.ts` first — it is the architecture in one file.

## This fork is sold

`origin` (`RadZ3000/OpenMausBot`) is ours and the only push target. `upstream`
(`milind-soni/OpenMausBot`) is read-only and its push URL is `DISABLED`; never
push there.

Keep the divergence from upstream small and **additive**: a new capability is a
new file at an existing seam, registered with one line. `git diff --stat
upstream/main` is simultaneously our ownership record and our future merge cost,
so never edit an upstream file when a new file will do. Before creating anything
under `server/`, `src/lib/`, or `src/components/`, check whether upstream already
has it — that mistake has already cost this repo a whole feature.

No default may point at an upstream endpoint, update feed, broker, or key.

## Before writing code

Stop at the first rung that holds:

1. Does this need to exist at all? If the need is speculative, skip it and say so in one line.
2. Is it already in this codebase? Reuse it. Re-implementing what sits a few files over is the most common failure here.
3. Does the Node stdlib or a platform feature cover it? Use it.
4. Does an already-installed dependency solve it? Use it. Thirty lines beat a new dependency.
5. Only then: the minimum that works, at a seam that already exists.

Climb the ladder *after* reading the code the change touches and tracing the real
flow — never instead of it. A small diff in the wrong place is a second bug.

Two more that do most of the work here, because every driver looks like it wants a
hook: **no seam until something actually varies** (one adapter is a hypothetical
seam, two or more is a real one), and the **deletion test** — if deleting a module
makes complexity vanish it was a pass-through, and if the complexity reappears
across callers it was earning its keep.

Never simplify away trust-boundary validation, secret handling, approval and
permission boundaries, or a test for new server behaviour.

## Hard constraints

- **Match the altitude.** Plain Node on the server, no frameworks, one store, one event bus.
- **Never build command strings for a shell.** No `shell: true`, no `cmd.exe` quoting; everything travels through argv. On Windows, resolve `.cmd` shims to their JS entry and spawn `process.execPath`.
- `server/` stays portable Node. Platform-specific code belongs in `electron/`, behind a gate. POSIX-only calls need a real Windows equivalent, not a silent failure.
- Extend the scripted fake CLIs in `server/testing/` rather than mocking `child_process` — mocking punches through the seam instead of using it.
- No sleeps in tests. Wait on the event that proves the behaviour. Never touch the real `~/.openmausbot`.
- API keys are write-only: never log them, echo them in responses or events, or bake them into argv.
- Never hand-edit `dist-server/`; it is build output.

## Verifying a change

```sh
pnpm typecheck
pnpm test
pnpm lint               # CI does not run this — run it yourself
pnpm check:electron     # desktop-shell changes
pnpm check:licenses     # any dependency change
pnpm check:distribution # anything that ships a URL, endpoint, or key
```

`pnpm lint` carries the `anti-slop` rules in `tools/oxlint/`, which reject
type-system escape hatches (`as unknown as`, `unknown` parameters and returns,
`Reflect.get`, runtime `typeof`, module mocking). If the type checker is fighting
you, that is a signal about the design, not an invitation to cast.

## Current state and goals

[`docs/agent-status.md`](docs/agent-status.md) is the standing snapshot (git,
Path A, computer loop, what to do next, what not to do). **Overwrite it** when
facts change; do not add another dated handoff. Plan catalog:
[`docs/plans/README.md`](docs/plans/README.md).

## The skills, and when to read them

Folders under `.claude/skills/` — open `SKILL.md` in that folder. Names below
match the folder.

| Skill (folder under `.claude/skills/`) | Read it when |
|---|---|
| `check-upstream-first` | Before any non-trivial feature or new file under `server/` or `src/`. |
| `commercial-fork` | Adding a dependency, touching branding, telemetry, release config, or any outbound call. |
| `module-design` | Shaping a module's interface, placing a seam, judging whether an abstraction earns its keep. |
| `diagnosing-bugs` | Something is broken, hanging, throwing, or silently doing nothing. |
| `review-changes` | Reviewing a branch, a merge, or the work just done. |
| `upstream-merges` | Merging upstream or resolving conflicts without widening divergence. |
| `research` | A decision turns on how an agent CLI, protocol, or third-party API actually behaves. |
| `windows-release` | Never as written — it is upstream's, and it publishes to upstream's feed. We have no release runbook yet; read [`docs/plans/2026-08-20-004-release-channel-plan.md`](docs/plans/2026-08-20-004-release-channel-plan.md) instead. |

`CONTRIBUTING.md` is **upstream's** contributor guide (their clone URL, their
release repo). House rules for this fork are this file. Do not follow its
remotes or publish steps. Known defects, including ones in upstream code we
ship, are listed in [`docs/known-bugs.md`](docs/known-bugs.md) — check it
before assuming something you just hit is new. Path A tensions:
[`docs/local-model-path.md`](docs/local-model-path.md).
