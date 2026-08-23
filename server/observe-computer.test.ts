import { describe, expect, it } from "vitest";

import { ObservationCoordinator } from "./computer-observation.ts";
import {
  fuseObservation,
  observeSettleMs,
  readBoundBrowserState,
  screenshotFromMcpResult,
  shouldFuseObserve,
  urlsFromCuaBrowserState,
  waitForCuaNavigation,
  wholeObservationImage,
  withWaitForNavigationTool,
  wrapComputerMcpForFrontier,
  WAIT_FOR_NAVIGATION_NAME,
  WAIT_FOR_NAVIGATION_TOOL,
  OBSERVE_COMPUTER_WIRE_FLAG,
} from "./observe-computer.ts";
import { wrapComputerMcpForLocalModel } from "./compact-computer-tools.ts";
import { SPAWNED_PROXIES } from "./proxy-paths.ts";

function wholePng(): string {
  const buf = Buffer.alloc(520, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  Buffer.from("IEND", "ascii").copy(buf, buf.length - 8);
  return buf.toString("base64");
}

function wholeJpeg(): string {
  const buf = Buffer.alloc(520, 0);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[buf.length - 2] = 0xff;
  buf[buf.length - 1] = 0xd9;
  return buf.toString("base64");
}

describe("shouldFuseObserve", () => {
  it("fuses mutating Cua tools and leaves look tools alone", () => {
    expect(shouldFuseObserve("click")).toBe(true);
    expect(shouldFuseObserve("type_text")).toBe(true);
    expect(shouldFuseObserve("browser_navigate")).toBe(true);
    expect(shouldFuseObserve("get_window_state")).toBe(false);
    expect(shouldFuseObserve("get_desktop_state")).toBe(false);
    expect(shouldFuseObserve("screenshot")).toBe(false);
    expect(shouldFuseObserve("list_windows")).toBe(false);
  });
});

describe("screenshotFromMcpResult", () => {
  it("reads a whole image from MCP content or structured fields", () => {
    const png = wholePng();
    expect(
      screenshotFromMcpResult({
        content: [{ type: "image", data: png, mimeType: "image/png" }],
      }),
    ).toEqual({ data: png, mimeType: "image/png" });
    const jpeg = wholeJpeg();
    expect(
      screenshotFromMcpResult({
        content: [{ type: "text", text: "ok" }],
        structuredContent: { screenshot_base64: jpeg },
      }),
    ).toEqual({ data: jpeg, mimeType: "image/jpeg" });
    expect(screenshotFromMcpResult({ content: [{ type: "text", text: "ok" }] })).toBeUndefined();
    expect(
      screenshotFromMcpResult({
        content: [{ type: "image", data: Buffer.from("tiny").toString("base64") }],
      }),
    ).toBeUndefined();
  });
});

describe("fuseObservation", () => {
  it("attaches a fresh frame and drops a byte-identical one", () => {
    const png = wholePng();
    const coordinator = new ObservationCoordinator();
    const first = fuseObservation(
      { content: [{ type: "text", text: "clicked" }] },
      { data: png, mimeType: "image/png" },
      coordinator,
      true,
    );
    expect(first.content?.some((part) => part.type === "image" && part.data === png)).toBe(true);
    const second = fuseObservation(
      { content: [{ type: "text", text: "clicked" }] },
      { data: png, mimeType: "image/png" },
      coordinator,
      true,
    );
    expect(second.content?.some((part) => part.type === "image")).toBe(false);
    expect(second.content?.[1]?.text).toContain("identical to the frame you already have");
    expect(second.content?.[1]?.text).toContain("Don't repeat the action");
  });

  it("does not attach pixels to an error result, and notes a missing capture", () => {
    const png = wholePng();
    const coordinator = new ObservationCoordinator();
    const errored = fuseObservation(
      { content: [{ type: "text", text: "refused" }], isError: true },
      { data: png, mimeType: "image/png" },
      coordinator,
      true,
    );
    expect(errored.isError).toBe(true);
    expect(errored.content?.some((part) => part.type === "image")).toBe(false);
    const missing = fuseObservation({ content: [{ type: "text", text: "clicked" }] }, undefined, coordinator, true);
    expect(missing.content?.[1]?.text).toContain("couldn't capture the screen");
  });
});

describe("waitForCuaNavigation", () => {
  it("verifies an exact URL from Cua state and stays honest when Cua has none", async () => {
    const clock = { wait: async () => {} };
    const verified = await waitForCuaNavigation(
      async () => ({
        structuredContent: { url: "https://example.com/a?q=1#x" },
      }),
      "https://example.com/a?q=1#x",
      clock,
    );
    expect(verified.ok).toBe(true);
    expect(verified.text).toContain("navigation verified");
    expect(verified.text).toContain("https://example.com/a");
    expect(verified.text).not.toContain("q=1");

    const missing = await waitForCuaNavigation(async () => ({ content: [{ type: "text", text: "ok" }] }), "https://example.com/", clock);
    expect(missing.ok).toBe(false);
    expect(missing.text).toContain("did not report a page URL");

    const other = await waitForCuaNavigation(
      async () => ({ structuredContent: { tabs: [{ url: "https://other.example/" }] } }),
      "https://example.com/",
      clock,
    );
    expect(other.ok).toBe(false);
    expect(other.text).toContain("Current structured state");
    expect(other.text).toContain("https://other.example/");
  });

  it("rejects a non-http URL without calling Cua", async () => {
    let calls = 0;
    const out = await waitForCuaNavigation(
      async () => {
        calls += 1;
        return {};
      },
      "file:///etc/passwd",
      { wait: async () => {} },
    );
    expect(calls).toBe(0);
    expect(out.ok).toBe(false);
    expect(out.text).toContain("valid http(s) URL");
  });
});

describe("readBoundBrowserState", () => {
  it("binds frontmost Chromium before get_browser_state", async () => {
    const calls: { name: string; args: { pid?: number; window_id?: number } }[] = [];
    const state = await readBoundBrowserState(async (name, args) => {
      calls.push({ name, args });
      if (name === "list_windows") {
        return {
          structuredContent: {
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
          },
        };
      }
      return { structuredContent: { url: "https://example.com/" } };
    });
    expect(calls[0]).toEqual({ name: "list_windows", args: {} });
    expect(calls[1]).toEqual({ name: "get_browser_state", args: { pid: 2143, window_id: 2 } });
    expect(urlsFromCuaBrowserState(state)).toEqual(["https://example.com/"]);
  });

  it("does not invent a browser bind when Cua has no Chromium window", async () => {
    const names: string[] = [];
    const state = await readBoundBrowserState(async (name) => {
      names.push(name);
      return { structuredContent: { windows: [] } };
    });
    expect(names).toEqual(["list_windows"]);
    expect(state.content?.[0]?.text).toContain("No Chromium window");
  });
});

describe("urlsFromCuaBrowserState", () => {
  it("reads tab URLs and Chrome /json/list payloads", () => {
    expect(
      urlsFromCuaBrowserState({
        structuredContent: {
          tabs: [{ url: "https://example.com/path?q=1" }],
          json_list: JSON.stringify([{ id: "p", type: "page", title: "Ex", url: "https://example.com/json" }]),
        },
      }),
    ).toEqual(["https://example.com/path?q=1", "https://example.com/json"]);
  });
});

describe("withWaitForNavigationTool", () => {
  it("appends the tool once and leaves Cua names in place", () => {
    const listed = JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      result: { tools: [{ name: "click", description: "Cua click" }] },
    });
    const once = JSON.parse(withWaitForNavigationTool(listed));
    expect(once.result.tools[0].name).toBe("click");
    expect(once.result.tools[1].name).toBe(WAIT_FOR_NAVIGATION_NAME);
    expect(once.result.tools[1].description).toBe(WAIT_FOR_NAVIGATION_TOOL.description);
    expect(withWaitForNavigationTool(withWaitForNavigationTool(listed))).toBe(withWaitForNavigationTool(listed));
  });
});

