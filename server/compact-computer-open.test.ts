import { describe, expect, it } from "vitest";

import {
  chromiumWindowTitle,
  cuaClickFromIndex,
  cuaResultFromMcp,
  cuaToolResultSchema,
  formatOpenObservation,
  frontmostChromiumWindow,
  httpUrlFromArgs,
  isChromiumApp,
  LOCAL_BROWSER_SESSION,
  lookFromWindowState,
  lookHasPageControls,
  openVisibleUrl,
  parseCuaToolResult,
  resolveWindowLook,
  windowExcerpt,
} from "./compact-computer-open.ts";
import type { CuaCallArgs, CuaToolResult } from "./compact-computer-open.ts";

const noWait = { wait: async () => {} };

function chromiumChromeTree(pageLines: string[]): string {
  return [
    `- [0] frame "app.beehiiv.com - Chromium"`,
    `- [11] push button "Back"`,
    `- [12] push button "Reload"`,
    `- [13] push button "Home"`,
    `- [14] push button "Open tab in split view"`,
    `- [17] push button "View site information"`,
    `- [19] entry "Address and search bar"`,
    `- [41] push button "Bookmark this tab"`,
    `- [46] push button "Extensions"`,
    `- [57] push button "Chromium"`,
    `- [58] tool bar "Bookmarks"`,
    `- [146] push button "New Tab"`,
    `- [151] alert "Restore pages?"`,
    `- [155] heading "Restore pages?"`,
    ...pageLines,
  ].join("\n");
}

describe("httpUrlFromArgs", () => {
  it("accepts url or the first http(s) entry in urls", () => {
    expect(httpUrlFromArgs({ url: "https://example.com" })).toBe("https://example.com");
    expect(httpUrlFromArgs({ url: "https://example.com/a/b" })).toBe("https://example.com/a/b");
    expect(httpUrlFromArgs({ urls: ["ftp://x", "http://example.org"] })).toBe("http://example.org");
    expect(httpUrlFromArgs({ url: "not-a-url" })).toBeUndefined();
  });
});

describe("isChromiumApp", () => {
  it("matches the Debian Chromium desktop entry, not Firefox or crashpad", () => {
    expect(isChromiumApp({ bundle_id: "chromium", launch_path: "/usr/bin/chromium" })).toBe(true);
    expect(isChromiumApp({ name: "Chromium Web Browser" })).toBe(true);
    expect(isChromiumApp({ name: "Firefox ESR" })).toBe(false);
    expect(isChromiumApp({ name: "chrome_crashpad" })).toBe(false);
    expect(isChromiumApp({ name: "Google Chrome" })).toBe(false);
  });
});

describe("frontmostChromiumWindow", () => {
  it("binds the on-screen Chromium with the highest z-index, not the older window behind it", () => {
    const front = frontmostChromiumWindow({
      windows: [
        {
          pid: 509,
          window_id: 33554436,
          is_on_screen: true,
          z_index: 1,
          app_name: "Chromium",
          title: "Example Site - Chromium",
        },
        {
          pid: 2143,
          window_id: 33554464,
          is_on_screen: true,
          z_index: 2,
          app_name: "Chromium",
          title: "New Tab - Chromium",
        },
      ],
    });
    expect(front).toEqual({ pid: 2143, windowId: 33554464 });
  });
});

describe("resolveWindowLook", () => {
  it("keeps pid and window_id when the model already sent them", async () => {
    const target = await resolveWindowLook(async () => {
      throw new Error("should not list windows");
    }, { pid: 11, window_id: 22 });
    expect(target).toEqual({ ok: true, pid: 11, windowId: 22 });
  });

  it("binds the frontmost Chromium window when pid is missing", async () => {
    const target = await resolveWindowLook(
      async (name, args) => {
        expect(name).toBe("list_windows");
        expect(args).toEqual({});
        return {
          windows: [
            {
              pid: 509,
              window_id: 1,
              is_on_screen: true,
              z_index: 1,
              app_name: "Chromium",
            },
            {
              pid: 2143,
              window_id: 2,
              is_on_screen: true,
              z_index: 4,
              app_name: "Chromium",
            },
          ],
        };
      },
      { capture_mode: "ax" },
    );
    expect(target).toEqual({ ok: true, pid: 2143, windowId: 2 });
  });
});

