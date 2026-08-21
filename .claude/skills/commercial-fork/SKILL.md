---
name: commercial-fork
description: How this fork stays sellable — what we own versus what we inherit, where proprietary code goes, the Apache-2.0 notices that must survive into a build, and the defaults that must never point at upstream. Use before adding a dependency, before editing a file upstream owns, when adding telemetry or any outbound network call, when touching branding or release configuration, and whenever asked what we may legally ship.
---



# Commercial fork

This repo is modified and sold. That does not change what the code should look
like nearly as much as people expect, but it makes a few things load-bearing
that would otherwise be housekeeping. Read this before proposing a
reorganisation, adding a dependency, or wiring anything that talks to a server.

## Remotes: read from upstream, write only to ours

`origin` is **ours** (`RadZ3000/OpenMausBot`) and is the only place anything is
ever pushed. `upstream` (`milind-soni/OpenMausBot`) is a source we read and
nothing more. Our work is the product; it does not go back.

Intent alone does not enforce this, so the push URL is disabled outright. A
fresh clone will not have that, so set it up first:

```sh
git remote set-url --push upstream DISABLED
git remote -v      # upstream should read: DISABLED (push)
```

`git fetch upstream` keeps working normally; `git push upstream` now fails
locally, before any network call, instead of relying on GitHub to reject us.

## What we inherit

`LICENSE` is **Apache-2.0**. `NOTICE` records that the project was relicensed
from MIT with the consent of the contributors whose copyright predates the
change, so the provenance chain is clean and documented. `CONTRIBUTING.md`
places contributions under Apache-2.0 too — if a summary tells you it says MIT,
it is wrong; check the file.

Apache-2.0 asks four things of us, and physical separation of code is not among
them:

1. Keep `LICENSE` and `NOTICE` in anything we distribute.
2. Retain the attribution notices already in the files.
3. Mark files we modified as modified (§4(b)).
4. We may license our own additions however we like, including proprietary.

It also, in §6, grants **no trademark rights**. The name, the mascot, and the
brand are not ours by way of the licence, whatever we do to the code.

## The rule that does the most work

Keep the divergence from upstream small and **additive**, and it doubles as the
ownership record at no cost:

```sh
git diff --stat upstream/main    # the files we own, maintained for free
```

Every file in that list is ours. Every file absent from it is upstream's,
unmodified, carrying its own notices. Nobody has to annotate lines, keep a
ledger, or reconstruct history later, and the §4(b) burden stays near zero
because there is barely anything to mark.

So the working rule is: **a new capability is a new file at an existing seam,
registered with one line.** Never edit an upstream file when a new file will do.

`check-upstream-first` gives the other half of this argument — editing their
files is a merge conflict we inherit forever. Same rule, two reasons.

### The seams that already exist

The repo is unusually well set up for this. Reach for these before inventing a
structure:

- the driver SPI in `server/contracts.ts` and the drivers under `server/drivers/`
- MCP proxies, e.g. `server/drivers/image-proxy.ts`, mounted per turn
- the integrations map assembled in `server/index.ts`
- the shipped skills catalog in `skills/`
- plain modules in `src/lib/`, components in `src/components/`



### Worked example

Making telemetry consent-gated touched **four** existing files (two of them by
one or two lines) and put everything real into new ones: `src/lib/analytics-core.ts`
holds the policy, `src/components/AnalyticsSettings.tsx` the UI,
`src/lib/analytics-core.test.ts` the tests. `src/lib/analytics.ts` was rewritten
because it had to be, and it is now substantially ours. That shape — new files
carrying the weight, existing files barely disturbed — is the target.

## Do not reorganise into `upstream/` and `custom/`

This gets suggested regularly. Reject it.

Moving upstream's code into an `upstream/` directory renames every path in the
repo, which turns every future merge into a manual reconstruction — the precise
cost this fork is organised to avoid. It also defeats its own purpose: moving a
file *is* modifying it, so the proposal takes on the §4(b) marking burden for
the entire tree in order to avoid it for a handful of files.

Provenance is tracked by the diff against upstream, not by directory layout.

## Dependencies

Every bundled dependency's licence travels with the packaged binary, so a
routine version bump is how copyleft arrives unnoticed.

```sh
pnpm check:licenses
```

Runs in CI on all three platforms, because native packages fan out into per-OS
builds and a copyleft binary can be present on one runner and absent elsewhere.
Permissive terms pass automatically; anything else must be named in `REVIEWED`
in `scripts/check-licenses.mjs` **with the reason it is acceptable**. Do not add
an entry to make the build go green — decide first whether we may ship it.

