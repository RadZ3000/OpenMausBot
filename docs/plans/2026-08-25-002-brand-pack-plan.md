# Brand pack: rebrand this fork without a white-label platform

Status: **Phase A–C in tree. Phase D not done.** Architecture, overlay, copy
(including control-plane OTP From/Subject and Better Auth `appName`), hides,
and leak gate landed. The checker walks the repo minus a denylist. Lock-once
values, artwork, helper names, iOS strings, homepage/author, control-plane
domains (`emailFromAddress`, `controlPlaneUrl`, `companionHostSuffix`), and
004’s publish/broker URLs are still `unset`. Packaged desktop does not call
milind’s accounts host. `pnpm check:brand` is green in CI;
`pnpm check:brand --release` is red and must stay red until Phase D. Do not
invent those values to go green.

Standing map for agents: [`../identity-surface.md`](../identity-surface.md).

Written after the 2026-08-25 branding pass (company = Flow Enterprises,
working product name = FlowDesk, site = flowenterprises.io product-led, look
= ink / paper / copper) and after auditing the existing distribution seam
against [`commercial-fork`](../../.claude/skills/commercial-fork/SKILL.md),
[`module-design`](../../.claude/skills/module-design/SKILL.md), and
[`identity-surface.md`](../identity-surface.md).

This is how Phase 2 of
[the product foundation plan](2026-08-20-003-product-foundation-plan.md) is
implemented: **additive files we own**, not a theme engine and not a flag per
upstream feature. A–C of *this* plan are in the tree. Phase D (lock-once
values and assets) is **not**. It does **not** replace
[the release-channel plan](2026-08-20-004-release-channel-plan.md). A named
build is still not a customer build until 004’s gate is green.

**Decided 2026-08-25:** this fork has not released to customers. Nothing
outside the team is installed under our `appId`. Identity-surface §2
(“do not rename, it strands installs”) applies to the **first customer
build we cut**, not to upstream’s users and not to our current
`~/.openmausbot` dev dirs. Default data dir, `appId`, and (if we take
the cost) the protocol scheme are still open, and they should be chosen
together before that first build.

## check-upstream-first, run before writing anything

Required by [the skill](../../.claude/skills/check-upstream-first/SKILL.md).
As of writing this plan (2026-08-25, before landing) this branch was
**0 commits behind `upstream/main`**. Re-fetch before the next feature.

**Upstream has no distribution profile and no brand pack.**
`src/lib/distribution.ts` exists on disk and is **absent** from
`upstream/main`. `brand/profile.ts` is absent there too. Their identity work
is the product rename (`cb93606`), the icon redraw (`8bdd345`), and skins
(`src/lib/skins.ts` / `[data-skin]` in `src/styles.css`). They configure the
installer in root `electron-builder.yml`. None of that is a per-fork brand
folder.

**Decision: build in files they do not own.** Keep their `electron-builder.yml`
and `src/styles.css` as theirs. Our overlay YAML, profile, and icons live under
`brand/`. Window code keeps importing `@/lib/distribution` so call sites do not
scatter. A generator that rewrites their YAML is rejected below.

## Landed 2026-08-25 (do not redo A–C)

**A — architecture.** `brand/profile.ts` (full `BrandProfile`, `UNSET`
sentinel). `brand/electron-builder.yml` extends root YAML; `publish: null`;
`productName` / Linux vendor / extraMetadata `productName` + `teamLibrary`.
Packaging scripts use `--config brand/electron-builder.yml`. Root
`electron-builder.yml` was not edited. `scripts/check-brand.mjs` + tests; CI
runs `pnpm check:brand`. The checker walks the repo minus a denylist (a new
tree cannot hide the way `cloudflare/` did). `openmausbot.com` is a leak;
`openmausbot-control-plane` health-probe id is not.
`package-win.yml` **fails** if `app-update.yml` contains
`openmausbot-releases`. Window `DEFAULTS` read the profile; Foundry
via `readSkin(distribution.defaultSkin)`; `Avatar` loads `brand/mascot` when
a drawing exists. Readers honor `unset`: `OMB_DATA_DIR_NAME`,
`OMB_PROTOCOL_SCHEME`, helper `.app` env, `OMB_PHONE_NAME` (phone product
name — not `OMB_COMPANION_NAME`, which is this computer’s label), Composio
env. Overlay does not set `appId` or `directories.buildResources`. A full
unpacked `package:win` was **not** run; the checker asserts the overlay does
not override `afterPack` / `buildResources`.

