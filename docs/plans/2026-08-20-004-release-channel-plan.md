# Releasing this fork: the channel we do not have yet

Status: proposed. Written after auditing every release-shaped file in the tree
against the rules in [`commercial-fork`](../../.claude/skills/commercial-fork/SKILL.md)
and the naming rules in [`identity-surface.md`](../identity-surface.md).

The product plan
([003](2026-08-20-003-product-foundation-plan.md)) says what to build. This says
how a build reaches a customer, which is the half nobody has written down.

## The finding

**Every release document in this repo was written by upstream, for upstream.**

`docs/releasing.md`, `.claude/skills/windows-release/SKILL.md`,
`ios/AppStore/RELEASE.md` and `.github/workflows/release.yml` all arrived in the
merge. None appear in `git diff --stat upstream/main`, so by this repo's own
ownership rule they are upstream's files, unmodified — and they describe
publishing to upstream's release repo with upstream's credentials.

That is not a documentation gap sitting quietly to one side. `AGENTS.md` routes
agents *into* it: its skill table says to read `windows-release` when "cutting or
publishing the Windows desktop build", and that skill says to run
`gh release upload v<version> --repo milind-soni/openmausbot-releases` and to
verify that `app-update.yml` **must** point at `milind-soni/openmausbot-releases`.
Following the house rules therefore means publishing our product into the update
feed of the project we forked from. The `commercial-fork` skill forbids exactly
this, four files away.

So the two authorities in this repo contradict each other, and the one that wins
is the one an agent is told to open when it is time to ship.

## What is actually true today

Audited, not assumed — `pnpm check:distribution` re-derives this list.

| Surface | Points at | Consequence for a customer |
|---|---|---|
| `electron-builder.yml:12-15` | `milind-soni/openmausbot-releases` | The app updates itself onto upstream's product |
| `.github/workflows/release.yml` (6 sites) | same, plus `secrets.RELEASES_PAT` | The pipeline publishes our build to their repo, or fails |
| `electron/main.mjs:27` | `openmausbot-composio.milindsoni201.workers.dev` | Gmail, Slack and Notion traffic routes through upstream's Worker on upstream's key |
| `server/team-library.ts:4-5` | `milind-soni/openmausbot-teams` | The Team Library fetches from a repo upstream controls, at runtime |
| `src/components/TeamLibraryPanel.tsx:20` | same | "Browse community teams" opens upstream's repo |
| `src/components/ApiKeys.tsx:273` | `milind-soni/OpenMausBot` docs | "Docs" lands the customer on the project we forked from |
| `src/components/LinuxLocalControl.tsx:16` | same | as above |
| `electron-builder.yml:152` | `Milind Soni <…@users.noreply.github.com>` | Upstream's maintainer is stamped into `.deb` metadata |
| `package.json:6,9,13` | upstream homepage, repository, author | Carried into installer metadata and the About surface |

The first three are recorded in `commercial-fork`. **The last six were not** —
they are added to that skill by this change.

The broker fallback deserves the emphasis the skill already gives it: it fires
only when `app.isPackaged`, so it is invisible in every development run and
active in every build we hand to anyone.

## The five decisions

None of these are engineering questions, and no code can be written past the
gate below until they are answered.