State as of the last audit: no GPL, AGPL, or SSPL anywhere, and nothing without
a declared licence. The reviewed exceptions are weak copyleft that is either
shipped unmodified under notices we already carry (`@trycua/cua-driver`,
`@ubjs/*`) or never packaged at all (`lightningcss` is build-time;
`@img/sharp`'s LGPL libvips arrives via `miniflare`, a dev tool).

The native runtime's notices, licence texts, and CycloneDX SBOM are already
maintained under `third_party/cua-driver/`, generated by
`scripts/generate-cua-sbom.mjs`. Keep them current rather than starting a
parallel scheme.

## Nothing may default to upstream

A fork that inherits upstream's endpoints reports our customers to the person we
forked from. Treat every such default as a bug.

`pnpm check:distribution` enforces this list rather than trusting it to be read.
It scans everything that ships, fails on an upstream reference it has not been
told about, and — with `--release` — fails while any remain at all. Adding a
bullet here means adding an `ACCEPTED` entry in `scripts/check-distribution.mjs`,
and vice versa.

- **Telemetry** — the analytics destination is build configuration
(`VITE_ANALYTICS_KEY`) and is unset by default; sending additionally waits on
explicit consent. Never reintroduce a hardcoded key. Never add an outbound
call that is on by default.
- **Update feed** — `electron-builder.yml` still publishes to and updates from
`milind-soni/openmausbot-releases`. **A build handed to anyone must not carry
this**, or it will update itself onto upstream's product.
- **Connected-apps broker** — `electron/main.mjs` falls back to
`openmausbot-composio.milindsoni201.workers.dev` whenever `app.isPackaged`.
So a packaged build routes a customer's Gmail, Slack, Calendar and Notion
traffic through upstream's Cloudflare Worker, on upstream's Composio key, with
a per-installation token in upstream's D1. It never fires in development,
which is exactly why it is easy to ship. Upstream's own README tells forks to
deploy their own Worker and set `OMB_COMPOSIO_BROKER_URL`; do that before any
build leaves. `cloudflare/composio-broker/` is also the right model for any
proxy of our own — per-install tokens hashed in D1, rate-limit namespaces, and
a `REGISTRATION_MODE` switch.
- **Documentation links** — `src/components/ApiKeys.tsx:273` and
`src/components/LinuxLocalControl.tsx:16` open upstream's GitHub repo. A
customer clicking "docs" and landing on the project we forked from undoes a
lot of the impression the rest of the build works for.
- **Team library** — `server/team-library.ts:4-5` fetches starter teams from
`milind-soni/openmausbot-teams` over `raw.githubusercontent.com` at runtime,
and `src/components/TeamLibraryPanel.tsx:20` links the same repo. Content we
ship, served from a repository upstream can change or delete. Either host our
own or turn the feature off in our builds.
- **Package metadata** — `package.json`'s `homepage`, `repository` and `author`
are upstream's URLs and upstream's email, and they travel into installer
metadata and the About surface. So does the Linux `maintainer` in
`electron-builder.yml`.
- **Brand** — `appId`, `productName`, the mascot, and the maintainer field are
upstream's marks, and Apache §6 does not license them.

`docs/identity-surface.md` maps the whole naming surface, including which names
are *not* branding and must survive a rebrand untouched — data directories,
`omb-*` storage keys, the `openmausbot://` scheme, `_openmausbot._tcp`, the
`openmaus.team` wire format, and the health-probe response Electron checks
before adopting a server. Renaming one of those strands installs rather than
rebranding anything.

## Before a build leaves the building

- `pnpm check:licenses` passes, and any new `REVIEWED` entry has a real reason.
- `LICENSE` and `NOTICE` ship, plus the `third_party/cua-driver/` notices.
- Files we modified carry a modification notice; keep this cheap by not
modifying many.
- `pnpm check:distribution --release` passes — no default points at an upstream
endpoint, feed, or key.
- Our own copyright header goes on files we wholly wrote — not on files we
edited, which keep theirs and gain a "modified by" line.

**There is no runbook for this yet, and the ones in the tree are traps.**
`docs/releasing.md`, `.claude/skills/windows-release/SKILL.md` and
`ios/AppStore/RELEASE.md` all arrived in the merge, are upstream's files
unmodified, and describe publishing to upstream's release repo with upstream's
credentials. Following them ships our product into their update feed.
`docs/plans/2026-08-20-004-release-channel-plan.md` records what has to be
decided before a runbook of ours can exist.

## What this is not

Not legal advice, and not a substitute for a review before a significant deal.
It is the set of decisions already made here, written down so they are not
re-litigated or quietly reversed.