**B — words.** User- and model-visible `OpenMausBot` / `OpenMausMobile` /
`OpenMaus ` in `src/`, `electron/`, `server/`, `companion/` go through
`distribution.productName` / `PRODUCT_NAME`. `index.html` title is FlowDesk.
Crash HTML has no mouse. [`identity-surface.md`](../identity-surface.md)
refreshed. iOS strings and helper Info.plists still name upstream
(`INCOMPLETE`). Control-plane OTP copy uses `brandProfile.productName`.

**C — hides.** `teamLibrary: "off"` (Teams menu hidden, catalog 404, no
milind fetch). `showUpdateDownload: false` (banner does not offer Download
while an update is merely available).

**D — not done.** No `appId`, data-dir name, protocol display/scheme,
`executableName`, helper bundle names, `httpUserAgent`, homepage/author,
`docsBaseUrl`, control-plane mailbox/host, icons, mascot artwork, iOS
rebrand, or 004 publish/broker URLs. Packaged Composio still falls back to
milind. Packaged desktop does **not** default to `accounts.openmausbot.com`.
Remaining leaks are named in `INCOMPLETE` in `scripts/check-brand.mjs`.
Wiring those slots’ readers is Phase A; filling their values is Phase D.

## What was true before landing (audit, 2026-08-25)

The next two sections are the pre-implementation audit. They are **not**
current product state. Current state is **Landed** above and
[`identity-surface.md`](../identity-surface.md).

## What is actually true today

Audited, not assumed. **Stale as of landing** — kept as the audit that
justified the pack.

**The window seam exists and is ours.** `src/lib/distribution.ts` already
resolves `productName`, analytics, and `installPaths` from `VITE_*` with
safe defaults. `src/main.tsx` stamps `document.title` from it. Onboarding and
the install-path chooser already read it. Default `productName` is still
`OpenMausBot`.

**The installer seam is theirs and still says OpenMausBot.**
`electron-builder.yml` `productName`, `shortcutName`, Linux `Name` /
`maintainer` / `vendor`, and `package.json` `homepage` / `repository` /
`author` are upstream. `package:win` / `package:mac` / `package:linux` invoke
`electron-builder` with no `--config`, so they always load the root YAML.
[004](2026-08-20-004-release-channel-plan.md) already records that this YAML
also publishes to `milind-soni/openmausbot-releases`. This plan does not
retarget that.

**Look is a skin, not a brand file.** Four skins, contrast-checked.
`DEFAULT_SKIN` is `midnight`. **Foundry** is already “dark, warm, lit in
brass” — the closest in-tree match to ink / paper / copper. A fifth skin is
optional; it is not required to start.

**Copy is not centralized.** Identity-surface counted fourteen strings in ten
files. A 2026-08-25 grep of `src/` is larger: Companion, CallView,
LocalComputer, UpdateBanner, NoEngines, Routines, Webhooks, ComputerPanel,
ApiKeys, team-import, plus SecretRequestCard, AttachmentPreview,
SkillRecorderPage, MacLocalControl, LinuxLocalControl (docs URL),
ogb.d.ts. Re-grep at implementation time. `openmaus.team` and
`OpenMausBot could not…` error text that names the product are copy;
`format !== "openmaus.team"` is a wire format and must not change.

**The mascot is already one wrapper.** `MausAvatar` is `CursorAvatar` behind
the old name. Replacing the drawing is that file, not a profile enum, until
two faces ship.

