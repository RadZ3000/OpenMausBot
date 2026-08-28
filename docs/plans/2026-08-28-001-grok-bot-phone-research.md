# Grok Bot’s phone app (research)

Status: **evaluated 2026-08-28.** Input to a fork iOS release plan that
does not exist yet. Not a ship runbook. Do not treat this as permission
to follow [`ios/AppStore/RELEASE.md`](../../ios/AppStore/RELEASE.md)
(upstream’s App Store team).

check-upstream-first: fetched `upstream/main` `677538e` (0.1.38+ ahead of
this merge). License gate **green** (Apache-2.0). They already ship the
iOS companion under `ios/` plus USB Android *device control*
(`electron/android-device.mjs`, `apps/docs/content/docs/mobile/android-control.mdx`).
**No Android companion app. No Grok-Bot-shaped cloud phone client.** Do
not duplicate `ios/`. A fork release plan is a new file.

We did **not** install Grok Bot. Findings are first-party docs and the
public App Store listing, pinned below. A live iPhone pass is a later
probe, not this file.

## What Grok Bot’s phone is

The iPhone app is a **second client of a cloud product**, not a remote
control for the Mac or Windows box in front of you.

- Bots, conversations, routines, connectors, and the **shared cloud
  Linux computer** live on the account. The same roster syncs across
  signed-in devices
  ([overview](https://docs.x.ai/grok-bot/overview),
  [FAQ](https://docs.x.ai/grok-bot/faq),
  [mobile](https://docs.x.ai/grok-bot/mobile); last-updated on those
  pages 2026-08-11 / 2026-08-20).
- Work runs on that cloud VM. Closing the desktop app, laptop, **or
  iPhone** does not stop a background turn or routine
  ([FAQ](https://docs.x.ai/grok-bot/faq),
  [troubleshooting](https://docs.x.ai/grok-bot/troubleshooting)).
- Sign-in is **Login with Cursor** (browser OAuth, SSO if the org uses
  it). There is no QR-to-laptop pairing
  ([mobile](https://docs.x.ai/grok-bot/mobile),
  [get started](https://docs.x.ai/grok-bot/get-started)).
- Grok Bot requires cloud data storage. Cursor **Legacy Privacy Mode
  blocks it entirely**
  ([FAQ](https://docs.x.ai/grok-bot/faq),
  [teams](https://docs.x.ai/grok-bot/teams-and-enterprises)).
- There is **no model picker**. Routing is fully managed
  ([teams](https://docs.x.ai/grok-bot/teams-and-enterprises)).

Marketing one-liner on [x.ai/bot](https://x.ai/bot): “One team, wherever
you are — on your desk and in your pocket.”

That is the opposite of this repo’s companion: our phone talks to a
sidecar on **this PC**; the harness, keys, and Local VM stay here; a
sleeping computer is a dead phone ([`docs/ios-companion.md`](../ios-companion.md)).

## Platforms (launch, first-party)

From the [FAQ](https://docs.x.ai/grok-bot/faq) “Which platforms are
supported?” and [mobile](https://docs.x.ai/grok-bot/mobile):

| Ships at launch | Does not |
|---|---|
| macOS (Apple silicon and Intel) | Linux **desktop** app (the *computer* is Linux) |
| Windows (x64 and Arm64) | **Android** |
| iPhone, **iOS 18 or later** | **iPad** |

Secondary posts (“Android coming soon”) are not a finding. First-party
text on 2026-08-28 still says Android and iPad are **not supported at
initial launch**.

Get-started still tells you to install the **desktop** app as the
primary setup path, then “you can also set up and use Grok Bot for iOS”
([get started](https://docs.x.ai/grok-bot/get-started)). New iOS users
can wait while the shared computer is provisioned; they are not pairing
to a local sidecar.

## What the iPhone app can do

From [Grok Bot for iOS](https://docs.x.ai/grok-bot/mobile)
(updated 2026-08-20):

- Start work, ask, **approve**, review results away from the desk.
- Send text, dictate, take/attach a photo, attach an image or file.
- Mention another Bot or `@everyone` in a group; reply in a thread;
  react. Drafts persist per conversation.
- Create a Bot or a group (`+` → New Agent / New Group Chat). Edit a
  Bot profile, pin/hide, delete a Bot.
- Open the **shared computer** from a conversation: watch browser or
  desktop work, **take over** for password / 2FA / CAPTCHA, inspect the
  screen, return control. Same computer every Bot on the account uses
  ([computer and apps](https://docs.x.ai/grok-bot/computer-and-apps)).
- On a Bot profile: inspect a routine’s schedule, next run, and
  instruction; **pause/resume** with Active.
- Search conversations (and available message / file / link / routine
  hits).
- Settings: account, plugins, Bot settings, Auto Review when available,
  appearance, usage / eligible **iOS subscription**, sign out / delete
  account.
- Notifications: first-run OS permission plus a per-Bot notification
  switch. **Push delivery is still rolling out**; in-app attention
  states remain when push is not enabled for the account
  ([mobile](https://docs.x.ai/grok-bot/mobile),
  [settings](https://docs.x.ai/grok-bot/settings-and-notifications)).

Approvals on iPhone are **Approve once** and **Deny**. Desktop also has
**Always allow**
([approvals](https://docs.x.ai/grok-bot/approvals-security-and-privacy)).

## What stays desktop-only

Same mobile page, plus teams:

- Edit a routine’s schedule or instruction, view run history, test, or
  **delete** a routine.
- Teach-by-demonstration / some advanced desktop controls.
- **Reset** the cloud computer (members reset from desktop; “The mobile
  apps cannot reset a computer”
  ([teams](https://docs.x.ai/grok-bot/teams-and-enterprises))).
- Hardware-security-key WebAuthn for computer-browser prompts is
  forwarded to the **desktop** app (Windows forwarding still rolling
  out) ([teams](https://docs.x.ai/grok-bot/teams-and-enterprises)).

They shipped a phone that is good at **message, approve, watch, take
over**, and left computer lifecycle and workflow-authoring on the desk.

## App Store listing (public, 2026-08-28)

[Grok Bot, id 6794501026](https://apps.apple.com/us/app/grok-bot/id6794501026):

- **Only for iPhone.** Requires iOS 18.0+. Also listed for visionOS 2.0
  (do not read that as an iPad product; docs still say not iPad).
- **Free** with in-app purchases. US store showed Pro / Pro+ / Ultra
  price points; do not treat those as our SKU list or as matching
  [x.ai/bot](https://x.ai/bot) web pricing without another check.
- Size ~76 MB. Category Productivity. Age 18+.
- Seller **X Corp.** Copyright **Anysphere Inc.** Terms/privacy:
  `cursor.com`. That is Cursor-account identity, not a laptop QR.
- Version **1.4.0** (listing “1d ago” when fetched): home-list
  performance, HEIC attachments, long-press duplicate a bot. Not a
  pairing/sidecar app.
- Ratings exist (hundreds). We did not review them as product spec.

## Scorecard vs this fork

The bar is “ship a phone app for *our* product,” not “clone Grok Bot.”

| Job | Grok Bot iOS | This repo today |
|---|---|---|
| Where the computer lives | Their cloud VM; lid closed is fine | Local VM / Box / host Cua on **this PC**. Sleeping PC = dead phone |
| How the phone trusts the product | Cursor account | QR / code / Tailscale / optional hosted HTTPS to **our** sidecar |
| Sync | Account-wide bots and threads | One harness; no cloud transcript store |
| Push when the app is killed | Rolling out (account-gated) | Not built. Needs our APNs + relay ([`docs/ios-companion.md`](../ios-companion.md) follow-on) |
| Approve from the pocket | Yes (once / deny) | Yes, if paired and the PC is up |
| Watch / take over the computer | Cloud desktop from the phone | Opt-in live Box view; Local VM noVNC is desktop-only |
| Create bots on the phone | Yes | Basic bot create is allowed through the sidecar |
| Android companion | **No** at launch | **No** app in tree (USB Android control is a different product). Sidecar is not iOS-only — see implication 2 |
| Store identity | Their bundle, Cursor billing | Upstream `com.openmausbot.app` / OpenMaus Mobile. Ours unset (002 Phase D) |

## Implications (binding until a ship plan says otherwise)

1. **Do not copy Grok’s architecture to “match mobile.”** Lid-closed
   phone requires a **cloud computer** (our Box/VPS, or a hosted Path C
   that is not chat-only). That is a computer-routing / Path C leftover,
   not an iOS bug. Local VM + iOS companion cannot be Grok Bot.
2. **Android is the same architecture, a second client.** The sidecar is
   HTTP + SSE + a device token (`companion/src/routes.ts`). Nothing in
   that bind is Apple-only. Grok skipped Android because *their* phone
   is a full cloud-account app (two native codebases, Cursor identity).
   That reason does not transfer. This fork is Windows-first; a Windows
   desk is more often an Android pocket than an iPhone one, and this
   box can compile Android and cannot compile iOS. iOS-first in *our*
   tree is only “the Swift client already exists,” not “Android is the
   wrong product.” A Kotlin/Compose (or equivalent) app against the
   same allowlist is in scope. It is still a **new app**, not a port of
   `CompanionCore` (Swift Foundation + Keychain + NWBrowser + ATS). Do
   not fold Play Console into the iOS TestFlight plan. USB
   `android-device.mjs` stays a different product. If we add a client
   directory, assume upstream may later use `android/` the way they
   used `ios/` — same `check-upstream-first` collision as attachments.
3. **Their phone v1 is approvals + roster + computer preview**, not
   routine authoring or computer reset. Our companion already aims at
   that slice. The gap vs Grok is **account sync, lid-closed compute,
   and killed-app push** — not a missing Swift roster.
4. **Hosted “phone anywhere”** in our Settings is a Cloudflare tunnel
   to **this PC**, still requiring the PC awake. It is not Grok’s model.
   It stays fail-closed until `controlPlaneUrl` / `companionHostSuffix`
   are real ([002](2026-08-25-002-brand-pack-plan.md) Phase D,
   [004](2026-08-20-004-release-channel-plan.md) still does not own iOS).
5. **Identity before TestFlight.** `ios/AppStore/RELEASE.md` publishes
   OpenMaus Mobile. Brand pack 002 Phase D owns iOS strings; App Store
   *submission* is out of scope there. Do not invent bundle IDs to make
   `pnpm check:brand --release` green.

## Do not

- Skip Android because Grok Bot launched iPhone-only.
- Start an Android companion because a blog said Grok would. The reason
  to do it is the sidecar + this Windows-first fork, not their roadmap.
- Point packaged desktop at `accounts.openmausbot.com` so hosted HTTPS
  lights up.
- Follow upstream’s App Store runbook as ours.
- Promise lid-closed / killed-app push in v1 without a computer in the
  cloud and APNs we operate.
- Probe Grok Bot with a customer Cursor login in this repo’s docs.

## Sources (read 2026-08-28)

Primary:

- https://docs.x.ai/grok-bot/overview (updated 2026-08-11)
- https://docs.x.ai/grok-bot/mobile (updated 2026-08-20)
- https://docs.x.ai/grok-bot/faq
- https://docs.x.ai/grok-bot/get-started
- https://docs.x.ai/grok-bot/computer-and-apps
- https://docs.x.ai/grok-bot/approvals-security-and-privacy
- https://docs.x.ai/grok-bot/settings-and-notifications
- https://docs.x.ai/grok-bot/troubleshooting
- https://docs.x.ai/grok-bot/teams-and-enterprises (updated 2026-08-20)
- https://x.ai/bot
- https://apps.apple.com/us/app/grok-bot/id6794501026

Leads, not findings: 9to5Mac / Digital Trends “Android coming soon.”
First-party FAQ still excludes Android at launch.

Our architecture (contrast only): [`docs/ios-companion.md`](../ios-companion.md).
Windows channel still does not own this:
[004](2026-08-20-004-release-channel-plan.md) Out of scope.
