// Turns a local-inject `vm_open({url})` into Cua's documented bind +
// navigate sequence. The model never sees session / tab / target ids.
//
// Cua 0.20.0 (describe --json, 2026-08-22, in the managed XFCE VM):
// - list_apps / list_windows / launch_app reject unknown fields.
// - launch_app prefers `launch_path` from list_apps; `urls` is xdg-open.
// - browser_navigate requires target_id + tab_id + url.
// - get_browser_state bind mode requires pid + window_id.
// - list_windows z_index is stacking order. Bind the frontmost on-screen
//   Chromium to navigate; after navigate, look at whoever is frontmost
//   then (a second window is common on the shared desktop). Cua 0.20.0
//   has no active-tab field — do not invent one.
// - browser_prepare attaches to a Chromium pid. Isolated-profile launch
//   (`allow_launch` + isolated_new) is Cua's other path; it SIGTRAPs in
//   nested WSL2/Podman, so this module does not use it.
// - standard permission mode only attaches to an existing Chromium when
//   `cua-driver serve` was started with `--grant existing-profile`.
import { randomBytes } from "node:crypto";
import { z } from "zod";

/** Test-stable public session label. Production mints a fresh name per open
 * because Cua will not revive an ended public session (session_unavailable). */
export const LOCAL_BROWSER_SESSION = "omb-test";

export function newBrowserSession(): string {
  return `omb-${randomBytes(4).toString("hex")}`;
}

const WINDOW_POLL_MS = 200;
const WINDOW_POLL_ATTEMPTS = 25;
/** Post-navigate look settle. Keep polling while the tree is still Chromium
 * chrome — a 1s cap stopped at the Restore-pages infobar before page AX. */
const SETTLE_LOOK_ATTEMPTS = 12;

const windowSchema = z
  .object({
    pid: z.number().nullish(),
    window_id: z.number().nullish(),
    is_on_screen: z.boolean().nullish(),
    z_index: z.number().nullish(),
    app_name: z.string().nullish(),
    title: z.string().nullish(),
  })
  .passthrough();

const appSchema = z
  .object({
    name: z.string().nullish(),
    launch_path: z.string().nullish(),
    bundle_id: z.string().nullish(),
    kind: z.string().nullish(),
    running: z.boolean().nullish(),
    pid: z.number().nullish(),
    windows: z.array(windowSchema).nullish(),
  })
  .passthrough();

const tabSchema = z.object({ tab_id: z.string().nullish() }).passthrough();
const axElementSchema = z
  .object({
    element_index: z.number().nullish(),
    role: z.string().nullish(),
    name: z.string().nullish(),
    label: z.string().nullish(),
    value: z.string().nullish(),
    element_token: z.string().nullish(),
  })
  .passthrough();
const targetSchema = z
  .object({
    target_id: z.string().nullish(),
    tabs: z.array(tabSchema).nullish(),
  })
  .passthrough();

const cuaResultSchema = z
  .object({
    status: z.string().nullish(),
    pid: z.number().nullish(),
    window_id: z.number().nullish(),
    target_id: z.string().nullish(),
    tab_id: z.string().nullish(),
    launch_path: z.string().nullish(),
    bundle_id: z.string().nullish(),
    apps: z.array(appSchema).nullish(),
    windows: z.array(windowSchema).nullish(),
    tabs: z.array(tabSchema).nullish(),
    targets: z.array(targetSchema).nullish(),
    code: z.string().nullish(),
    exit_code: z.number().nullish(),
    excerpt: z.string().nullish(),
    snapshot_id: z.string().nullish(),
    tree_markdown: z.string().nullish(),
    elements: z.array(axElementSchema).nullish(),
    refusal: z
      .object({
        code: z.string().nullish(),
        message: z.string().nullish(),
      })
      .passthrough()
      .nullish(),
  })
  .passthrough();

export type CuaToolResult = z.infer<typeof cuaResultSchema>;
export const cuaToolResultSchema = cuaResultSchema;