**Three processes cannot share one TypeScript import graph.** Vite inlines the
window. `server/` compiles with `tsconfig.server.json` include `server` +
`companion` only. Electron main is plain `.mjs`. Engine/model defaults stay in
`server/distribution.ts` + `extraMetadata` (already ours). Branding does not
absorb that.

**Hiding a feature still means an `if` in a caller.** A flag with no caller is
the feature-flag map 003 explicitly dropped.

## Residual leakage — profile-alone is not enough

Audited 2026-08-25 **before** A–C. Several rows below are now closed (overlay
`publish: null`, `package-win.yml` fails on their feed, Team Library off,
crash HTML / `index.html` / harness copy, Foundry via `readSkin`). What is
**still** open after A–C is listed at the end of this section.

`pnpm check:distribution` does **not** catch this. It only greps `milind-soni`,
`milindsoni201`, `openmausbot-releases`, `openmausbot-teams`. The word
`OpenMausBot` in the UI is invisible to that gate.

### Will replace the product (worse than a string)

| Surface | What happens |
|---|---|
| `publish:` → `milind-soni/openmausbot-releases` (inherited if overlay omits it) | Packaged app offers **their** 0.1.x. Download installs their app. |
| `.github/workflows/package-win.yml` | Today **requires** `app-update.yml` to contain `openmausbot-releases`. Our CI would fight a correct overlay. |
| Composio fallback in `electron/main.mjs` | Packaged Gmail/Slack/Notion through their Worker. |
| Team Library | Live fetch + “browse” to `openmausbot-teams`. |

004 already forbids a customer build until the feed is ours or off.
This pack must not inherit their `publish:` silently: overlay sets
`publish: null` (or equivalent “do not check”) until 004 retargets it,
**or** `pnpm check:brand` fails if packaged `app-update.yml` still names
`milind-soni`. Disable the update **Download** action until then (Phase C).
Change `package-win.yml` so it no longer *requires* their feed.

### User-visible copy the window profile does not reach

- **Crash HTML** in `electron/main.mjs` — mouse emoji + “reopen OpenMausBot”.
- Companion / speech / cua / diagnostics errors (`companion-account-service.mjs`,
  `cua.mjs`, `diagnostics.mjs`).
- **macOS helper names** — `OpenMausBot Speech.app`, `OpenMausBot Recorder.app`
  (TCC dialogs).
- **`index.html` `<title>`** — overwritten before paint; View Source still
  says OpenMausBot.
- **`package.json` `homepage` / `author` / `repository`** in installer
  metadata unless overlay or a 004 edit replaces them.
- **License extraResources** — `licenses/OpenMausBot-LICENSE.txt` and
  `…-NOTICE.txt`.
- Linux `executableName: openmausbot`.
- Protocol **display** name `OpenMausBot package install` (scheme
  `openmausbot://` stays).

### The bot will introduce itself as OpenMausBot

`server/index.ts`: “You are … a personal bot in OpenMausBot.” Permission
timeout notes, webhook truncation, package-export taglines, delegations.
Those literals ship in the harness. Models echo them.

**Tightening:** bake `productName` into overlay `extraMetadata.distribution`
(same channel as `defaultEngine`). `electron/distribution.mjs` forwards
`OMB_PRODUCT_NAME`. `server/distribution.ts` reads it. Prompts and
user-visible server errors use that. Brand check asserts profile =
overlay extraMetadata = window default.

### Look that is not a string

Taskbar icon (theirs until Phase D). Avatar in every thread. Midnight
until `defaultSkin`. Any overlay key we forget is **inherited** from
their YAML — thin overlay plus a packaged-tree check, not memory.

### Attribution vs lock-once disk identity

These were lumped together. They are not the same problem.