describe("windowExcerpt", () => {
  it("uses Cua markdown and caps a long tree", () => {
    expect(windowExcerpt({ excerpt: "  Posts Published: 2  " })).toBe("Posts Published: 2");
    expect(windowExcerpt({ excerpt: "x".repeat(4001) }).endsWith("\n…")).toBe(true);
  });

  it("keeps named page controls instead of Chromium chrome when the tree is huge", () => {
    const chrome = Array.from({ length: 80 }, (_, i) => `  - [${i + 1}] panel "￼￼" [actions=[doDefault]]`).join("\n");
    const excerpt = [
      `window_id=33554480 pid=509 elements=541`,
      `- [0] frame "Quoted For Truth - beehiiv - Chromium" [actions=[doDefault,showContextMenu]]`,
      chrome,
      `- [3] push button "Minimize" [actions=[press]]`,
      `- [4] push button "Maximize" [actions=[press]]`,
      `- [5] push button "Close" [actions=[press]]`,
      `- [120] link "Posts" [actions=[press]]`,
      `- [121] static text "Posts Published: 2" [actions=[]]`,
      `- [122] push button "New post" [actions=[press]]`,
    ].join("\n");
    const view = windowExcerpt({ excerpt });
    expect(view).toContain("Quoted For Truth - beehiiv");
    expect(view).toContain("[120] link Posts");
    expect(view).toContain("[121] static text Posts Published: 2");
    expect(view).toContain("[122] push button New post");
    expect(view).not.toMatch(/Minimize/);
    expect(view.length).toBeLessThan(4000);
  });

  it("skips Chromium toolbar chrome so page controls survive the last-look cap", () => {
    const view = windowExcerpt({
      excerpt: chromiumChromeTree([
        `- [120] link "Posts"`,
        `- [121] static text "Posts Published: 2"`,
        `- [122] push button "New post"`,
        `- [200] link "Science"`,
      ]),
    });
    expect(view).toContain("app.beehiiv.com");
    expect(view).toContain("[120] link Posts");
    expect(view).toContain("[122] push button New post");
    expect(view).toContain("[200] link Science");
    expect(view).toContain("Restore pages?");
    expect(view).not.toMatch(/\[11\] push button Back/);
    expect(view).not.toMatch(/Address and search bar/);
    expect(view).not.toMatch(/Bookmark this tab/);
    expect(lookHasPageControls(view)).toBe(true);
  });

  it("does not treat a chrome-only Restore-pages look as page content", () => {
    const view = windowExcerpt({ excerpt: chromiumChromeTree([]) });
    expect(view).toContain("Restore pages?");
    expect(view).not.toMatch(/\[11\] push button Back/);
    expect(lookHasPageControls(view)).toBe(false);
  });

  it("prefers structured elements and tokens for a later click", () => {
    const view = windowExcerpt({
      snapshot_id: "snap-1",
      elements: [
        { element_index: 0, role: "frame", label: "Example Domain - Chromium", element_token: "s1:0" },
        { element_index: 3, role: "push button", label: "Minimize", element_token: "s1:3" },
        { element_index: 9, role: "link", label: "More information", element_token: "s1:9" },
      ],
    });
    expect(view).toContain("Example Domain");
    expect(view).toContain("[9] link More information");
    expect(view).not.toMatch(/Minimize/);
    const look = lookFromWindowState(
      {
        pid: 11,
        window_id: 22,
        snapshot_id: "snap-1",
        elements: [{ element_index: 9, role: "link", label: "More information", element_token: "s1:9" }],
      },
      11,
      22,
    );
    expect(cuaClickFromIndex(look, 9)).toEqual({ pid: 11, element_token: "s1:9" });
    expect(cuaClickFromIndex({ pid: 11, windowId: 22, snapshotId: "snap-1", tokens: {} }, 9)).toEqual({
      pid: 11,
      window_id: 22,
      element_index: 9,
      snapshot_id: "snap-1",
    });
  });
});