export type CuaCallArgs = {
  session?: string;
  pid?: number;
  window_id?: number;
  launch_path?: string;
  url?: string;
  target_id?: string;
  tab_id?: string;
  capture_mode?: string;
  include_screenshot?: boolean;
  element_index?: number;
  element_token?: string;
  snapshot_id?: string;
  x?: number;
  y?: number;
  strategy?: { kind: "existing_profile" };
};

export type CuaToolCaller = (name: string, args: CuaCallArgs) => Promise<CuaToolResult>;

export type OpenUrlClock = {
  wait: (ms: number) => Promise<void>;
  /** Override settle polls after navigate (tests). */
  lookAttempts?: number;
};

export function parseCuaToolResult(raw: string): CuaToolResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: "error", refusal: { message: raw } };
  }
  const asResult = cuaResultSchema.safeParse(parsed);
  if (asResult.success) return asResult.data;
  return { status: "error", refusal: { message: raw } };
}

function withRefusal(result: CuaToolResult, message: string): CuaToolResult {
  return { ...result, status: "error", refusal: { message } };
}

function normalizeCuaResult(result: CuaToolResult, text?: string): CuaToolResult {
  if (result.code === "session_unavailable") {
    return withRefusal(result, text ?? "session is not available to this transport");
  }
  if (result.exit_code != null && result.exit_code !== 0 && result.status !== "ok" && result.status !== "refused") {
    return withRefusal(result, text ?? `Cua exit_code ${result.exit_code}`);
  }
  return result;
}

/** Cua's MCP tools put the machine payload on `structuredContent` and a
 * markdown summary on `content[0].text`. The opener must read the structured
 * side — the summary has no launch_path / window_id. Failed calls still put
 * `{exit_code:1}` or `{code:session_unavailable}` on the structured side;
 * those are refusals, not empty successes. */
export function cuaResultFromMcp(payload: {
  structuredContent?: CuaToolResult;
  content?: Array<{ text?: string }>;
  errorMessage?: string;
  isError?: boolean;
}): CuaToolResult {
  const text = payload.content?.[0]?.text ?? payload.errorMessage;
  if (payload.isError) {
    return withRefusal(payload.structuredContent ?? {}, text ?? "Cua tool call failed");
  }
  if (payload.structuredContent) {
    return withExcerpt(normalizeCuaResult(payload.structuredContent, text), text);
  }
  if (text) return withExcerpt(parseCuaToolResult(text), text);
  return { status: "error", refusal: { message: "Cua returned an empty tool result" } };
}

function withExcerpt(result: CuaToolResult, text?: string): CuaToolResult {
  const excerpt = text?.trim();
  if (!excerpt || result.excerpt) return result;
  return { ...result, excerpt };
}