**Apache NOTICE / LICENSE text must keep the OpenMausBot copyright line.**
That is the licence, not a Start-menu name. Put it in an About / licenses
folder as “includes Apache-2.0 software originally published as
OpenMausBot.” A law firm *wants* that paper trail. Renaming the *files*
(`licenses/NOTICE.txt`) is fine; deleting the *text* is not.

**`~/.openmausbot` and `openmausbot://` are a real B2B problem if we ship
them to a first customer.** A clinic IT review will find the folder. The
identity-surface rule is “do not rename *after* something is installed,”
not “this fork must use their data directory forever.” We have no customer
installs yet. The first customer build is the same lock as `appId`: choose
`DATA_DIR` default, protocol display, and `appId` together, once.

- **Data dir** (`server/config.ts`: `~/.openmausbot`): cheap to change
  *now*. New default e.g. `~/.flowdesk` (or whatever product name locks).
  Optional one-time copy from `~/.openmausbot` for our own machines.
  After a customer install, never change it again.
- **Protocol scheme** `openmausbot://`: expensive (iOS companion, QR,
  OS handler). Can keep the scheme if pairing stays internal, and still
  change the **display** name in electron-builder. Changing the scheme
  is a dedicated slice, not a FAQ.
- **Wire / process names** users almost never see: `openmaus.team`,
  `{ app: "openmausbot" }` health probe, `omb-*` keys, MCP server ids.
  Leave them. Merges stay cheap; they are not the folder in Explorer.

So: NOTICE is small and required. The home-directory folder is **not**
something we paper over. `dataDirectoryName` and `appId` are slots in
**this** pack, locked before the first customer. 004 does not get a
second vote on the data dir.

### Still open after A–C (Phase D + 004 values)

Named in `INCOMPLETE` in `scripts/check-brand.mjs`. Do not invent values
to empty this list.

| Slot / surface | Current |
|---|---|
| `appId` | Overlay omits it; parent YAML still `com.openmausbot.app` |
| `dataDirectoryName` | Default still `~/.openmausbot` |
| Protocol display / scheme | Display unset; scheme still `openmausbot://` |
| Linux `executableName` | Inherited `openmausbot` |
| Helper `.app` / Info.plist / TCC copy | Still `OpenMausBot Speech.app` / `Recorder.app` |
| `httpUserAgent` | Still `OpenMausBot-skills` |
| `package.json` homepage / author / repository | Still milind-soni |
| License `extraResources` filenames | Still `OpenMausBot-LICENSE.txt` in **root** YAML |
| `docsBaseUrl` | Unset; in-app docs hidden (intentional) |
| `publish` | Overlay `null` (feed off, not 004’s repo) |
| `composioBrokerUrl` | Packaged fallback still milind |
| `companionName` / iOS | Phone falls back to FlowDesk; iOS still OpenMausMobile |
| `brand/icons/`, `brand/mascot/` | Empty; taskbar icon still theirs |
| `server/local-computer.ts` | Application Support fallback still lists OpenMausBot |
| `emailFromAddress` / `controlPlaneUrl` / `companionHostSuffix` | Wrangler still `noreply@openmausbot.com` / `accounts.openmausbot.com`. Packaged desktop has no milind default |

## Plug-and-play — the folder is the product; ingredients come later

Branding will **not** be filled in immediately. The architecture must still be
complete now: every surface has a **slot** under `brand/`. When name, icons,
mascot, `appId`, data dir, docs URL, and broker URL exist, they drop in
that folder. Readers already look there. `pnpm check:brand --release`
refuses a customer artifact if any slot is empty or still upstream.

Do not wait for ingredients to invent the seams. Do not add a generator.
Two stamps stay in the folder (profile + overlay YAML); the checker
proves they match.

```
brand/
  profile.ts                 # BrandProfile — every slot, including unset
  electron-builder.yml       # extends theirs; values must equal profile
  icons/                     # .ico / .icns / svg; empty until art exists
  mascot/                    # drawing Avatar.tsx loads when present
  ios/                       # display strings for the companion app
```