describe("formatOpenObservation", () => {
  it("does not treat the requested URL as verified when the look is unchanged", () => {
    const text = formatOpenObservation({
      url: "https://example.com",
      excerpt: "Quoted For Truth - beehiiv\n[17] push button View site information",
      seenTitle: "Quoted For Truth - beehiiv",
      preparedWindowId: 1,
      seenWindowId: 1,
      verified: false,
    });
    expect(text).toMatch(/not verified/i);
    expect(text).toContain("Quoted For Truth - beehiiv");
    expect(text).toContain("https://example.com");
    expect(text).not.toMatch(/^opened https:\/\/example\.com/m);
  });

  it("does not claim opened when the look is Chromium chrome", () => {
    const excerpt = windowExcerpt({ excerpt: chromiumChromeTree([]) });
    expect(lookHasPageControls(excerpt)).toBe(false);
    const unverified = formatOpenObservation({
      url: "https://app.beehiiv.com",
      excerpt,
      seenTitle: "app.beehiiv.com",
      preparedWindowId: 1,
      seenWindowId: 1,
      verified: false,
    });
    expect(unverified).toMatch(/not verified/i);
    expect(unverified).toMatch(/Chromium chrome/i);
    expect(unverified).toMatch(/numbered control/i);
    expect(unverified).not.toMatch(/^opened https:\/\/app\.beehiiv\.com/m);
  });

  it("names both Chromium windows when the front window is not the one we navigated", () => {
    const text = formatOpenObservation({
      url: "https://example.com",
      excerpt: "Example Domain\n[9] link More information",
      preparedTitle: "Quoted For Truth - beehiiv",
      seenTitle: "Example Domain",
      preparedWindowId: 33554464,
      seenWindowId: 33554480,
      verified: true,
    });
    expect(text).toContain("opened https://example.com");
    expect(text).toContain("Front window: Example Domain");
    expect(text).toContain("Window used to navigate: Quoted For Truth - beehiiv");
  });
});

describe("chromiumWindowTitle", () => {
  it("strips the Chromium suffix from a listed window", () => {
    expect(
      chromiumWindowTitle(
        {
          windows: [
            { pid: 509, window_id: 64, title: "Quoted For Truth - beehiiv - Chromium" },
            { pid: 509, window_id: 80, title: "Example Domain - Chromium" },
          ],
        },
        509,
        80,
      ),
    ).toBe("Example Domain");
  });
});