export function httpUrlFromArgs(args: { url?: string; urls?: string[] }): string | undefined {
  const direct = args.url?.trim();
  if (direct && /^https?:\/\//i.test(direct)) return direct;
  const first = args.urls?.find((item) => /^https?:\/\//i.test(item.trim()));
  if (first) return first.trim();
}

export function isChromiumApp(app: z.infer<typeof appSchema>): boolean {
  if (app.bundle_id === "chromium") return true;
  const path = (app.launch_path ?? "").replaceAll("\\", "/");
  if (path === "/usr/bin/chromium") return true;
  return app.name === "Chromium Web Browser";
}

function isChromiumWindow(win: z.infer<typeof windowSchema>): boolean {
  if (win.app_name === "Chromium") return true;
  const title = win.title ?? "";
  return title === "Chromium" || title.endsWith(" - Chromium");
}

/** Highest-z-index on-screen Chromium window. The preview follows stacking
 * order, so a successful bind of any other window can show a different page. */
export function frontmostChromiumWindow(result: CuaToolResult): { pid: number; windowId: number } | undefined {
  const matches = (result.windows ?? []).filter((win) => {
    if (!isChromiumWindow(win)) return false;
    return win.window_id != null && win.pid != null && win.pid > 0;
  });
  const visible = matches.filter((win) => win.is_on_screen !== false);
  const pool = visible.length > 0 ? visible : matches;
  const first = pool[0];
  if (!first) return;
  let best = first;
  for (const win of pool) {
    if ((win.z_index ?? -1) >= (best.z_index ?? -1)) best = win;
  }
  if (best.window_id == null || best.pid == null) return;
  return { pid: best.pid, windowId: best.window_id };
}

export function cuaRefusalMessage(result: CuaToolResult): string | undefined {
  if (result.status === "refused" || result.status === "error") {
    return result.refusal?.message ?? result.refusal?.code ?? result.status;
  }
}

function refused(result: CuaToolResult): string | undefined {
  return cuaRefusalMessage(result);
}

const WINDOW_EXCERPT_MAX = 4000;

const CHROME_LABELS = new Set([
  "minimize",
  "maximize",
  "close",
  "restore",
  "back",
  "forward",
  "reload",
  "home",
  "stop",
  "new tab",
  "tab search",
  "extensions",
  "bookmark this tab",
  "clear input",
  "view site information",
  "address and search bar",
  "close side panel",
  "close this view",
  "hidden toolbar buttons",
  "managed bookmarks",
  "saved tab groups",
  "tab groups",
  "all bookmarks",
  "menu containing hidden bookmarks",
  "open tab in split view",
  "apps",
  "bookmarks",
  "chromium",
  "infobar",
]);
const SKIP_ROLES = new Set([
  "panel",
  "grouping",
  "filler",
  "separator",
  "scroll bar",
  "scroll pane",
  "document",
  "document web",
  "application",
  "frame",
  "window",
  "web area",
  "image",
]);

function usefulLabel(raw: string | undefined | null): string | undefined {
  const label = (raw ?? "").replaceAll("\uFFFC", "").replaceAll("\uFFFD", "").trim();
  if (!label) return;
  if (CHROME_LABELS.has(label.toLowerCase())) return;
  return label;
}

function isBrowserChrome(role: string, label: string): boolean {
  const l = label.toLowerCase();
  const r = role.toLowerCase();
  if (l.includes("restore pages")) return false;
  if (CHROME_LABELS.has(l)) return true;
  if (l.includes("resize handle")) return true;
  if (l.startsWith("chrome labs")) return true;
  if (l.startsWith("energy saver")) return true;
  if (l.startsWith("performance issue")) return true;
  if (l.startsWith("control your music")) return true;
  if (r === "tool bar" || r === "slider") return true;
  if (r === "entry" && (l.includes("address") || l.includes("omnibox"))) return true;
  if (r === "alert" && l === "infobar") return true;
  if (r.startsWith("document")) return true;
  return false;
}

/** True when the compacted look has a numbered control that is not Chromium
 * chrome or the Restore-pages overlay. Title-only / chrome-only looks are not
 * a verified destination. */
export function lookHasPageControls(excerpt: string): boolean {
  for (const line of excerpt.split("\n")) {
    const match = /^\[(\d+)\]\s+(.+)$/.exec(line.trim());
    if (!match) continue;
    if (match[2].toLowerCase().includes("restore pages")) continue;
    return true;
  }
  return false;
}

function roleKey(role: string | undefined | null): string {
  return (role ?? "").trim().toLowerCase();
}

function capExcerpt(text: string): string {
  const raw = text.trim();
  if (!raw) return "";
  if (raw.length <= WINDOW_EXCERPT_MAX) return raw;
  return `${raw.slice(0, WINDOW_EXCERPT_MAX)}\n…`;
}

function treeTitle(label: string): string {
  return label.replace(/\s+-\s+Chromium$/i, "").trim();
}

/** Title of one Chromium window from a list_windows payload. */
export function chromiumWindowTitle(
  listed: CuaToolResult,
  pid: number,
  windowId: number,
): string | undefined {
  for (const win of listed.windows ?? []) {
    if (win.pid !== pid || win.window_id !== windowId) continue;
    const raw = win.title?.trim();
    if (!raw) return;
    return treeTitle(raw);
  }
}

/** Model-facing open copy. Never claims the requested URL landed when the
 * look did not change. When navigate used one window and the desktop now
 * stacks another, both titles are in the text. */
export function formatOpenObservation(input: {
  url: string;
  excerpt: string;
  preparedTitle?: string;
  seenTitle?: string;
  preparedWindowId: number;
  seenWindowId: number;
  verified: boolean;
}): string {
  const seen = input.seenTitle?.trim();
  const prepared = input.preparedTitle?.trim();
  const moved = input.preparedWindowId !== input.seenWindowId;
  let both = "";
  if (moved && prepared && seen && prepared !== seen) {
    both = ` Front window: ${seen}. Window used to navigate: ${prepared}.`;
  } else if (moved && seen) {
    both = ` Front window: ${seen}.`;
  }
  const body = input.excerpt.trim();
  if (!input.verified) {
    const still = seen || "the previous page";
    const head = lookHasPageControls(input.excerpt)
      ? `the Linux VM browser still shows ${still}; navigation to ${input.url} was not verified.${both}`
      : `the Linux VM browser is showing Chromium chrome, not page content for ${input.url}. Navigation was not verified.${both} Use a numbered control from this look to continue; do not describe steps.`;
    return body ? `${head}\n\n${body}` : head;
  }
  const head = `opened ${input.url} in the Linux VM browser.${both}`;
  return body ? `${head}\n\n${body}` : head;
}

function lookFingerprint(excerpt: string, title: string | undefined, pid: number, windowId: number): string {
  return `${pid}:${windowId}:${title ?? ""}:${excerpt}`;
}

type TreeRow = { index: number; role: string; label: string };

function formatTreeRows(title: string | undefined, rows: TreeRow[]): string {
  const lines: string[] = [];
  if (title) lines.push(title);
  for (const row of rows) {
    lines.push(`[${row.index}] ${row.role} ${row.label}`);
  }
  return lines.join("\n");
}

function compactElements(elements: Array<z.infer<typeof axElementSchema>>): string {
  const rows: TreeRow[] = [];
  let title: string | undefined;
  for (const el of elements) {
    const label = usefulLabel(el.label ?? el.name ?? el.value);
    if (!label) continue;
    const role = roleKey(el.role);
    if ((role === "frame" || role === "window") && !title) {
      title = treeTitle(label);
      continue;
    }
    if (SKIP_ROLES.has(role) || role.startsWith("document")) continue;
    if (isBrowserChrome(role, label)) continue;
    if (el.element_index == null) continue;
    rows.push({ index: el.element_index, role: role || "item", label });
  }
  return formatTreeRows(title, rows);
}

function compactTreeMarkdown(raw: string): string {
  const rows: TreeRow[] = [];
  let title: string | undefined;
  const lineRe = /\[(\d+)\]\s+(.+?)\s+"([^"]*)"/g;
  for (const match of raw.matchAll(lineRe)) {
    const index = Number(match[1]);
    const role = roleKey(match[2]);
    const label = usefulLabel(match[3]);
    if (!label || Number.isNaN(index)) continue;
    if ((role === "frame" || role === "window") && !title) {
      title = treeTitle(label);
      continue;
    }
    if (SKIP_ROLES.has(role) || role.startsWith("document")) continue;
    if (isBrowserChrome(role, label)) continue;
    rows.push({ index, role: role || "item", label });
  }
  return formatTreeRows(title, rows);
}

