---
name: module-design
description: Shared vocabulary for designing deep modules in this codebase. Use when designing or reshaping a module's interface, deciding where a seam goes, judging whether an abstraction earns its keep, or when another skill needs this vocabulary. Adapted from mattpocock/skills.
---

# Module design

Design **deep modules**: a lot of behaviour behind a small interface, at a clean
seam, testable through that interface. This repo already has one, and it is the
reference for the rest: `server/contracts.ts`.

## Vocabulary

Use these words exactly. Consistency is the point — do not substitute
"component", "service", "API", or "boundary".

**Module** — anything with an interface and an implementation. Scale-agnostic: a
function, a file, a driver, a tier-spanning slice.

**Interface** — everything a caller must know to use it correctly. Not just the
type signature: the invariants, ordering, error modes, and required config too.
`ProviderDriver` is a small type; its interface also includes "`decodeConfig`
throws, `create` rejects, a broken CLI surfaces as `unavailable`" — facts a
caller cannot skip and TypeScript does not carry.

**Implementation** — what is inside. Distinct from **adapter**: our drivers are
adapters at a seam whose implementations differ wildly in size.

**Seam** (Feathers) — a place you can change behaviour without editing in that
place. Where a module's interface lives. Say seam, not boundary.

**Depth** — leverage at the interface: how much behaviour a caller or a test can
exercise per unit of interface they must learn. Deep = small interface, large
implementation. Shallow = an interface nearly as complex as what is behind it.

**Leverage / locality** — what depth buys. Callers get capability per unit
learned; maintainers get changes, bugs and fixes concentrated in one place.

## The reference seam

The driver SPI is the shape to imitate. Adding a provider is one file plus one
registration line in `builtIn.ts`. Everything a provider does — spawning, the
protocol, permissions, MCP mounts, usage — sits behind a small interface, and
the registry can downgrade any failure to an unavailable shadow precisely
*because* the seam is real. The bus takes only canonical `RuntimeEvent`s, so no
driver's vocabulary leaks across it.

Note what makes it real rather than hypothetical: many adapters vary across it.
**One adapter is a hypothetical seam; two or more is a real one.** Do not
introduce a seam until something actually varies.

## Tests are the same surface

Callers and tests cross the same seam. The contract tests drive real drivers
through scripted fake CLIs — at the interface, not past it. If a test needs to
reach behind the interface, the module is usually the wrong shape. This is also
why `CONTRIBUTING.md` says extend the fakes rather than mock `child_process`:
mocking punches through the seam instead of using it.

## Judging an abstraction

**The deletion test.** Imagine deleting the module. If complexity vanishes, it
was a pass-through. If it reappears across N callers, it was earning its keep.

**Our worked example of failing it.** The abandoned attachment stack added a
module, a capability flag, and per-driver image-block construction in every
driver — a seam across which every adapter did something different, for one
behaviour. Upstream's version passes a file path in the prompt text and has no
seam at all, because nothing needed to vary. Deleting theirs would cost a few
lines; deleting ours would have cost a module and four driver branches. That is
the deletion test answering before the merge did.

This is the local form of `CONTRIBUTING.md`'s **match the altitude**: plain Node
on the server, no frameworks, one store, one event bus, thirty lines over a
dependency. Speculative generality is the failure mode this codebase is most
prone to, because every driver looks like it wants a hook.

## Designing for testability

- **Accept dependencies, do not construct them.** The registry hands a driver
  its config; the store is passed a selection function.
- **Return results rather than mutating.** Easier to assert, and it keeps the
  event bus the single channel for anything that must be observed.
- **Keep the surface small.** Fewer methods, fewer parameters, less test setup.

## Rejected framings

- Depth as a ratio of implementation lines to interface lines — rewards padding.
  Use depth-as-leverage.
- "Interface" meaning the TypeScript `interface` keyword. Too narrow; see above.
- "Boundary" — overloaded by DDD. Say seam.