describe("openVisibleUrl", () => {
  it("binds Cua's existing Chromium window then navigates", async () => {
    const calls: Array<{ name: string; args: CuaCallArgs }> = [];
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name, args) => {
        calls.push({ name, args });
        if (name === "start_session") {
          expect(args).toEqual({ session: LOCAL_BROWSER_SESSION });
          return { session: LOCAL_BROWSER_SESSION };
        }
        if (name === "list_apps") {
          expect(args).toEqual({});
          return {
            apps: [
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: true,
                pid: 42,
                windows: [{ pid: 42, window_id: 99 }],
              },
            ],
          };
        }
        if (name === "list_windows") {
          expect(args).toEqual({});
          return {
            windows: [{ pid: 42, window_id: 99, is_on_screen: true, z_index: 1, app_name: "Chromium" }],
          };
        }
        if (name === "browser_prepare") {
          expect(args).toEqual({
            session: LOCAL_BROWSER_SESSION,
            pid: 42,
            window_id: 99,
            strategy: { kind: "existing_profile" },
          });
          return { status: "ok" };
        }
        if (name === "get_browser_state") {
          expect(args).toEqual({ session: LOCAL_BROWSER_SESSION, pid: 42, window_id: 99 });
          return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
        }
        if (name === "browser_navigate") {
          expect(args).toEqual({
            session: LOCAL_BROWSER_SESSION,
            target_id: "tgt-1",
            tab_id: "tab-1",
            url: "https://example.com",
          });
          return { status: "ok" };
        }
        if (name === "get_window_state") {
          expect(args).toEqual({ pid: 42, window_id: 99 });
          const looks = calls.filter((call) => call.name === "get_window_state").length;
          if (looks === 1) return { excerpt: `- [0] frame "Quoted For Truth leftover - Chromium"` };
          return {
            excerpt: `- [0] frame "Example Domain - Chromium"\n- [9] link "More information"`,
          };
        }
        return {};
      },
      noWait,
      LOCAL_BROWSER_SESSION,
    );
    expect(opened.ok).toBe(true);
    expect(opened.text).toMatch(/^opened https:\/\/example\.com/);
    expect(opened.text).toContain("More information");
    expect(opened.text).not.toMatch(/not verified/i);
    expect(calls.map((call) => call.name)).toEqual([
      "start_session",
      "list_apps",
      "list_windows",
      "browser_prepare",
      "get_browser_state",
      "list_windows",
      "get_window_state",
      "browser_navigate",
      "list_windows",
      "get_window_state",
    ]);
  });

  it("prepares the front Chromium window when an older one is behind it", async () => {
    const prepared: CuaCallArgs[] = [];
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name, args) => {
        if (name === "list_apps") {
          return {
            apps: [
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: true,
                pid: 509,
                windows: [{ pid: 509, window_id: 33554436 }],
              },
            ],
          };
        }
        if (name === "list_windows") {
          return {
            windows: [
              {
                pid: 509,
                window_id: 33554436,
                is_on_screen: true,
                z_index: 1,
                app_name: "Chromium",
                title: "Example Site - Chromium",
              },
              {
                pid: 2143,
                window_id: 33554464,
                is_on_screen: true,
                z_index: 2,
                app_name: "Chromium",
                title: "New Tab - Chromium",
              },
            ],
          };
        }
        if (name === "browser_prepare") {
          prepared.push(args);
          return { status: "ok" };
        }
        if (name === "get_browser_state") return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
        if (name === "get_window_state") {
          if (args.window_id === 33554464) return { excerpt: "New Tab" };
          return { excerpt: "Example Site leftover" };
        }
        return { status: "ok" };
      },
      noWait,
      LOCAL_BROWSER_SESSION,
    );
    expect(opened.ok).toBe(true);
    expect(prepared[0]).toMatchObject({ pid: 2143, window_id: 33554464 });
  });

  it("launches Chromium by launch_path and waits for its window", async () => {
    let listedWindows = 0;
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name, args) => {
        if (name === "list_apps") {
          return {
            apps: [
              {
                name: "Firefox ESR",
                running: true,
                pid: 9,
                launch_path: "/usr/bin/firefox-esr",
              },
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: false,
                pid: 0,
              },
            ],
          };
        }
        if (name === "launch_app") {
          expect(args).toEqual({ launch_path: "/usr/bin/chromium" });
          return { pid: 50, running: true };
        }
        if (name === "list_windows") {
          listedWindows += 1;
          if (listedWindows === 1) return { windows: [] };
          return { windows: [{ pid: 50, window_id: 7, is_on_screen: true, app_name: "Chromium" }] };
        }
        if (name === "get_browser_state") return { targets: [{ target_id: "t", tabs: [{ tab_id: "u" }] }] };
        if (name === "get_window_state") return { excerpt: listedWindows > 3 ? "Example Domain heading" : "New Tab" };
        return { status: "ok" };
      },
      noWait,
    );
    expect(opened.ok).toBe(true);
    expect(listedWindows).toBeGreaterThanOrEqual(4);
  });

  it("ignores a running Firefox window when looking for Chromium", async () => {
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name) => {
        if (name === "list_apps") {
          return {
            apps: [{ name: "Firefox ESR", running: true, pid: 9, windows: [{ pid: 9, window_id: 1 }] }],
            windows: [{ pid: 9, window_id: 1 }],
          };
        }
        return {};
      },
      noWait,
    );
    expect(opened.ok).toBe(false);
    expect(opened.text).toMatch(/Chromium is not installed/i);
  });

  it("says the image is missing Chromium instead of opening Firefox", async () => {
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name) => {
        if (name === "list_apps") return { apps: [{ name: "Firefox ESR", running: false, pid: 0 }] };
        return {};
      },
      noWait,
    );
    expect(opened.ok).toBe(false);
    expect(opened.text).toMatch(/Chromium is not installed/i);
  });

  it("mints a fresh public session instead of reusing an ended Cua label", async () => {
    const sessions: string[] = [];
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name, args) => {
        if (args.session) sessions.push(args.session);
        if (name === "list_apps") {
          return {
            apps: [
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: true,
                pid: 42,
                windows: [{ pid: 42, window_id: 99 }],
              },
            ],
          };
        }
        if (name === "list_windows") {
          return {
            windows: [{ pid: 42, window_id: 99, is_on_screen: true, app_name: "Chromium" }],
          };
        }
        if (name === "get_browser_state") return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
        if (name === "get_window_state") return { excerpt: "Example Domain heading" };
        return { status: "ok" };
      },
      noWait,
    );
    expect(opened.ok).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions[0]).toMatch(/^omb-[0-9a-f]{8}$/);
    expect(new Set(sessions).size).toBe(1);
  });

  it("looks at the frontmost Chromium after navigate when a second window appears", async () => {
    let navigated = false;
    const looked: CuaCallArgs[] = [];
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name, args) => {
        if (name === "list_apps") {
          return {
            apps: [
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: true,
                pid: 509,
              },
            ],
          };
        }
        if (name === "list_windows") {
          const beehiiv = {
            pid: 509,
            window_id: 33554464,
            is_on_screen: true,
            z_index: 1,
            app_name: "Chromium",
            title: "Quoted For Truth - beehiiv - Chromium",
          };
          if (!navigated) return { windows: [beehiiv] };
          return {
            windows: [
              beehiiv,
              {
                pid: 509,
                window_id: 33554480,
                is_on_screen: true,
                z_index: 2,
                app_name: "Chromium",
                title: "Example Domain - Chromium",
              },
            ],
          };
        }
        if (name === "get_browser_state") return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
        if (name === "browser_navigate") {
          navigated = true;
          return { status: "ok" };
        }
        if (name === "get_window_state") {
          looked.push(args);
          if (args.window_id === 33554480) {
            return {
              excerpt: `- [0] frame "Example Domain - Chromium"\n- [9] link "More information"`,
            };
          }
          return { excerpt: `- [0] frame "Quoted For Truth - beehiiv - Chromium"` };
        }
        return { status: "ok" };
      },
      noWait,
      LOCAL_BROWSER_SESSION,
    );
    expect(opened.ok).toBe(true);
    expect(looked.at(-1)).toEqual({ pid: 509, window_id: 33554480 });
    expect(opened.text).toMatch(/^opened https:\/\/example\.com/);
    expect(opened.text).toContain("Front window: Example Domain");
    expect(opened.text).toContain("Window used to navigate: Quoted For Truth - beehiiv");
    expect(opened.look?.window_id).toBe(33554480);
  });

  it("does not claim the URL opened when the look is still the leftover window", async () => {
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name) => {
        if (name === "list_apps") {
          return {
            apps: [
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: true,
                pid: 509,
              },
            ],
          };
        }
        if (name === "list_windows") {
          return {
            windows: [
              {
                pid: 509,
                window_id: 64,
                is_on_screen: true,
                z_index: 1,
                app_name: "Chromium",
                title: "Quoted For Truth - beehiiv - Chromium",
              },
            ],
          };
        }
        if (name === "get_browser_state") return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
        if (name === "get_window_state") {
          return { excerpt: `- [0] frame "Quoted For Truth - beehiiv - Chromium"` };
        }
        return { status: "ok" };
      },
      { wait: async () => {}, lookAttempts: 2 },
      LOCAL_BROWSER_SESSION,
    );
    expect(opened.ok).toBe(true);
    expect(opened.text).toMatch(/not verified/i);
    expect(opened.text).toContain("Quoted For Truth - beehiiv");
    expect(opened.text).not.toMatch(/^opened https:\/\/example\.com/);
  });

  it("keeps polling chrome-only looks until page controls appear", async () => {
    let windowLooks = 0;
    const opened = await openVisibleUrl(
      "https://app.beehiiv.com",
      async (name) => {
        if (name === "list_apps") {
          return {
            apps: [
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: true,
                pid: 509,
              },
            ],
          };
        }
        if (name === "list_windows") {
          return {
            windows: [
              {
                pid: 509,
                window_id: 80,
                is_on_screen: true,
                z_index: 1,
                app_name: "Chromium",
                title: "app.beehiiv.com - Chromium",
              },
            ],
          };
        }
        if (name === "get_browser_state") return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
        if (name === "get_window_state") {
          windowLooks += 1;
          if (windowLooks < 4) return { excerpt: chromiumChromeTree([]) };
          return { excerpt: chromiumChromeTree([`- [200] link "Science"`]) };
        }
        return { status: "ok" };
      },
      { wait: async () => {}, lookAttempts: 5 },
      LOCAL_BROWSER_SESSION,
    );
    expect(opened.ok).toBe(true);
    expect(opened.text).toMatch(/^opened https:\/\/app\.beehiiv\.com/);
    expect(opened.text).toContain("[200] link Science");
    expect(windowLooks).toBe(4);
  });

  it("does not claim opened when every look is Chromium chrome", async () => {
    const opened = await openVisibleUrl(
      "https://app.beehiiv.com",
      async (name) => {
        if (name === "list_apps") {
          return {
            apps: [
              {
                name: "Chromium Web Browser",
                bundle_id: "chromium",
                launch_path: "/usr/bin/chromium",
                running: true,
                pid: 509,
              },
            ],
          };
        }
        if (name === "list_windows") {
          return {
            windows: [
              {
                pid: 509,
                window_id: 80,
                is_on_screen: true,
                z_index: 1,
                app_name: "Chromium",
                title: "app.beehiiv.com - Chromium",
              },
            ],
          };
        }
        if (name === "get_browser_state") return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
        if (name === "get_window_state") return { excerpt: chromiumChromeTree([]) };
        return { status: "ok" };
      },
      { wait: async () => {}, lookAttempts: 3 },
      LOCAL_BROWSER_SESSION,
    );
    expect(opened.ok).toBe(true);
    expect(opened.text).toMatch(/not verified/i);
    expect(opened.text).toMatch(/Chromium chrome/i);
    expect(opened.text).not.toMatch(/^opened https:\/\/app\.beehiiv\.com/);
    expect(opened.text).toContain("Restore pages?");
  });

  it("stops when Cua will not start a session", async () => {
    const opened = await openVisibleUrl(
      "https://example.com",
      async (name) => {
        if (name === "start_session") {
          return { status: "error", refusal: { message: "session is not available to this transport" } };
        }
        throw new Error(`unexpected ${name}`);
      },
      noWait,
    );
    expect(opened.ok).toBe(false);
    expect(opened.text).toMatch(/not available/i);
  });
});