/** Named controls from Cua's tree, skipping Chromium chrome so a 4k cap
 * still reaches page content. Live 541-node trees were truncated at
 * Minimize; Path A last-look is 1500 chars and was all Back/Reload/omnibox. */
export function windowExcerpt(result: CuaToolResult): string {
  const fromElements = compactElements(result.elements ?? []);
  const raw = result.excerpt?.trim() ?? result.tree_markdown?.trim() ?? "";
  const fromMd = compactTreeMarkdown(raw);
  if (lookHasPageControls(fromElements)) return capExcerpt(fromElements);
  if (lookHasPageControls(fromMd)) return capExcerpt(fromMd);
  if (fromElements) return capExcerpt(fromElements);
  if (fromMd) return capExcerpt(fromMd);
  return capExcerpt(raw);
}

export type LastWindowLook = {
  pid: number;
  windowId: number;
  snapshotId?: string;
  tokens: Record<number, string>;
};

export function lookFromWindowState(seen: CuaToolResult, pid: number, windowId: number): LastWindowLook {
  const tokens: Record<number, string> = {};
  for (const el of seen.elements ?? []) {
    if (el.element_index == null || !el.element_token) continue;
    tokens[el.element_index] = el.element_token;
  }
  return {
    pid: seen.pid != null && seen.pid > 0 ? seen.pid : pid,
    windowId: seen.window_id ?? windowId,
    snapshotId: seen.snapshot_id ?? undefined,
    tokens,
  };
}