describe("wrapComputerMcpForFrontier", () => {
  it("prepends observe-computer-mcp for container and VPS bridges, not host Cua or Path A", () => {
    const inner = SPAWNED_PROXIES.containerMcp;
    const once = wrapComputerMcpForFrontier({
      command: process.execPath,
      args: [inner, "podman", "openmausbot-computer", "/run/cua.sock"],
      env: {},
    });
    expect(once.args[0]).toBe(SPAWNED_PROXIES.observeComputerMcp);
    expect(once.args[1]).toBe(OBSERVE_COMPUTER_WIRE_FLAG);
    expect(wrapComputerMcpForFrontier(once).args).toEqual(once.args);

    const vps = wrapComputerMcpForFrontier({
      command: process.execPath,
      args: [SPAWNED_PROXIES.vpsContainerMcp, "alias", "cid"],
      env: {},
    });
    expect(vps.args[0]).toBe(SPAWNED_PROXIES.observeComputerMcp);

    const host = wrapComputerMcpForFrontier({
      command: "C:\\cua-driver.exe",
      args: ["mcp"],
      env: {},
    });
    expect(host.args).toEqual(["mcp"]);

    const inject = wrapComputerMcpForLocalModel({
      command: process.execPath,
      args: [inner, "podman", "openmausbot-computer", "/run/cua.sock"],
      env: {},
    });
    expect(inject.args[0]).toBe(SPAWNED_PROXIES.compactComputerMcp);
    expect(wrapComputerMcpForFrontier(inject).args[0]).toBe(SPAWNED_PROXIES.compactComputerMcp);
  });
});

describe("observeSettleMs", () => {
  it("defaults to Box's 350ms settle and caps the override", () => {
    expect(observeSettleMs(undefined)).toBe(350);
    expect(observeSettleMs("0")).toBe(0);
    expect(observeSettleMs("9000")).toBe(3000);
    expect(observeSettleMs("nope")).toBe(350);
  });
});

describe("wholeObservationImage", () => {
  it("accepts a complete PNG or JPEG and rejects truncated bytes", () => {
    expect(wholeObservationImage(Buffer.from(wholePng(), "base64")).ok).toBe(true);
    expect(wholeObservationImage(Buffer.from(wholeJpeg(), "base64")).ok).toBe(true);
    expect(wholeObservationImage(Buffer.from("short")).ok).toBe(false);
  });
});
