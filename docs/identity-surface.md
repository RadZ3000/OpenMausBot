# The app's identity surface

Every place this app says what it is called, split by whether the name may
change. The brand pack is `brand/profile.ts` plus `brand/electron-builder.yml`;
window code still imports `@/lib/distribution`. The leak gate is
`pnpm check:brand` (CI) and `pnpm check:brand --release` (customer artifact).

Read this if you are rebranding a build, merging upstream into a rebranded
tree, or about to rename something that merely looks like branding.

The one distinction that matters: **a name the user reads is branding; a name
the app uses to find its own data is not.** They look identical in a grep and
behave nothing alike. Renaming the second kind does not rebrand anything, it
strands existing installs.

## Where we are (2026-08-25)

Phases A–C of
[`plans/2026-08-25-002-brand-pack-plan.md`](plans/2026-08-25-002-brand-pack-plan.md)
are in the tree. **Phase D is not.** Readers for lock-once slots already honor
`unset`; the values are not filled. Do not invent an `appId`, data-dir name, icons, mailbox, `accounts.` host, or
004 URLs to make `--release` green.

Working names: product **FlowDesk**, company **Flow Enterprises**, default
skin **foundry**. Those are not locked until `--release` is green.

| | |
|---|---|
| **Set** | `productName`, `companyName`, `defaultSkin`, `teamLibrary: "off"`, `showUpdateDownload: false`, overlay `publish: null`, overlay Linux vendor / extraMetadata `productName` |
| **Unset (Phase D)** | `appId`, `dataDirectoryName`, protocol display/scheme, `executableName`, helper `.app` names, `httpUserAgent`, homepage/author, `docsBaseUrl`, `composioBrokerUrl`, `companionName`, `emailFromAddress`, `controlPlaneUrl`, `companionHostSuffix`, icons, mascot, iOS strings |
| **Inherited until D** | Parent `appId` `com.openmausbot.app`, `~/.openmausbot`, `openmausbot://`, Linux binary `openmausbot`, packaged Composio milind fallback, `package.json` homepage/author, license extraResource filenames, taskbar icons in `build/`, wrangler `noreply@openmausbot.com` / `accounts.openmausbot.com` |

## 1. Brand — may change per distribution

### Wired to the pack

| Where | How |
|---|---|
| Window title | `src/main.tsx` sets `document.title` from `distribution.productName` before first paint |
| `index.html` `<title>` | Static default matches the pack; `main.tsx` overrides it at boot |
| Default skin | `readSkin(distribution.defaultSkin)` — Foundry unless the user already picked one. `DEFAULT_SKIN` in `skins.ts` stays `midnight` for the stylesheet contract test |
| Onboarding heading and CTA | `distribution.productName` |
| User- and model-visible copy in `src/`, `electron/`, `server/`, `companion/` | `distribution.productName` / `PRODUCT_NAME` / `OMB_PRODUCT_NAME` |
| Phone copy in the desktop Settings panel | `distribution.companionName` (falls back to productName while that slot is unset) |
| Crash HTML | `electron/main.mjs` `errorPage()` — no mouse emoji |
| Installer / dock / Start menu | `brand/electron-builder.yml` overlay (`productName`, Linux `Name` / vendor, NSIS shortcut) |
| Harness prompts | `server/distribution.ts` `PRODUCT_NAME` from `OMB_PRODUCT_NAME` |
| Analytics destination | `distribution.analyticsKey` / `analyticsHost` |
| Team Library | `teamLibrary: "off"` hides the Teams menu and skips the upstream fetch |
| Update Download | `showUpdateDownload: false` until `publish` is ours |
| Docs links | hidden while `docsBaseUrl` is unset |
| Mascot | `brand/mascot/` when a drawing exists; otherwise the bundled cursor |
| Control-plane OTP / Better Auth | `brandProfile.productName` in `cloudflare/control-plane/src/email.ts` and `auth.ts` |