/** Cua click needs pid plus element_token, or element_index + snapshot_id.
 * Bare `{index}` from a 3B model is not enough on the wire. */
export function cuaClickFromIndex(look: LastWindowLook, index: number): CuaCallArgs {
  const token = look.tokens[index];
  if (token) return { pid: look.pid, element_token: token };
  const args: CuaCallArgs = {
    pid: look.pid,
    window_id: look.windowId,
    element_index: index,
  };
  if (look.snapshotId) args.snapshot_id = look.snapshotId;
  return args;
}

/** Bind pid/window_id when the model omitted them — same frontmost Chromium
 * rule as `openVisibleUrl`. Cua's get_window_state requires both integers. */
export async function resolveWindowLook(
  call: CuaToolCaller,
  args: CuaCallArgs,
): Promise<{ ok: true; pid: number; windowId: number } | { ok: false; error: string }> {
  if (args.pid != null && args.pid > 0 && args.window_id != null) {
    return { ok: true, pid: args.pid, windowId: args.window_id };
  }
  const listed = await call("list_windows", {});
  const fail = refused(listed);
  if (fail) return { ok: false, error: fail };
  const front = frontmostChromiumWindow(listed);
  if (!front) return { ok: false, error: "No Chromium window is on the Linux desktop." };
  return { ok: true, pid: front.pid, windowId: front.windowId };
}

function installedChromium(result: CuaToolResult): z.infer<typeof appSchema> | undefined {
  const matches = (result.apps ?? []).filter(isChromiumApp);
  return (
    matches.find((app) => (app.windows ?? []).some((win) => (win.pid ?? 0) > 0 || win.window_id != null)) ??
    matches.find((app) => app.kind === "desktop" && app.running && app.pid && app.pid > 0) ??
    matches.find((app) => app.launch_path === "/usr/bin/chromium" && app.running && app.pid && app.pid > 0) ??
    matches.find((app) => app.launch_path === "/usr/bin/chromium") ??
    matches[0]
  );
}

function bindingFrom(result: CuaToolResult): { targetId: string; tabId: string } | undefined {
  const tab = result.tab_id ?? result.tabs?.[0]?.tab_id ?? result.targets?.[0]?.tabs?.[0]?.tab_id;
  const target = result.target_id ?? result.targets?.[0]?.target_id;
  if (target && tab) return { targetId: target, tabId: tab };
}

async function waitForFrontmostChromium(
  call: CuaToolCaller,
  clock: OpenUrlClock,
): Promise<{ pid: number; windowId: number } | undefined> {
  for (let attempt = 0; attempt < WINDOW_POLL_ATTEMPTS; attempt++) {
    const listed = await call("list_windows", {});
    const fail = refused(listed);
    if (fail) return;
    const front = frontmostChromiumWindow(listed);
    if (front) return front;
    await clock.wait(WINDOW_POLL_MS);
  }
}

