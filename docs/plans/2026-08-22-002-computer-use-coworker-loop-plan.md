# Computer use at coworker level

Status: **in progress.** P1 (honest open), P3 (last-look), P4 (frontier
fused observe), and durable shared computer (resume / workspace profiles)
are in the tree. Live Claude-on-VM A/B is still **unknown**. Scope is
**general computer use** in this product (Box, Local VM, host Cua, every
engine) — not a one-bug patch for leftover tabs.
The Path A Beehiiv/`example.com` turn is the **symptom that proved the loop
is broken**, not the only work.

Bar: the computer-use **loop** those products run (honest observation after
every act, session that still holds it, model recovers). That is not the same
as cloning Grok Bot or Cowork as products.

Written 2026-08-22. First draft inferred the loop from `computer-proxy.ts`.
Sources below were read afterwards; §1 was corrected to match them.

Related: [`docs/local-model-path.md`](../local-model-path.md),
[`docs/known-bugs.md`](../known-bugs.md) B-24,
[`docs/computer-use-integration.md`](../computer-use-integration.md),
Box loop in `server/computer-proxy.ts`, Path A wrap in
`server/compact-computer-*.ts`, frontier wrap in `server/observe-computer*.ts`.
P4 write-up: [`2026-08-22-005-computer-frontier-observe-plan.md`](2026-08-22-005-computer-frontier-observe-plan.md).
Durable computer: [`2026-08-22-006-computer-durable-shared-plan.md`](2026-08-22-006-computer-durable-shared-plan.md).
Routing: [`2026-08-22-007-computer-routing-fleet-plan.md`](2026-08-22-007-computer-routing-fleet-plan.md).
Safety / eval: [`2026-08-22-008-computer-safety-eval-plan.md`](2026-08-22-008-computer-safety-eval-plan.md).

This plan does **not** add browse recipes, hostname matchers, or `vm_*` names
in the system prompt.

## Scope and sources (read this first)

**Is this only the leftover-tab bug?** No. P1 fixes that lie because a
coworker loop cannot start if open reports the wrong screen. P3–P7, the
three-surface table, and the stop line are for every computer we ship.
Host-desktop Cua (macOS Auto) and Box are in the map; the first *code* is
Local VM because that is where the loop is currently false.

**Was this researched against Grok Bot and Claude Cowork before the first
draft?** No. The first draft treated “Cowork / Grok” as “strong model +
screenshot + retry,” which is the loop inside our Box adapter, not those
products. First-party sources, read 2026-08-22 after that draft:

| Source | What it is |
|---|---|
| [Let Claude use your computer in Cowork](https://support.claude.com/en/articles/14128542-let-claude-use-your-computer-in-cowork) | Anthropic help: computer use in Cowork / Claude Code |
| [How we contain Claude across products](https://www.anthropic.com/engineering/how-we-contain-claude) (2026-05-25) | Anthropic engineering: Cowork VM vs host computer use |
| [Grok Bot overview](https://docs.x.ai/grok-bot/overview) | xAI: persistent cloud computer, shared by all bots |
| [Use the computer and apps](https://docs.x.ai/grok-bot/computer-and-apps) | xAI: screens, connectors, take-over, `/workspace` |
| [Approvals, security, and privacy](https://docs.x.ai/grok-bot/approvals-security-and-privacy) | xAI: hand back for secrets; local computer is separate |
| `server/computer-proxy.ts` | **Our** Box loop (primary for what *we* already built) |

Secondary write-ups (Pluto, affiliate posts) were not used as facts.

**What matching those products actually means** (beyond “don’t lie about
the tab”):

| Their architecture | Closest thing we have | In this plan’s first build? |
|---|---|---|
| **Connectors first**, browser second, pixels last (both) | Composio + Hermes web (we *disable* web on Path A so Granite uses the VM) | Policy later, not P1 |
| **Grok Bot: one persistent cloud Linux VM per user**, all bots share files/cookies/logins; each bot has its **own screen**, not its own security boundary | Shared Local VM + Box; Computer panel preview; `/home/cua/workspace` durable, Chromium in `.browser-profiles`; Start resumes a healthy stopped VM | Per-bot screens on one VM, and lid-closed always-on, stay out |
| **Grok Bot: work continues with the laptop closed** | Box / VPS yes; Local VM only while this PC and WSL/Podman stay up | Out of P1–P3 |
| **Cowork: hypervisor Linux VM for files/code**; **computer use is the real desktop** (screenshots, no sandbox, per-app permission, desktop must stay awake) | Local VM ≈ their *sandbox*, not their computer-use tier. Host Cua ≈ their computer-use tier (macOS). Path A never drives the Windows desktop | Do not “make Granite click the host.” Keep VM as the sandbox |
| **Vision** (screenshots as the model’s eyes) | Box JPEG fused; Path A text AX only | Frontier P4 in tree; not Granite |
| **Long-lived agent session + memory** | Claude `--resume`; Hermes dies every turn | P3 observation store; P6 keep-alive last resort |
| **Take the wheel for password / MFA / CAPTCHA** | Already in prompts + `computer-control` | Keep; invalidate last-look on hand-back (P3) |
| **Named teammates, bot-to-bot, teach-a-task / routines** | `ask_bot`, fleet, no Grok “routine recorder” | Out of this plan |

So: this plan can make **our computers run the same *control loop*** those
products use for hands. It cannot, in P0–P3, make Path A Granite into Grok
Bot or Cowork. Those are a cloud VM + frontier model + connectors +
persistent logins + (Cowork) host-screen computer use.

## Probed on this box (2026-08-22, before P1)

Live `cua-driver` in `openmausbot-computer` (do not re-litigate from fakes):

`list_windows` — **two** Chromium windows, **same pid** (509), different
`window_id`s:

| z_index | title |
|---|---|
| 1 | Quoted For Truth - beehiiv - Chromium |
| 2 | Example Domain - Chromium |

`frontmostChromiumWindow` would now pick Example Domain. Probe’s `vm_open`
looked at Beehiiv: we bound a window **before** navigate and read **that**
id after, so a second window (or a later open) can be what the person sees
while the tool result is the old one. That is a **general shared-desktop**
bug (Grok Bot: one computer, leftover apps stay). It is not “no active-tab
field.”

`describe get_browser_state` — bind = `pid` + `window_id`; snapshot =
`target_id` + `tab_id`. **No** `active` / `selected` tab input. 
`include_screenshot` captures a tab **without selecting it or foregrounding
its native window** (Cua’s words). `snapshot_format`: `dom_refs_v1` |
`semantic_v2`. `additionalProperties: true` on this tool (unlike
`list_apps`).

`describe browser_navigate` — required `target_id`, `tab_id`, `url`;
“Navigate **one tab** of an **exactly-bound** browser target.”

A bind `get_browser_state` on the Example Domain window (no session) →
`browser_route_unavailable`: CDP `9222` timed out. Do not assume P2 can
print a page URL until `browser_prepare` + a live session returns one.
**P1 must not invent an active-tab field Cua does not have.** After
navigate: `list_windows` again and look at the Chromium window the
desktop now stacks on top, and say so if that id is not the one we
prepared.

Still not probed (hour-1 of P1, not more product research): successful
`get_browser_state` payload after `browser_prepare` (does it include URL?).
Claude-on-VM A/B (P0 live, after honesty).

Nothing else from Grok Bot / Cowork docs is load-bearing for P1.

## check-upstream-first

Fetched `upstream/main` 2026-08-22. This branch is **33 ahead, 0 behind**.

| Path | Upstream | Fork |
|---|---|---|
| `server/computer-proxy.ts` | owns Box act-and-observe | do not add Local VM logic here |
| `server/computer-observation.ts` | owns URL sanitising + `ObservationCoordinator` | reuse, do not fork a second coordinator |
| `server/container-mcp.ts` | transparent Cua stdio bridge | do not parse MCP here |
| `server/compact-computer-*.ts` | **absent** | keep; they will not collide |
| `server/observe-computer*.ts` | **absent** | keep; they will not collide |
| `server/turn-context.ts` | exists; we already diverged (`replayAfterFailedResume`) | additive only |

**Decision:** coworker-level Local VM work stays in fork-owned files
(`compact-computer-*` plus one new observation-store module). Do not edit
`computer-proxy.ts` to “port Box to the VM.” Reuse `computer-observation.ts`
helpers (`normalizeBrowserUrl`, `safeBrowserUrl`, `ObservationCoordinator`).

---

## 1. What “coworker level” actually is

### 1.1 The control loop (this plan’s bar)

Neither product ships a “wrong window” module. Hands work like this:

1. The model calls a tool (`open_url` / click / type).
2. The **same tool result** comes back with a fresh observation (screenshot,
   page URL + title, accessibility tree).
3. The model compares that observation to the user’s goal **in the same turn**.
4. On mismatch it calls another tool. Prior tool results stay in the session.

The harness’s job is sensors that do not lie, plus a session that still
holds those results. The model’s job is step 3–4. Site logic never belongs
in our code.

Grok Bot’s docs put connectors **before** clicking a website. Cowork’s help
article uses the same order: connectors → Claude in Chrome → screen pixels.
We already know a 3B will pick Hermes `extract` over the VM if both exist;
that is why Path A disables native web. Frontier bots on Box/VM should keep
that preference (structured tool beat pixels). That is general computer use,
not a Beehiiv special case.

### 1.2 What those products are (so we do not clone the wrong thing)

**Grok Bot** (xAI docs): a **named teammate** on a **persistent cloud Linux
VM assigned to the user**, shared by every bot on the account. Browser
cookies, `/workspace` files, and logins survive. Each bot has its own
**screen** on that computer so they can work in parallel; screens are not
security boundaries. Work continues if the laptop is closed. Computer use
is for apps without a connector. Passwords / MFA / CAPTCHA → user takes
control on the Agent Computer preview. Optional **local** command execution
is a separate, default-ask policy.

**Claude Cowork** (Anthropic help + containment post): two different
computers. Files and shell run in a **hypervisor Linux VM** (workspace
mounted, credentials stay on the host). **Computer use** is *not* that VM —
it screenshots and clicks the **real desktop**, with per-app permission,
no sandbox, Claude Desktop open, machine awake. Claude is trained to
prefer connectors and Chrome automation before raw screen.

Our **Local VM** is Grok-Bot-shaped (shared Linux desktop you watch) and
Cowork-**sandbox**-shaped (isolated guest). It is **not** Cowork computer
use (host Windows). Do not “fix Path A” by driving the user’s real desktop.

On **our Box** this loop is already explicit (`server/computer-proxy.ts`):

- Every UI action is act → 350 ms settle → JPEG in the **same** MCP result.
- `open_url` then reads Chrome’s loopback `/json/list`. If the URL does not
  match, the result is `opened …, but the exact destination was not verified.
  Current structured state: …` — the model sees the real tabs.
- `wait_for_navigation` is a **tool the model may call**, not a silent rewrite.
- Prompt: inspect, prefer `browser_snapshot` / `browser_click`, do not
  screenshot after an action that already returned a frame.
- Who-is-driving: while the person holds the wheel, tools refuse.

None of those products recover from a tool that says “opened example.com”
while showing another site’s chrome. That is why P1 is general, not a
Beehiiv patch: **every** computer we mount must return what is on screen.

---

## 2. What we have today (three computers, three loops)

| Surface | Who drives it | Observation after act | Session across user messages | Catalog |
|---|---|---|---|---|
| **Cloud Box** | Claude, Codex, grokAgent, cloud Hermes | JPEG + optional CDP URL (coworker-shaped) | Claude `--resume` keeps tool history; Hermes ACP **kills the process per turn** | Box’s small tool list |
| **Local VM, frontier** (Claude / Codex / grokAgent / cloud Hermes) | Full Cua MCP via `observe-computer-mcp` → `container-mcp` | Fused screenshot after mutating Cua tools (same MCP result). Cua names kept. `wait_for_navigation` is a model-facing honesty check. | Claude `--resume` yes; Hermes no | ~60 Cua tools + `wait_for_navigation` (OK for 200k) |
| **Local VM, Path A** (Ollama Granite 3B + Hermes ACP) | `compact-computer-mcp` → 8 `vm_*` tools, wrapper fills Cua ids | Fused **text** AX excerpt on `vm_open` / `vm_window`. No screenshot (8k). Excerpt can describe a **different tab** than the URL in the success line. | New `hermes acp` process every turn. `session/load` returns `{}`. Replay is user/assistant **text only** — no trees. Last look dies with the MCP process, so `vm_click` on the next turn needs a new look. | 8 tools, short blurbs |
| **Host Cua** (macOS Auto / local-computer) | Upstream `local-computer` MCP | Cua on the **real desktop** (Cowork computer-use shaped) | Same per-driver session rules | Full Cua |

`drivers/grok.ts` (chat-completions) has **no computer tools**. Matching
**Grok Bot** in this app means **`grokAgent` (ACP)** plus Box or Local VM,
not the HTTP Grok driver. We cannot match Grok Bot’s always-on cloud VM
with a 3B on WSL.

The Path A prompt is already the right altitude (“inspect the desktop before
acting”). The Box prompt is more specific because Box actually returns a
frame. Do not copy Box’s “every action returns the screen” onto Path A until
that is true.

---

## 3. Gaps vs coworker level

### 3.1 Sensors that lie (harness — fix)

`openVisibleUrl` already `get_window_state`s the pid it prepared. The live
Probe turn still returned title **Quoted For Truth – beehiiv** after
`vm_open({url: https://example.com})`, and the result text led with
`opened https://example.com`.

Likely causes (not site recipes):

- `bindingFrom` takes `tabs[0]`, not the **visible / active** tab.
- `get_window_state` runs before the new document is on screen, so AX/title
  are the previous page.
- Success copy always repeats the requested URL, even when the observation
  did not change.

Box does not do that: it reports the **current** `/json/list` URLs when
verification fails.

### 3.2 The loop is torn between turns (harness — fix)

Coworker recovery is usually a **second tool call in the same turn**. When
the user says “do it for me” after a how-to:

- Hermes is a new process; MCP last-look RAM is empty.
- Replay has the how-to **prose** and not the tree.
- `vm_click` without a look this turn fails closed (“window was not read”).

A strong model would `vm_window` then `vm_click`. Granite often writes more
prose. Either way the harness made the follow-up the hard path. Claude Cowork
does not drop the last screenshot when you send the next sentence.

### 3.3 Frontier Local VM fused observe (harness — in tree; live A/B unknown)

Claude on `computer: vm` now gets `observe-computer-mcp` in front of raw
Cua so mutating tools return a screenshot in the same result. We have
**not** A/B’d Claude vs Granite on this VM. Until a Claude-on-VM live turn
is in the native tee, do not treat P4 as proven coworker — only as the
Box-shaped sensor layer.

### 3.4 Model class (not a wrapper)

Granite 3B, 8k, **no vision**. Cowork/Grok/Claude see the pixels. We cannot
compensate that with more `vm_*` recipes. After honesty + session memory, one
clean live turn decides whether Path A is “chat + a desktop you watch” or
still worth driving unsupervised.

### 3.5 Nested Windows virt (environment)

WSL2 → Podman → XFCE. Isolated Cua Chromium (`allow_launch` + `isolated_new`)
SIGTRAPs; image layer 7 uses existing profile + `--no-sandbox`. Firefox ESR
has no Cua typed-browser route. Cua `get_browser_state` **does** speak CDP
(`ws://127.0.0.1:9222/devtools/browser/…`). A bind on this box 2026-08-22
refused `browser_route_unavailable` (CDP connect timed out). Box’s
`waitForNavigation` via `/json/list` is still not something we should copy
until that endpoint is healthy. Do not bump the image layer in P1 to chase it.

### 3.6 Product routing

People compare Path A Granite to Cowork. Those are different engines on
different loops. The Local VM is the **sandbox**; the engine is the
**coworker**. Same VM + Claude / grokAgent is the path that can match the bar.
Granite is the path that must not be marketed as unsupervised hands.

---

## 4. Where we are disadvantaged, and how to compensate

| Disadvantage | vs Cowork / Grok / Box | Compensate (allowed) | Do not |
|---|---|---|---|
| 3B, no vision, 8k | Frontier + screenshots + 100k+ | Tiny catalog, short text trees, fused look **of the window we drove** | Raise `OLLAMA_CONTEXT_LENGTH`; send JPEGs to Granite; name tools in the prompt |
| Hermes one process per turn | Claude `--resume` / Cowork session | Persist last observation + last look **in our store**, inject a short replay stanza; optional later: keep ACP child alive | Fake a click loop in the wrapper |
| No CDP `/json/list` in the VM | Box verifies navigation | Use Cua `get_browser_state` fields we already bind (`target_id`, `tab_id`, window title). If URL is present, print it. If absent, print title + tree and **do not** claim the requested URL landed | Match title to hostname in code |
| Nested virt / SIGTRAP | Box is a real Linux VM | Stay on existing-profile Chromium (layer 7). Front the window we prepared | Isolated-profile launch; Firefox as the Cua browser |
| Cua required ids | Box `open_url({url})` / `click(x,y)` | Wrapper fills ids (already). Persist look so click-by-index works after a process death | Expose 60 tools to Granite again |
| `grok` driver has no MCP | grok.com agent | Document + UI: computer use is `grokAgent` | Reimplement Box inside `drivers/grok.ts` |
| Windows NSIS overlay loop | Cowork is a hosted VM | Overlay `dist-server` + full quit still the live-test loop until `package:win` is reliable | Ship recipes to hide overlay skew |

Compensation is **better sensors and a session that remembers the last
picture (or tree)**. It is not a script that clicks “Posts” on Beehiiv.

---

## 5. Where we are already doing the wrong thing, and how to course-correct

| Wrong | Why it fights the coworker loop | Course-correct |
|---|---|---|
| Success line always `opened ${url}` | Model is told the goal is done; tree contradicts it; 3B confabulates | Report what was **seen** (title, optional URL). If the tree did not change after navigate, say so. Box’s “not verified; current state: …” is the template |
| Bind `tabs[0]` then look at the **pre-navigate** window id | Navigate can leave a second Chromium window (same pid, new `window_id`); the person sees Example Domain, the tool still reads Beehiiv | After navigate, `list_windows` and look at frontmost Chromium **now**. Report both titles if the id changed. Cua has no active-tab field |
| Look immediately after `browser_navigate` ok | Stale AX | Wait until title/tree **differs from the pre-navigate snapshot**, or time out and return the unchanged look with an honest note. Generic settle, not hostname match |
| Last look only in MCP RAM | Follow-up click cannot succeed; recovery requires the model to look again | Thread-scoped store (see §7 P3) |
| Replay user/assistant text only | Next turn continues a how-to with no observation | Same store: one “Last computer observation” stanza, truncated, no tool names required in the prompt body beyond the observation text |
| Fused look of **frontmost** Chromium for `vm_window {}` | Can be a different window than the one `vm_open` just drove | Prefer **last driven** pid/window this MCP process / this thread; fall back to frontmost only if none |
| Measuring “3B won’t click” on a Beehiiv tree | Confuses harness lie with model choice | P0 eval: tool text must contain the destination page **before** judging the model |
| Hermes patches (`ensureHermesLocalCatalog`, eager `vm_*`, unwrap `tool_call`) | Necessary for 8k; fragile vs Hermes upgrades | Keep; do not add more prompt-side tool coaching. Wire-flag busts schema cache (`--wire=vm-look-*`) |
| Treating Path A computer as the coworker product | Users expect Cowork | Copy: the VM is the sandbox; pick Claude/grokAgent on that VM for unsupervised hands. Granite: you watch, you take the wheel (`takeWheel` already exists) |

---

## 6. Target architecture (one loop, two catalog sizes)

```text
Agent CLI (Claude --resume  |  Hermes ACP per turn + our replay)
        │
        ▼
MCP stdio
  frontier: observe-computer-mcp → container-mcp  →  Cua in the VM
  Path A:   compact-computer-mcp → container-mcp → Cua
        │
        ▼
Observation contract (fork-owned, both catalogs)
  after mutate: settle → structured title/URL if Cua has it
              → text AX excerpt (always, Path A)
              → JPEG on frontier VM/VPS (`observe-computer-mcp`); never to Granite
  persist last observation + last click bind on the thread
        │
        ▼
Linux desktop (image layer 7 Chromium, existing profile)
```

Invariants:

- The model never sees Cua session/tab tokens (Path A). Frontier may; Cua’s
  native schema already requires them.
- No site, no path rewrite, no “click More information.”
- A tool result that describes the screen is allowed to **disagree** with the
  URL the model asked for. That disagreement **is** the coworker signal.
- Deleting the compact wrapper must not be required for Claude-on-VM to work;
  Claude is wrapped only by `observe-computer-mcp`, never `compact-computer-mcp`.

---

## 7. Implementation plan

Do not start P1 until P0’s unit test exists (diagnosing-bugs: a command that
asserts the symptom).

### P0 — Feedback loop (half day)

**Files:** `server/compact-computer-open.test.ts` (extend the existing fake
`CuaToolCaller`; do not mock `child_process`).

**Tests:**

1. After navigate, if `get_window_state` title is still the pre-navigate
   title, the returned text must **not** be only `opened https://example.com`
   presented as verified. It must include the seen title and that the look
   did not change (wording is ours; assert the seen title is present and the
   requested host is not claimed as verified).
2. `tabs[0]` is Beehiiv and an `active` / selected tab is example.com →
   navigate uses the active tab id (once we implement P1; write the test
   first, red, then green).
3. `replayAfterFailedResume` currently drops tools — add a failing test in
   `server/turn-context.test.ts` for “last computer observation is replayed”
   in P3, not here.

**Live (after P1, not before):** new bot, VM ready, `https://example.com`.
Pass = native tee `vm_open` / `tool_call_update` text contains **Example
Domain** (or the example.com title Cua reports). Chat prose does not count.

**Live, frontier (same VM, skip if no Claude key):** Claude bot, `computer:
vm`, same prompt. Capture whether the **tool result** already contains a
frame (P4) and whether Claude still look-clicks. Status is **unknown**
until that tee exists.

### P1 — Honest open (1–2 days)

**Files:** `server/compact-computer-open.ts`, tests. Wire flag bump
`--wire=vm-look-4` in `compact-computer-tools.ts` so Hermes drops the cached
schema (schemas may be unchanged; bump anyway if result shape in descriptions
changes — if not, skip the bump).

**Behaviour:**

1. Snapshot title/excerpt **before** `browser_navigate`.
2. Navigate the tab we bound (`target_id` + `tab_id` from `get_browser_state`
   after `browser_prepare`). Cua 0.20.0 has **no** active-tab input — do not
   invent one. `tabs[0]` stays the fallback when the bind result has no
   other tab id.
3. After navigate, `list_windows` again. Look at the **frontmost Chromium
   now** (same z_index rule). If that `window_id` differs from the one we
   prepared, the tool text must include **both** titles. That is a desktop
   screenshot in words, not a hostname matcher.
4. Poll `get_window_state` on the window we will report until excerpt/title
   !== pre-snapshot or attempts exhausted (reuse `WINDOW_POLL_*`, inject
   `OpenUrlClock` — tests stay sleepless).
5. Result text: seen title(s) + excerpt. If unchanged, explicit “the window
   still shows …” using the seen title. Never invent a mapping from Chromium
   chrome labels to the user’s words.

`vm_window {}`: look at last driven window this process if set, else
frontmost (today’s fallback).

### P2 — Structured URL in the observation (half–1 day, only if Cua has it)

After navigate, call `get_browser_state` on the bound pid/window. If a page
URL is in the payload, run it through `safeBrowserUrl` from
`computer-observation.ts` and put it in the tool text (Box style). If Cua
0.20.0 has no URL, **stop**; do not scrape the address-bar AX as a URL
parser (fragile, railroad-adjacent). Optional later: image layer 8 + Chromium
`--remote-debugging-port=9222` to copy Box’s `/json/list` (P5).

### P3 — Last observation survives the turn — **done in tree**

Coworker follow-ups. Fork file `server/computer-thread-state.ts` (upstream
does not have it).

**Store (in memory on the harness, keyed by `threadId`, wiped on thread
delete / VM recreate / take-wheel handoff):**

- last excerpt text (capped, same 4k)
- last title
- last pid / window_id / snapshot_id / tokens needed for `vm_click`
- updatedAt

**Wire:**

- `compact-computer-mcp` reads/writes via env + loopback like control-token
  (do **not** put tokens in argv). Small POST on existing internal server, or
  a file under the thread dir we already own. Prefer the store the harness
  already has (`server/store.ts`) with a **new field on a fork-owned map**,
  not a new JSON file in `~/.openmausbot` if a map on the process suffices
  (harness already lives for the app lifetime).
- `replayAfterFailedResume` / `buildTurnContext`: if last observation exists,
  append a short block: what the Linux desktop last showed. **Do not** name
  `vm_click`. The observation is data, not a recipe.
- `vm_click` with `{index}`: use stored look if this MCP process has none
  (process died). If the store is older than a take-wheel or a successful
  look from another bot on a shared VM, invalidate.

**Tests:** `computer-thread-state.test.ts`; turn-context replay includes the
stanza; compact-computer-mcp click without an in-process look succeeds when
the store has a look (fake Cua).

**Stale-look rule:** after `computer-control` hand-back, drop the store for
that bot’s thread (the person may have changed the screen). Same when
`vm_open` starts (replace, don’t merge).

### P4 — Frontier Local VM fused observe — **done in tree**

Product required fused observe without waiting for a Claude key. Live
Claude-on-VM A/B is still **unknown** (skip if no key; do not treat unknown
as “Claude already self-looks”).

Fork files: `server/observe-computer.ts`, `server/observe-computer-mcp.ts`.
Plan: [`2026-08-22-005-computer-frontier-observe-plan.md`](2026-08-22-005-computer-frontier-observe-plan.md).

Non-inject Local VM / VPS: wrapper in front of `container-mcp`. After
mutating Cua tools, attach a screenshot in the same MCP result using
`ObservationCoordinator`. Keep Cua names. Do not wrap Claude in
`compact-computer-mcp`. Path A stays text AX. Host Cua is not wrapped.
`wait_for_navigation` is a model-facing honesty check (exact URL, at most
three bounded reads, no silent hostname retry).

### P5 — Image layer (optional, slow)

Only if P2 finds no URL in Cua state **and** frontier/P1 still bind the
wrong tab:

- Layer 8: Chromium with loopback DevTools like Box (`9222`), `--no-sandbox`
  already required.
- Reuse `parseBrowserTargets` / `waitForNavigation` **as an honesty check**
  (report current URLs), not as a silent retry-until-hostname-matches loop
  with no observation.

Rebuild Local VM; bump `IMAGE_LAYER_VERSION` in `container-computer.ts`.

### P6 — Hermes process lifetime (last resort)

Keeping `hermes acp` alive across turns would be the real Cowork session.
That lives in **upstream-owned** `server/drivers/acp/core.ts` (`settle` →
`killCliTree`). Do not do this in the same change as P1–P3. If P3 is not
enough for frontier Hermes on the VM, a later plan can hold the child keyed
by `threadId` with a documented idle timeout. Granite still needs P1 either
way.

### P7 — Product copy and routing (half day, with P1 overlay)

- Path A / Local model docs: computer-use coworker level is **Claude,
  Codex, or grokAgent on the Local VM or Box**. Granite can open and read;
  unsupervised multi-step is not the promise.
- Settings / Computer panel: one line that the visible desktop is the
  source of truth; take the wheel when it is on the wrong page (already
  built).
- Do not delete Probe/Zuko bots in the user’s fleet from this plan.

### P8 — Stop line for Granite wrappers — **recorded 2026-08-22**

After P1+P3 overlay + live example.com (thread `98f767f9-…`): tool text
was Example Domain; Granite called `vm_open`. Stop adding Granite-specific
computer wrappers. Keep P1–P3 and eight `vm_*` names. Details:
[`2026-08-22-008-computer-safety-eval-plan.md`](2026-08-22-008-computer-safety-eval-plan.md).

---

## 8. File / ownership map

| Change | File | Upstream? |
|---|---|---|
| Honest open, active tab, settle | `server/compact-computer-open.ts` | no |
| Wire names / wrap | `server/compact-computer-tools.ts` | no |
| Click + persist hook | `server/compact-computer-mcp.ts` | no |
| Thread last-look | **new** `server/computer-thread-state.ts` | no |
| Replay stanza | `server/turn-context.ts` | yes, already diverged — keep additive |
| Mount wrap (already) | `server/index.ts` inject compact + frontier observe | yes — keep the one-line registers |
| Frontier fused observe | **new** `server/observe-computer.ts`, `observe-computer-mcp.ts` | no |
| URL helpers | `server/computer-observation.ts` | yes — **import only** |
| Box JPEG loop | `server/computer-proxy.ts` | yes — **do not touch** for this plan |
| Image layer 8 | `server/container-computer.ts` | yes — only in P5 |
| ACP keep-alive | `server/drivers/acp/core.ts` | yes — only in P6 |
| Copy | `docs/local-model-path.md`, `docs/known-bugs.md` B-24 note | fork docs |

---

## 9. Verification

```sh
pnpm typecheck
pnpm test
pnpm vitest run server/compact-computer-open.test.ts server/compact-computer-mcp.test.ts server/turn-context.test.ts
pnpm lint
```

Live Path A: overlay `resources/server/index.js` **and**
`compact-computer-mcp.js` (both nested copies), full quit, new thread, open
`https://example.com`. Judge the **tool result**, then the model.

Do not bump `OLLAMA_CONTEXT_LENGTH`. Do not publish to
`milind-soni/openmausbot-releases`.

---

## 10. Order of work (what to do next)

1. **P0 tests** for the lying success line (red).
2. **P1** until the live tee shows Example Domain.
3. **P3** so “click that” on the next message can use the last look.
4. **P0 Claude A/B** on the same VM when a key is available (measurement;
   P4 is already in the tree).
5. Routing other computers — first slice in tree (Auto never local-inject
   computer, grok vs grokAgent copy, B-19 cards on Windows). Host Cua
   ComputerControl, VPS viewer, iOS stay later.
6. **P8** stop line recorded 2026-08-22 (no more Granite computer
   wrappers). Untrusted last-look fence in tree. P2 / P5 / P6 only on
   evidence. Remaining routing: host Cua ComputerControl, VPS viewer, iOS.

That is the coworker plan: make the Local VM’s sensors as honest as Box, keep
the last observation in context the way Cowork does, and leave recovery to
the model. Granite may still fail step 4. The sandbox should not.