An `unset` slot is legal on a development machine. It is **illegal** for
`--release`. That is how plug-and-play stays honest: you cannot ship by
forgetting a folder.

### BrandProfile slots (all of them)

Each row is one field (or one directory). No parallel flag map of upstream
features — these are *our* identity, not a switch per their screen.

| Slot | Plugs | `--release` fails if |
|---|---|---|
| `productName` / `companyName` | Window, overlay, `OMB_PRODUCT_NAME` | Hardcoded `OpenMausBot` in shipped copy |
| `companionName` | Phone copy + `brand/ios/` | `OpenMausMobile` in `src/` or `ios/` |
| `defaultSkin` | `readSkin` fallback | Still `midnight` as the shipped default |
| `appId` | Overlay only | Still `com.openmausbot.app` |
| `dataDirectoryName` | `DATA_DIR` default (`~/.<name>`) | Default still `~/.openmausbot` |
| `protocolDisplayName` | electron-builder protocol `name` | Label still “OpenMausBot package install” |
| `protocolScheme` | Explicit. Keep or replace **once** | UI copy still says the old scheme if we replaced it; if we keep `openmausbot`, that is named in UNAVOIDABLE, not forgotten |
| `executableName` | Linux binary / `.desktop` | Still `openmausbot` |
| `speechHelperName` / `recorderHelperName` | macOS helper `.app` + TCC | Still `OpenMausBot Speech.app` |
| `httpUserAgent` | skill-fetch, webhook tester | Still `OpenMausBot-skills` |
| `homepage` / `authorName` / `authorEmail` | Overlay / extraMetadata (prefer not editing their `package.json`) | Milind / `milind-soni/OpenMausBot` in installer metadata |
| `docsBaseUrl` | ApiKeys + LinuxLocalControl links | `github.com/milind-soni/OpenMausBot` |
| `emailFromAddress` | Wrangler `EMAIL_FROM` / allowed sender | Still `noreply@openmausbot.com` |
| `controlPlaneUrl` | Wrangler `BETTER_AUTH_URL` + extraMetadata → `OMB_CONTROL_PLANE_URL` | Still `accounts.openmausbot.com`; packaged desktop must not default there |
| `companionHostSuffix` | Wrangler `COMPANION_HOST_SUFFIX` | Still `openmausbot.com` |
| `publish` | Overlay `publish:` | `null` until 004 has our repo; then must be ours. Never `milind-soni/openmausbot-releases` |
| `composioBrokerUrl` | `electron/main.mjs` packaged fallback | `milindsoni201.workers.dev` |
| `teamLibrary` | `'off'` or our repo | `openmausbot-teams` fetch or browse link |
| `showUpdateDownload` | Update banner | Download enabled while `publish` is null or theirs |
| `icons/` | `directories.buildResources` | Directory empty or still `build/icon` from upstream |
| `mascot/` | `MausAvatar` wrapper | Still shipping only their Cursor drawing |
| `crashPage` | `electron/main.mjs` HTML | Mouse emoji + OpenMausBot sentence |

**Lock-once, this plan, before the first customer (not 004):** `appId`,
`dataDirectoryName`, `protocolScheme` (keep-or-replace). 004 still owns
*where the update feed lives*, signing certificates, and *deploying* the
broker. Those values, when they exist, still **land in this folder**.
004 does not keep a second data-dir decision.

### What `--release` may still contain (UNAVOIDABLE)

Named, short, reviewed. Anything else is a leak.

- Apache `LICENSE` / `NOTICE` **file text** (OpenMausBot copyright). Filenames
  in `licenses/` must not say OpenMausBot.
- Wire/process ids that are not the Explorer folder: `openmaus.team`,
  `{ app: "openmausbot" }` health probe, `service: "openmausbot-control-plane"`,
  `omb-*` keys, MCP server ids, `OMB_*` **variable names**, Windows permission
  pipe names, container labels.
- `openmausbot://` **only if** `protocolScheme` is explicitly that value.