iOS display strings still live in `ios/` until `brand/ios/` is filled.
`--release` scans them. The Worker host (`accounts.openmausbot.com`,
`noreply@openmausbot.com`) stays until `controlPlaneUrl` /
`emailFromAddress` / `companionHostSuffix` are plugged. Packaged desktop
does not default to their accounts host — empty unless
`OMB_CONTROL_PLANE_URL` or extraMetadata is set. `pnpm check:brand` walks
the repo minus a denylist so a new tree cannot hide.

### Brand that is not text

`MausAvatar` loads `brand/mascot` when plugged. Empty, it keeps the Cursor
drawing. A parallel Swift implementation remains at `ios/App/MausAvatar.swift`.

Skins are already a real theming system: CSS custom properties keyed on
`[data-skin]`, switchable at runtime, contrast-checked by
`scripts/check-skin-contrast.mjs`. A customer palette is a new skin, not new
components.

## 2. Names that are not branding — do not touch

Each of these identifies the app to itself, to the OS, or to another process.
Renaming one costs an install, a pairing, or a file that no longer opens.

**On disk.** `~/.openmausbot` is the **current** default while
`dataDirectoryName` is unset. It is a lock-once brand-pack slot, not a forever
upstream name — change it before the first customer, never after. Overridable
via `OMB_DATA_DIR`. Also `~/.openmausbot-companion`, `bots.json`, `groups.json`,
`messages-<threadId>.json`, `config.json`, `webhooks.json`, `credentials.bin`.

**In the browser.** `omb-drafts`, `omb-draft-attachments`, `omb-skin`,
`omb-email-gate`, `omb-analytics-consent`, `omb-installed`,
`omb-webhook-credentials`, `openmausbot.settings.section`, and the
`omb-qwen-mark` SVG gradient id.

**Environment variables.** The whole `OMB_*` and `OPENMAUSBOT_*` set, plus the
legacy `OGB_*` aliases the server still accepts.

**Identity to the OS and to peers.** `com.openmausbot.app` and its derivatives
stay until `appId` is plugged (same lock-once as the data dir). The
`openmausbot://pair` scheme, the `_openmausbot._tcp` Bonjour service, the
`com.openmausbot.companion.token` keychain service, and `window.ogb` — the
preload bridge, whose legacy name is referenced throughout `src/`.

**Protocol and interop.** The `openmaus.team` export format id, the
`{ app: "openmausbot" }` health-probe response that Electron checks before
adopting a server, the control-plane Worker health-probe id
`service: "openmausbot-control-plane"`, MCP server names (`openmausbot_image`,
`openmausbot_phone`, `openmausbot_connectors`, `openmausbot-permissions`), the
Windows permission pipe, and the container labels in
`server/container-computer.ts`.

Upstream reached the same conclusion when they renamed the product themselves:
`cb93606` scrubbed the pre-rename references and left the data-dir literals
alone, noting they are migration paths rather than branding.

### The worked example

`src/lib/team-import.ts` still carries both kinds on one line:

```ts
if (root.format !== "openmaus.team") throw new Error("This is not a BotMRR playbook or legacy team file.");
```

The comparison is a wire format shared with every previously exported team file
and must never change. The message beside it is copy.

## 3. Packaging identity — changes once, deliberately

Root `electron-builder.yml` stays upstream's. Our overlay
`brand/electron-builder.yml` extends it and sets the names that are plugged.
`publish: null` until the release-channel plan plugs our repo. `appId` is not
set in the overlay while the slot is `unset`.

**`appId` and `dataDirectoryName` are the ones to think hardest about.** They
are lock-once slots in this pack, chosen together before the first customer
build. Change `appId` after that and the build gets a fresh `userData`
directory. Change the data dir after that and you strand `~/.whatever` installs.

Icons still live in `build/` until `brand/icons/` is plugged.
`--release` fails while that folder is empty.

## 4. Links and defaults pointing at upstream

In-app docs links no longer hardcode `github.com/milind-soni/OpenMausBot`; they
render only when `docsBaseUrl` is set. Packaged Composio still falls back to
upstream's Worker while `composioBrokerUrl` is unset — `check:brand --release`
refuses that. The update feed is off (`publish: null`); Windows CI now fails if
`app-update.yml` still names `openmausbot-releases`.

The rest of the upstream-endpoint family is `pnpm check:distribution`. Do not
duplicate that list here.

