# The app's identity surface

Every place this app says what it is called, split by whether the name may
change. Written while building the distribution profile
(`src/lib/distribution.ts`); the counts were taken from the tree rather than
from memory, so re-run the greps before trusting them after heavy churn.

Read this if you are rebranding a build, merging upstream into a rebranded
tree, or about to rename something that merely looks like branding.

The one distinction that matters: **a name the user reads is branding; a name
the app uses to find its own data is not.** They look identical in a grep and
behave nothing alike. Renaming the second kind does not rebrand anything, it
strands existing installs.

## 1. Brand — may change per distribution

### Already wired to the profile

| Where | How |
|---|---|
| Window title | `src/main.tsx` sets `document.title` from `distribution.productName` before first paint |
| `index.html` `<title>` | Static default only; the line above overrides it at boot |
| Onboarding heading and CTA | `distribution.productName` |
| Analytics destination | `distribution.analyticsKey` / `analyticsHost` |

### Not yet wired — the Phase 2 work list

Fourteen strings across ten files, each a one-token change:

| File | Lines | What the user sees |
|---|---|---|
| `src/components/CompanionSection.tsx` | 137, 229 | "Open OpenMausBot on this computer…" |
| `src/components/CallView.tsx` | 93, 95 | "Calls require OpenMausBot for macOS…" |
| `src/components/LocalComputerSection.tsx` | 238, 303 | Container-runtime setup copy |
| `src/components/UpdateBanner.tsx` | 52, 71 | "OpenMausBot 1.2.3 is available" |
| `src/components/NoEngines.tsx` | 48 | "OpenMausBot doesn't ship a model of its own…" |
| `src/components/RoutinesPage.tsx` | 410 | "Keep OpenMausBot running…" |
| `src/components/WebhooksPanel.tsx` | 329 | "Keep OpenMausBot open…" |
| `src/components/ComputerPanel.tsx` | 453 | Thrown error text |
| `src/components/ApiKeys.tsx` | 270 | SSH config explanation |
| `src/lib/team-import.ts` | 14 | "This is not an OpenMaus team file." |

Two more name the **phone companion** rather than this app —
`CompanionSection.tsx:248,249` say "OpenMausMobile". That is a second product
name and needs its own field if the companion is ever rebranded too.

### Brand that is not text

`MausAvatar` is the identity of every bot, imported by twelve production
components, with a parallel Swift implementation at `ios/App/MausAvatar.swift`.
Replacing the mascot is explicitly out of scope for Phase 2 — it is structural,
not decorative, and swapping it is a rewrite wearing a re-skin's clothing.

Skins are already a real theming system: CSS custom properties keyed on
`[data-skin]`, switchable at runtime, contrast-checked by
`scripts/check-skin-contrast.mjs`. A customer palette is a new skin, not new
components.

## 2. Names that are not branding — do not touch

Each of these identifies the app to itself, to the OS, or to another process.
Renaming one costs an install, a pairing, or a file that no longer opens.

**On disk.** `~/.openmausbot` (overridable via `OMB_DATA_DIR`),
`~/.openmausbot-companion`, `bots.json`, `groups.json`,
`messages-<threadId>.json`, `config.json`, `webhooks.json`, `credentials.bin`.

**In the browser.** `omb-drafts`, `omb-draft-attachments`, `omb-skin`,
`omb-email-gate`, `omb-analytics-consent`, `omb-installed`,
`omb-webhook-credentials`, `openmausbot.settings.section`, and the
`omb-qwen-mark` SVG gradient id.

**Environment variables.** The whole `OMB_*` and `OPENMAUSBOT_*` set, plus the
legacy `OGB_*` aliases the server still accepts.

**Identity to the OS and to peers.** `com.openmausbot.app` and its derivatives,
the `openmausbot://pair` scheme, the `_openmausbot._tcp` Bonjour service, the
`com.openmausbot.companion.token` keychain service, and `window.ogb` — the
preload bridge, whose legacy name is referenced throughout `src/`.

**Protocol and interop.** The `openmaus.team` export format id, the
`{ app: "openmausbot" }` health-probe response that Electron checks before
adopting a server, MCP server names (`openmausbot_image`, `openmausbot_phone`,
`openmausbot_connectors`, `openmausbot-permissions`), the Windows permission
pipe, and the container labels in `server/container-computer.ts`.