`~/.openmausbot` is **not** unavoidable. After `dataDirectoryName` is
set, that path in the default must fail the check.

## The end state

Readers import `brand/profile.ts` (window via `src/lib/distribution.ts`;
harness via `OMB_*` from extraMetadata; packager via overlay YAML). Root
`electron-builder.yml` stays theirs. UI control is still tokens, then
words, then named hides, then the mascot files in `brand/mascot/`.

## Rejected (and why)

| Approach | Why not |
|---|---|
| JSON generator that writes `electron-builder.yml` | Their file, our merge conflict, every upstream packaging change. |
| `brand/wrangler.jsonc` or a wrangler YAML generator | Wrangler has no `extends`. Their `account_id` / zone stay in *their* wrangler file until 004-style deploy of *our* Worker. |
| One TypeScript file imported by Vite, `tsc` server, and Electron `.mjs` | Three toolchains. Pass-through adapters would fail the deletion test. |
| Growing on/off map of every upstream feature | Edits their UI forever; flags that are always on/off are dead code. 003 already dropped this. |
| Extract a primitives / layout theme system | 003: rewrite wearing a reskin. Skins already are the token seam. |
| Rename `omb-*`, health probe, `openmaus.team` after a customer install | Identity-surface §2. Strands files. |
| Leave `dataDirectoryName` / `appId` unset for `--release` | First customer would get `~/.openmausbot` and `com.openmausbot.app`. These slots live in **this** pack. |
| Put the data-dir default only in 004 | 004 ships the channel; 002 owns the lock-once identity fields. |
| Retarget `publish:` / deploy Composio without 004’s decisions | Values still **plug into** `brand/` when they exist. Checker fails while they are still milind. |
| Treat FlowDesk as locked | Working title until `--release`. |
| Restyle flowgeniestudios.com as the product | Separate marketing decision; not this pack. |

## Phases

Architecture (schema, readers, checker) can land before icons, mascot,
`appId`, or a broker URL exist. **`--release` stays red** until every
slot is plugged and the leak grep is UNAVOIDABLE-only. Do not ship a
customer build on Phase A.

### Phase A — architecture: slots, overlay, aggressive checker

**Done.**

1. Add `brand/profile.ts` with the **full** `BrandProfile` type (every slot
   above). Working values may be set for `productName` / `companyName` /
   `defaultSkin`; lock-once and asset slots may be `unset`. No hide
   fields as a generic map — only the named slots in the table.
2. Point `src/lib/distribution.ts` `DEFAULTS` at that profile. Keep `VITE_*`.
   Update `distribution.test.ts`.
3. Add `brand/electron-builder.yml` with `extends: ../electron-builder.yml`.
   Overlay whatever *is* set. `publish: null` until 004 plugs our repo.
   **`appId` and `dataDirectoryName` stay unset until chosen — they must
   not default to upstream’s values in a `--release` build.**
4. Point `package:win` / `package:mac` / `package:linux` (and linux
   variants) at `--config brand/electron-builder.yml`.
5. `check:brand` walks the repo minus a denylist (not a shipped-folder
   whitelist). A new tree is scanned unless it is named in the skip list.
   `#` comments apply only to YAML/JSONC, so markdown titles count.
   `openmausbot.com` is a leak; `openmausbot-control-plane` is not.