const defaultClock: OpenUrlClock = {
  wait: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

const MISSING_CHROMIUM =
  "Chromium is not installed in the Local VM image, so the computer browser cannot open a URL. Recreate the Local VM and try again.";

/** Drive Cua so a URL appears in Chromium on the Linux desktop. */
export async function openVisibleUrl(
  url: string,
  call: CuaToolCaller,
  clock: OpenUrlClock = defaultClock,
  session: string = newBrowserSession(),
): Promise<{ text: string; ok: boolean; look?: CuaToolResult }> {
  const started = await call("start_session", { session });
  const startFail = refused(started);
  if (startFail) return { ok: false, text: startFail };
  const listed = await call("list_apps", {});
  const chrome = installedChromium(listed);
  if (!chrome?.launch_path) return { ok: false, text: MISSING_CHROMIUM };

  let front = frontmostChromiumWindow(await call("list_windows", {}));
  if (!front) {
    const launched = await call("launch_app", { launch_path: chrome.launch_path });
    const fail = refused(launched);
    if (fail) return { ok: false, text: fail };
    front = await waitForFrontmostChromium(call, clock);
  }
  if (!front) {
    return { ok: false, text: "Chromium started but did not show a window on the Linux desktop." };
  }
  const { pid, windowId } = front;

  const prepared = await call("browser_prepare", {
    session,
    pid,
    window_id: windowId,
    strategy: { kind: "existing_profile" },
  });
  const prepareFail = refused(prepared);
  if (prepareFail && !bindingFrom(prepared)) return { ok: false, text: prepareFail };

  const state = await call("get_browser_state", {
    session,
    pid,
    window_id: windowId,
  });
  const bound = bindingFrom(state) ?? bindingFrom(prepared);
  if (!bound) {
    return {
      ok: false,
      text: refused(state) ?? "Cua did not mint a browser target after preparing Chromium.",
    };
  }

  const bindListed = await call("list_windows", {});
  const preTitle = chromiumWindowTitle(bindListed, pid, windowId);
  const preSeen = await call("get_window_state", { pid, window_id: windowId });
  const preExcerpt = refused(preSeen) ? "" : windowExcerpt(preSeen);
  const before = lookFingerprint(preExcerpt, preTitle, pid, windowId);

  const navigated = await call("browser_navigate", {
    session,
    target_id: bound.targetId,
    tab_id: bound.tabId,
    url,
  });
  const navFail = refused(navigated);
  if (navFail) return { ok: false, text: navFail };

  const attempts = clock.lookAttempts ?? SETTLE_LOOK_ATTEMPTS;
  let lookPid = pid;
  let lookWindowId = windowId;
  let listedAfter = bindListed;
  let seen = preSeen;
  let excerpt = preExcerpt;
  let seenTitle = preTitle;
  let verified = false;
  for (let attempt = 0; attempt < attempts; attempt++) {
    listedAfter = await call("list_windows", {});
    const listFail = refused(listedAfter);
    if (listFail) return { ok: false, text: listFail };
    const nowFront = frontmostChromiumWindow(listedAfter);
    if (nowFront) {
      lookPid = nowFront.pid;
      lookWindowId = nowFront.windowId;
    }
    seen = await call("get_window_state", { pid: lookPid, window_id: lookWindowId });
    const lookFail = refused(seen);
    if (lookFail) {
      if (attempt === 0) return { ok: false, text: lookFail };
      break;
    }
    excerpt = windowExcerpt(seen);
    seenTitle = chromiumWindowTitle(listedAfter, lookPid, lookWindowId);
    const after = lookFingerprint(excerpt, seenTitle, lookPid, lookWindowId);
    verified = after !== before && lookHasPageControls(excerpt);
    if (verified) break;
    await clock.wait(WINDOW_POLL_MS);
  }

  const preparedTitle = chromiumWindowTitle(listedAfter, pid, windowId) ?? preTitle;
  const text = formatOpenObservation({
    url,
    excerpt,
    preparedTitle,
    seenTitle,
    preparedWindowId: windowId,
    seenWindowId: lookWindowId,
    verified,
  });
  const look = refused(seen) ? undefined : { ...seen, pid: lookPid, window_id: lookWindowId };
  return { ok: true, text, look };
}