describe("parseCuaToolResult", () => {
  it("reads JSON and preserves a refusal", () => {
    const ok: CuaToolResult = parseCuaToolResult('{"pid":3}');
    expect(ok.pid).toBe(3);
    expect(parseCuaToolResult("not-json").refusal?.message).toBe("not-json");
  });
});

describe("cuaResultFromMcp", () => {
  it("prefers structuredContent over the markdown summary", () => {
    const listed = cuaResultFromMcp({
      content: [{ text: "✅ Found 66 app(s): Chromium Web Browser (pid 509)" }],
      structuredContent: {
        apps: [
          {
            name: "supervisord",
            bundle_id: null,
            launch_path: null,
            kind: null,
            pid: 1,
            running: true,
          },
          {
            name: "Chromium Web Browser",
            bundle_id: "chromium",
            launch_path: "/usr/bin/chromium",
            kind: "desktop",
            running: true,
            pid: 509,
          },
        ],
      },
    });
    expect(cuaToolResultSchema.safeParse(listed.apps ? { apps: listed.apps } : {}).success).toBe(true);
    expect(listed.apps?.[1]?.launch_path).toBe("/usr/bin/chromium");
    expect(listed.apps?.[1]?.pid).toBe(509);
  });

  it("treats MCP isError as a refusal even when structuredContent is only exit_code", () => {
    const failed = cuaResultFromMcp({
      isError: true,
      structuredContent: { exit_code: 1 },
      content: [{ text: "session 'omb' has ended; tool call 'browser_prepare' was rejected." }],
    });
    expect(failed.status).toBe("error");
    expect(failed.refusal?.message).toMatch(/has ended/);
  });

  it("treats session_unavailable as a refusal", () => {
    const failed = cuaResultFromMcp({
      isError: true,
      structuredContent: { code: "session_unavailable" },
      content: [{ text: "session is not available to this transport" }],
    });
    expect(failed.status).toBe("error");
    expect(failed.refusal?.message).toMatch(/not available/);
  });

  it("copies Cua markdown onto excerpt so a look can return the tree as text", () => {
    const seen = cuaResultFromMcp({
      content: [{ text: "Posts Published: 2" }],
      structuredContent: { status: "ok", pid: 11, window_id: 22 },
    });
    expect(seen.excerpt).toBe("Posts Published: 2");
    expect(seen.pid).toBe(11);
  });
});