6. Add `scripts/check-brand.mjs`:
   - `pnpm check:brand` — CI. Every leak or empty slot must be named in
     `INCOMPLETE` with the slot it waits on (same shape as
     `check-distribution` `ACCEPTED`). A **new** `OpenMausBot` /
     `milind-soni` / `openmausbot-releases` / `openmausbot-teams` /
     `milindsoni201` hit fails. `~/.openmausbot` as `DATA_DIR` default
     is a leak unless `dataDirectoryName` is still `unset` (then it is
     incomplete, not allowed forever).
   - `pnpm check:brand --release` — **before any customer artifact.**
     `INCOMPLETE` must be empty. Leak grep must be UNAVOIDABLE-only.
     Empty `brand/icons/`, empty `brand/mascot/`, unset `appId`,
     unset `dataDirectoryName`, their `publish`, their broker URL,
     their docs URLs, `OpenMausMobile`, helper `.app` names, Linux
     `executableName`, crash-page mouse, `package.json` author/homepage
     if those still ship — all fail.
   Walk the repo minus a denylist (`docs/`, `tools/`, `NOTICE`, `LICENSE`,
   `node_modules`, build output, …). Do not scan `NOTICE` / `LICENSE` body
   for the product name (UNAVOIDABLE). Planted-fixture tests for both modes.
   A path under `cloudflare/` and `apps/` must be in `found` or `INCOMPLETE`.
7. Window tsconfig includes `brand`. Forward `OMB_PRODUCT_NAME` and
   later `OMB_DATA_DIR` default from extraMetadata.
8. Flip `package-win.yml`: must **not** require `openmausbot-releases`.
   `--release` asserts packaged `app-update.yml` does not name it.

**Verify:** `pnpm typecheck`, `pnpm test` for distribution tests. Overlay
does not override `afterPack` / `directories.buildResources: build` (the
checker asserts this). A full unpacked `package:win` confirming Start menu
/ `productName` in the packaged tree was **not** run when A landed; do
that before a customer artifact, not to “finish” A.

### Phase B — words, harness name, default look

**Done** (iOS and helper `.app` / Info.plist names wait on Phase D).

1. Re-grep `OpenMausBot` / `OpenMausMobile` / `OpenMaus ` under `src/`,
   `electron/` (not `electron/vendor/`), and `server/` (string literals
   the user or a model can see). Replace copy with `distribution.productName`
   (window) or `OMB_PRODUCT_NAME` / `server/distribution.ts` (harness).
   Crash HTML, diagnostics header, companion errors, system prompts,
   export taglines, permission timeout notes, `index.html` title.
   Companion phone name: `companionName` in the profile only if we
   rebrand it in the same change.
2. `readSkin(distribution.defaultSkin)` from `src/main.tsx` as already
   specified.
3. Foundry vs new skin, contrast check, as already specified.
4. Refresh [`identity-surface.md`](../identity-surface.md).
5. Wire every **other** slot’s reader when that ingredient exists (docs
   URL, helper names, user-agent, `executableName`, crash page). CI
   `check:brand` shrinks `INCOMPLETE`. `--release` still fails until
   all slots including icons/mascot/appId/data dir are plugged.

**Divergence:** copy call sites plus `readSkin` fallback. Cheap unless
they edit the same line.

### Phase C — named hides (callers for slots that already exist)

**Done.**

`teamLibrary: 'off'` (or our repo) and `showUpdateDownload: false` until
`publish` is ours. One `if` at the menu and the banner. Tests. No extra
flag catalog.

### Phase D — plug lock-once identity and assets (this plan, not 004)

**Not done.** Readers for these slots already honor `unset` (Phase A). Fill
the **already-defined** slots when the ingredients exist — do not invent a
second place, and do not invent an `appId` or fake icons to make `--release`
green:

- `appId`, `dataDirectoryName` (migrate our own `~/.openmausbot` once),
  `protocolDisplayName` / `protocolScheme`
- `brand/icons/`, `brand/mascot/`, helper `.app` names
- `homepage` / author via overlay extraMetadata
- `emailFromAddress` / `controlPlaneUrl` / `companionHostSuffix` (same
  turn: profile **and** `cloudflare/control-plane/wrangler.jsonc`)
- `publish` and `composioBrokerUrl` **when 004 has decided the
  values** — they still plug **here**; 004 does not own a second
  `DATA_DIR`

`--release` is green only when this phase is done and 004’s feed/broker
values are in the folder (or team library / download remain off and
broker unset is illegal — unset packaged fallback to milind **fails**).

## Files this creates or is allowed to touch