Upstream reached the same conclusion when they renamed the product themselves:
`cb93606` scrubbed the pre-rename references and left the data-dir literals
alone, noting they are migration paths rather than branding.

### The worked example

`src/lib/team-import.ts:14` carries both kinds on one line:

```ts
if (root.format !== "openmaus.team") throw new Error("This is not an OpenMaus team file.");
```

The comparison is a wire format shared with every previously exported team file
and must never change. The message beside it is copy and should be rebranded.
Grep cannot tell them apart; you have to look.

## 3. Packaging identity — changes once, deliberately

`electron-builder.yml` carries the name the operating system shows:
`productName`, `artifactName`, `shortcutName` (Windows Start menu), `vendor` and
the Linux `.desktop` `Name`, plus four macOS permission strings that name the app
in system dialogs. `electron/resources/speech-helper-Info.plist` names the speech
helper the same way.

**`appId` is the one to think hardest about.** It is not a label — it is what the
OS uses to decide whether an installer is upgrading an app or installing a new
one. Change it and the build gets a fresh `userData` directory, loses update
continuity with anything already deployed, and orphans the previous install's
credentials. So it is a decision to make *once, before the first customer build*,
not something to iterate on.

Icons live in `build/` (`icon.svg` is the source; `.icns`, `.ico` and the PNGs
are generated) plus `public/app-icon.svg` for the window and
`electron/resources/app-icon.png` for the Electron shell.

## 4. Links and defaults pointing at upstream

Two documentation links in the UI send users to upstream's repository:

- `src/components/ApiKeys.tsx:273` → `github.com/milind-soni/OpenMausBot/blob/main/docs/byo-vps.md`
- `src/components/LinuxLocalControl.tsx:16` → `.../docs/linux-desktop.md#enable-local-control`

A customer clicking "docs" and landing on the project we forked from is a small
leak with an outsized effect on how bought-and-paid-for the product feels.

These are the visible members of a larger family. The rest — the analytics
destination, the update feed, and the Composio broker that a **packaged** build
falls back to — are recorded in `.claude/skills/commercial-fork/SKILL.md`, which
is the authority on them. Do not duplicate that list here; check both before a
build ships.

## 5. Permanent divergence forecast

Rebranding means editing files upstream owns, which is divergence we keep
forever. Worth forecasting, because the number is small and the alternative is
worse.

Ten component and lib files gain a one-token change each, plus two more if the
upstream documentation links in §4 are repointed. A conflict only occurs if
upstream edits the same line, and these are stable copy strings — so the
expected cost is close to zero and the worst case is re-applying a substitution.
`electron-builder.yml` diverges wholesale, but it is configuration we were
always going to own.

The alternative — a runtime string-catalog indirection so no upstream file is
touched — would add a module, a lookup at every call site, and a layer of
indirection over fourteen constants. That fails the deletion test in
`module-design`: remove it and almost no complexity disappears, because there is
nothing varying behind it but a name.

Check the true cost at any time with:

```sh
git diff --stat upstream/main
```

Every file listed is one we maintain. If rebranding ever pushes that list past
what a merge can absorb, revisit the catalog idea — but measure first.

## Configuring a build

Configuration reaches the two halves of the app by different routes, because
they are built differently.

**The window** — set at `pnpm build`, inlined by Vite:

```sh
VITE_PRODUCT_NAME="Acme Agents"      # window title, onboarding, (Phase 2) all UI copy
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
  -c.extraMetadata.distribution.defaultModel=ollama::qwen3:4b
```

or as a block in a per-customer config file that extends `electron-builder.yml`:

```yaml
extraMetadata:
  distribution:
    defaultEngine: hermesAgent
    defaultModel: "ollama::qwen3:4b"
```

`electron/distribution.mjs` reads that back and forwards it to the server as
`OMB_DEFAULT_ENGINE` / `OMB_DEFAULT_MODEL`. The real environment still wins over
a baked value, so a packaged build can be redirected in the field for debugging.

Both are preferences and neither can produce a bot that cannot answer: an engine
that is not installed loses to one that is, and a model the chosen engine does
not list is ignored in favour of its own default. Local catalogs are discovered
at runtime, so a model the user has not pulled yet is simply absent — which is
why a missing id means "not here" rather than "misconfigured". See
`server/distribution.ts`.