1. **`appId`.** Currently `com.openmausbot.app`. It is upstream's mark, and
   Apache-2.0 §6 grants no trademark rights. It is also, per
   [`identity-surface.md` §3](../identity-surface.md#3-packaging-identity--changes-once-deliberately),
   the one string that must be decided *once, before the first customer build* —
   changing it later gives the build a fresh `userData` directory and no update
   continuity with anything already installed. **This is the decision that is
   expensive to defer, and it is currently defaulted rather than made.**
2. **Product name.** `distribution.productName` already exists and is wired at
   two seams, so this is cheap — but it gates the fourteen Phase 2 strings and
   the packaging identity in §3 of the identity surface.
3. **Where releases live.** A GitHub releases repo of ours (public, so no token
   ships on customer machines — the reason upstream split theirs), or something
   else entirely. This sets the `publish:` block, `app-update.yml`, and whether
   `release.yml` can be reused with a changed constant or has to be rewritten.
4. **Signing identity — and on Windows this is now urgent, not eventual.**
   Whose Apple Developer ID signs and notarizes the macOS build, and whose
   certificate signs Windows. Both are legal-entity questions before they are
   technical ones. Note the constraint already recorded in
   `electron-builder.yml`: once Windows is signed, the certificate subject must
   stay stable forever or every installed user is stranded.

   **This decision was mis-ranked, and testing on 2026-08-20 showed why.** The
   unsigned build's cost was recorded everywhere — README, `electron-builder.yml`,
   this plan — as SmartScreen showing "unknown publisher" with a
   **More info → Run anyway** escape. That is true of SmartScreen and false of
   **Smart App Control**, which is on by default on many Windows 11 machines and
   offers no escape at all: the buttons are "Okay" and "Get apps from the Store".
   A user can only disable SAC, and disabling it **cannot be undone without
   reinstalling Windows**.

   So on an affected machine the product cannot be installed, and the workaround
   costs the customer a Windows reinstall. It is also intermittent — the same
   file was blocked and then installed minutes later — because SAC consults a
   cloud reputation service, and every unsigned rebuild is a fresh binary with no
   reputation.

   This is not a conversion problem to fix when convenient. It is the difference
   between having Windows customers and not. Details in
   [B-15](../known-bugs.md).
5. **Versioning.** The branch currently inherits upstream's `0.1.27`. Continuing
   their sequence means our update feed and theirs describe different software
   under identical version numbers — survivable while the feeds are separate,
   confusing the first time anyone compares them.

## Phase A — stop shipping upstream by accident — **this change**

`scripts/check-distribution.mjs`, modelled on `scripts/check-licenses.mjs`
because the problem has the same shape: a default that is fine today, arrives
through a routine edit, and is only wrong at the moment it ships.

```sh
pnpm check:distribution            # every finding must be named in ACCEPTED
pnpm check:distribution --release  # ACCEPTED must itself be empty
```

The first mode runs in CI and is green today. It does not demand that the list
be empty — a gate that always fails is a gate people learn to skip — it demands
that the list not *grow*. A new upstream endpoint arriving in a merge or a
routine edit fails the build with the file and line.

The second mode is the gate for "before a build leaves the building", and it
stays red until decisions 3 and 4 above are made. That is the honest state: the
work is not done, and the command says so rather than a paragraph saying so.

The markers are deliberately narrow — `milind-soni`, `milindsoni201`,
`openmausbot-releases`, `openmausbot-teams`. A grep for `openmausbot` would flag
`~/.openmausbot`, `openmausbot://pair`, `_openmausbot._tcp` and the
`openmaus.team` wire format, every one of which
[must survive a rebrand untouched](../identity-surface.md#2-names-that-are-not-branding--do-not-touch).
Only names that identify *upstream* belong in the marker list.

Also in this change, because neither needs a decision:

- `AGENTS.md` no longer points at `windows-release`. It names it as upstream's
  and says what is missing, so an agent reaching for a release runbook finds the
  contradiction instead of walking into it.
- `commercial-fork`'s "Nothing may default to upstream" list gains the six
  entries the audit found, and a pointer to the gate that now enforces it.

## Phase B — the channel

Once decisions 3 and 4 land, in this order:

1. Repoint `electron-builder.yml` `publish:` and re-verify that `app-update.yml`
   in the packaged tree carries the new owner — that file is generated, and it
   is what the installed app actually reads.
2. Fork `release.yml` into ours. Six hardcoded `--repo` sites plus `RELEASES_PAT`,
   `MAC_CERT_P12_BASE64` and the Apple API key secrets. Keep every verification
   gate: each one maps to a real incident upstream had, listed in the comment at
   the top of that file, and we inherit the incidents along with the pipeline.
3. Deploy our own Composio Worker from `cloudflare/composio-broker/` and set
   `OMB_COMPOSIO_BROKER_URL`. Upstream's own README tells forks to do this.
4. Decide the Team Library: our repo, or the feature off in our builds.
5. Repoint the two documentation links, which needs somewhere for them to go —
   the smallest version of "we need a docs site".

Then `pnpm check:distribution --release` goes green, and it going green is the
definition of done for this phase.

## Phase C — the runbook

Only after Phase B, because a runbook written against undecided values is
fiction. It replaces `windows-release` in the `AGENTS.md` table with a
fork-owned skill covering all three desktop platforms, and it inherits
`docs/releasing.md`'s structure — the "why the gates exist" section in
particular, which is the most valuable thing upstream wrote about releasing.

## Risks

- **The gate becomes a formality.** `ACCEPTED` exists so CI can be green while
  the list is non-empty, which is also how a permanent exception list is born.
  Every entry names the decision it waits on; an entry that cannot name one does
  not belong there.
- **Upstream changes the pipeline under us.** `release.yml` is upstream's and
  actively developed — it landed and shipped its first release on the same day
  this was written. Forking it means maintaining it. Repointing constants in
  place keeps the merge cheap, and is the reason Phase B step 2 says *fork*
  rather than *rewrite*.
- **`appId` gets decided by default.** It is decided the moment a build reaches
  anyone, whether or not anybody chose. This is the failure mode that has no
  remedy afterwards.

## Out of scope

iOS. `ios/AppStore/RELEASE.md` is upstream's, targets upstream's App Store
Connect team, and the fork has made no decision about shipping a phone app at
all. It needs its own plan, and it needs Apple-account decisions that do not
follow from the five above.