## 5. Permanent divergence forecast

The pack is additive: `brand/` is ours, overlay extends their YAML, window code
keeps importing `@/lib/distribution`. Copy call sites in upstream files are
cheap unless they edit the same line. `git diff --stat upstream/main` remains
the ownership record.

Check the true cost at any time with:

```sh
git diff --stat upstream/main
pnpm check:brand
```

## How to change a name or plug a slot

Do not add a second profile, a YAML generator, or a string catalog. One folder,
two stamps, the existing window import.

1. Set the field in `brand/profile.ts`. `UNSET` is a distinct sentinel, not the
   string `"OpenMausBot"`. Lock-once slots (`appId`, `dataDirectoryName`,
   `protocolScheme`) are chosen together before the first customer build.
2. Packager fields also go in `brand/electron-builder.yml`. Do not edit root
   `electron-builder.yml`. Do not set `appId` or `directories.buildResources`
   while those slots are unset. `extraResources` in the overlay replaces the
   parent list — leave it alone unless you are ready to repeat every entry.
3. Window copy uses `distribution.productName` / `companionName`. Harness and
   companion copy uses `PRODUCT_NAME` (from `OMB_PRODUCT_NAME`). Phone product
   name is `OMB_PHONE_NAME`; `OMB_COMPANION_NAME` is this computer's label on
   the phone, not the app name.
4. Drop the matching row from `INCOMPLETE` in `scripts/check-brand.mjs` only
   when that file no longer matches. `pnpm check:brand` must stay green.
   `pnpm check:brand --release` stays red until every slot is plugged —
   including artwork in `brand/icons/` and `brand/mascot/`.
5. Publish repo and Composio URL are 004's *values*, plugged into this same
   profile. Do not retarget the feed in root YAML. Control-plane mailbox and
   host go in the same profile slots **and** `wrangler.jsonc` in one turn.
   Do not invent `noreply@…` or an `accounts.` hostname to go green.

Read [`commercial-fork`](../.claude/skills/commercial-fork/SKILL.md) before
shipping; the plan that defined the slots is
[`plans/2026-08-25-002-brand-pack-plan.md`](plans/2026-08-25-002-brand-pack-plan.md).

## Configuring a build

Configuration reaches the two halves of the app by different routes, because
they are built differently.

**The window** — set at `pnpm build`, inlined by Vite:

```sh
VITE_PRODUCT_NAME="Acme Agents"      # window title, onboarding, UI copy
VITE_ANALYTICS_KEY="phc_..."         # unset = analytics off entirely
VITE_ANALYTICS_HOST="https://..."    # defaults to PostHog US
```

`src/lib/distribution.ts` reads each as a literal `import.meta.env.VITE_X`
expression rather than passing the env object around: only the literal form is
substituted, and the object form compiles fine and then reads `undefined` in
production.

**The harness server** — baked at packaging time. It is a forked process with no
Vite build, and a packaged app launched from the Dock or Start menu inherits no
environment, so these travel in the `package.json` staged inside the asar:

```sh
electron-builder --win \
  -c.extraMetadata.distribution.defaultEngine=hermesAgent \
  -c.extraMetadata.distribution.defaultModel=ollama::qwen3-vl:8b
```

or as a block in a per-customer config file that extends `electron-builder.yml`:

```yaml
extraMetadata:
  distribution:
    defaultEngine: hermesAgent
    defaultModel: "ollama::qwen3-vl:8b"
    # overlay also bakes productName and teamLibrary from the pack
```

`electron/distribution.mjs` reads that back and forwards it to the server as
`OMB_DEFAULT_ENGINE` / `OMB_DEFAULT_MODEL` / `OMB_PRODUCT_NAME` (and the other
plugged brand slots). The real environment still wins over a baked value, so a
packaged build can be redirected in the field for debugging.

Both are preferences and neither can produce a bot that cannot answer: an engine
that is not installed loses to one that is, and a model the chosen engine does
not list is ignored in favour of its own default. Local catalogs are discovered
at runtime, so a model the user has not pulled yet is simply absent — which is
why a missing id means "not here" rather than "misconfigured". See
`server/distribution.ts`.