**Create (ours):** `brand/profile.ts`, `brand/electron-builder.yml`,
`brand/icons/`, `brand/mascot/`, `brand/ios/` (may be empty),
`scripts/check-brand.mjs` and tests.

**Edit (ours):** `src/lib/distribution.ts` and test,
`electron/distribution.mjs`, `server/distribution.ts` and `server/config.ts`
(`DATA_DIR` default from profile / `OMB_DATA_DIR`), `package.json`
scripts, `.github/workflows/package-win.yml`.

**Edit (theirs, cheap):** copy; crash HTML; `main.tsx`; `readSkin`;
`index.html`; `MausAvatar` to load `brand/mascot` when present;
docs-link hrefs; helper bundle names.

**Do not edit:** root `electron-builder.yml` (extend it). Do not keep
hardcoding `~/.openmausbot` as the shipped default once
`dataDirectoryName` is set.

## Tests

- Profile type has every slot; `unset` is distinct from a real value.
- Overlay matches profile for every *set* packager field.
- `check:brand`: planted `OpenMausBot` fails; `openmaus.team` does not;
  new milind URL fails; `INCOMPLETE` must name each empty slot.
- `check:brand --release`: fails on empty icons/mascot, unset `appId`
  / `dataDirectoryName`, inherited `openmausbot-releases`, milind
  broker, `~/.openmausbot` default, mouse crash page.
- `readSkin` fallback; stored midnight wins.
- `DATA_DIR` default follows `dataDirectoryName` when set.
- Hide slots: Team Library / Download absent when off.
- Contrast if a skin is added.
- No sleeps; tests still must not touch the real `~/.openmausbot`.

## Out of scope

- Marketing site, 301s, niche landing copy (separate).
- Path A / Hermes / Local VM.
- Inventing the update-repo URL, signing cert, or broker deploy (004
  decides; **slots and checker are this plan**).
- Per-niche apps or per-niche `appId`.
- App Store *submission* (identity strings for iOS still live in
  `brand/ios/` and `--release` scans `ios/`).

## Risks

- **electron-builder `extends` + relative paths.** If `afterPack` or
  `buildResources` resolve from the config file’s directory, the Windows
  package breaks. The checker asserts the overlay does not override those
  keys. Prove resolution on one unpacked build **before a customer
  artifact**, not as a substitute for Phase D.
- **Thin overlay inherits their `publish:`.** Default-deny: `publish: null`
  until 004. `check:brand` fails if `app-update.yml` still names their repo.
- **Hide flags accumulate “just in case.”** Phase C’s rule is the brake:
  a field ships with its first caller.
- **FlowDesk collisions** (other FlowDesk apps). Working title only; the
  pack is how we change it later without a second architecture.
- **`appId` / data dir decided by a casual packaged build.** `--release`
  refuses unset slots. Phase A is for architecture, not strangers.

## Verify when a phase lands

```sh
pnpm typecheck
pnpm test
pnpm lint
pnpm check:brand
pnpm check:brand --release   # customer artifact only; red until slots are full
pnpm check:distribution
pnpm check:contrast   # if a skin changed
pnpm check:electron   # if packaging scripts / overlay changed
```

A customer-shaped artifact additionally needs `pnpm check:distribution --release`
(today red, correctly) and 004.

## Map

| Plan | How this relates |
|---|---|
| [003](2026-08-20-003-product-foundation-plan.md) | Product wedge + Phase 2 brand; this is the implementation shape 003 left as “distribution module + identity surface.” |
| [004](2026-08-20-004-release-channel-plan.md) | Decides *values* for publish repo, signing, broker deploy. Those values **plug into** `brand/`. `appId` and `dataDirectoryName` are owned here. `--release` fails while they are still milind or unset. |
| [005](2026-08-20-005-three-path-first-run-plan.md) | `installPaths` already in the profile. Do not add a fourth path here. |
| Identity surface | Refresh in Phase B; §2 still binding. |
