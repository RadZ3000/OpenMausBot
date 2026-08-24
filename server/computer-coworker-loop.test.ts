// Family coverage for coworker-loop work already in the tree (P1 honest
// open, P3 last-look, P4 frontier fused observe, B-06 durable start).
// Live Path A after overlay + full quit/relaunch (2026-08-22, thread
// 98f767f9-ad0f-4c90-93a4-fb9ed2a72938): vm_open tool_call_update named
// Example Domain and did not claim a verified URL; the next session/prompt
// contained [LAST COMPUTER OBSERVATION] with that look and no vm_* names.
// Container stayed running across harness quit. Path A native tee had no
// JPEG. Auto-approve PATCH on Probe (inject + Local VM) returned 400.
// P8: eight vm_* names, no further Granite wrappers. Last-look fence
// neutralizes attacker-controlled close tags. Claude-on-VM JPEG A/B stays
// unknown without a key. Do not point this file at ~/.openmausbot.
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  compactToolsCallLine,
  compactToolsListLine,
  wrapComputerMcpForLocalModel,
} from "./compact-computer-tools.ts";
import { compactObserveImageForModel } from "./compact-computer-observe.ts";
import {
  cuaClickFromIndex,
  lookFromWindowState,
  LOCAL_BROWSER_SESSION,
  openVisibleUrl,
  type CuaCallArgs,
  type CuaToolResult,
} from "./compact-computer-open.ts";
import { ObservationCoordinator } from "./computer-observation.ts";
import {
  ComputerThreadLooks,
  computerLookFromWrite,
  formatComputerObservation,
} from "./computer-thread-state.ts";
import {
  IMAGE_LAYER_VERSION,
  VM_BROWSER_PROFILES_GUEST,
  VM_WORKSPACE_GUEST,
} from "./container-computer.ts";
import {
  fuseObservation,
  OBSERVE_COMPUTER_WIRE_FLAG,
  shouldFuseObserve,
  waitForCuaNavigation,
  wrapComputerMcpForFrontier,
} from "./observe-computer.ts";
import { SPAWNED_PROXIES } from "./proxy-paths.ts";
import { withComputerObservation } from "./turn-context.ts";
import { localVmCanResume, localVmMustRecreate } from "../shared/local-vm-lifecycle.ts";

const noWait = { wait: async () => {} };

const leftoverBeehiiv = {
  pid: 509,
  window_id: 33554464,
  is_on_screen: true,
  z_index: 1,
  app_name: "Chromium",
  title: "Quoted For Truth - beehiiv - Chromium",
};

const exampleWindow = {
  pid: 509,
  window_id: 33554480,
  is_on_screen: true,
  z_index: 2,
  app_name: "Chromium",
  title: "Example Domain - Chromium",
};

function wholePng(): string {
  const buf = Buffer.alloc(520, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  Buffer.from("IEND", "ascii").copy(buf, buf.length - 8);
  return buf.toString("base64");
}

function chromiumApps(): CuaToolResult {
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

async function openExampleOnLeftoverDesktop() {
  let navigated = false;
  return openVisibleUrl(
    "https://example.com",
    async (name, args: CuaCallArgs) => {
      if (name === "list_apps") return chromiumApps();
      if (name === "list_windows") {
        if (!navigated) return { windows: [leftoverBeehiiv] };
        return { windows: [leftoverBeehiiv, exampleWindow] };
      }
      if (name === "get_browser_state") return { target_id: "tgt-1", tabs: [{ tab_id: "tab-1" }] };
      if (name === "browser_navigate") {
        navigated = true;
        return { status: "ok" };
      }
      if (name === "get_window_state") {
        if (args.window_id === exampleWindow.window_id) {
          return {
            excerpt: `- [0] frame "Example Domain - Chromium"\n- [9] link "More information"`,
            pid: 509,
            window_id: exampleWindow.window_id,
            elements: [
              {
                element_index: 9,
                role: "link",
                label: "More information",
                element_token: "s1:9",
              },
            ],
          };
        }
        return { excerpt: `- [0] frame "Quoted For Truth - beehiiv - Chromium"` };
      }
      return { status: "ok" };
    },
    noWait,
    LOCAL_BROWSER_SESSION,
  );
}

describe("coworker loop family", () => {
  it("P1: leftover Chromium is expected; open reports the front window, not a verified URL lie", async () => {
    const opened = await openExampleOnLeftoverDesktop();
    expect(opened.ok).toBe(true);
    expect(opened.text).toContain("Front window: Example Domain");
    expect(opened.text).toContain("Window used to navigate: Quoted For Truth - beehiiv");
    expect(opened.look?.window_id).toBe(exampleWindow.window_id);
    expect(opened.text).not.toMatch(/verified destination/i);
  });

  it("P3: that look survives the turn and the next click does not need a recipe in the prompt", async () => {
    const opened = await openExampleOnLeftoverDesktop();
    expect(opened.look).toBeDefined();
    const binds = lookFromWindowState(opened.look ?? {}, 509, exampleWindow.window_id);
    const looks = new ComputerThreadLooks(() => 1_000);
    looks.put(
      computerLookFromWrite(
        "thread-1",
        {
          botId: "bot-a",
          vmKey: "shared",
          excerpt: opened.look?.excerpt ?? "",
          title: "Example Domain",
          pid: binds.pid,
          windowId: binds.windowId,
          tokens: { "9": binds.tokens[9] ?? "" },
        },
        1_000,
      ),
    );
    const stored = looks.get("thread-1");
    const stanza = formatComputerObservation(stored);
    expect(stanza).toContain("[LAST COMPUTER OBSERVATION]");
    expect(stanza).toContain("Example Domain");
    expect(stanza).toContain("untrusted window contents");
    expect(stanza.split("[/LAST COMPUTER OBSERVATION]").length - 1).toBe(1);
    expect(stanza).not.toMatch(/vm_click|vm_open|vm_window/);
    const nextTurn = withComputerObservation("click that heading", stanza);
    expect(nextTurn.startsWith("click that heading")).toBe(true);
    expect(nextTurn).toContain("More information");
    expect(cuaClickFromIndex(binds, 9)).toEqual({ pid: 509, element_token: "s1:9" });

    looks.claimDesktop("shared", "thread-1");
    expect(looks.get("thread-1")?.title).toBe("Example Domain");
    looks.wipeVm("shared");
    expect(looks.get("thread-1")).toBeUndefined();
  });

  it("P4: frontier VM/VPS fuse a screenshot; Path A stays vm_* text and is not JPEG-wrapped", async () => {
    const inner = SPAWNED_PROXIES.containerMcp;
    const frontier = wrapComputerMcpForFrontier({
      command: process.execPath,
      args: [inner, "podman", "openmausbot-computer", "/run/cua.sock"],
      env: {},
    });
    expect(frontier.args[0]).toBe(SPAWNED_PROXIES.observeComputerMcp);
    expect(frontier.args[1]).toBe(OBSERVE_COMPUTER_WIRE_FLAG);
    expect(shouldFuseObserve("browser_navigate")).toBe(true);
    expect(shouldFuseObserve("get_window_state")).toBe(false);

    const png = wholePng();
    const fused = fuseObservation(
      { content: [{ type: "text", text: "clicked" }] },
      { data: png, mimeType: "image/png" },
      new ObservationCoordinator(),
      true,
    );
    expect(fused.content?.some((part) => part.type === "image" && part.data === png)).toBe(true);

    const nav = await waitForCuaNavigation(
      async () => ({
        structuredContent: { url: "https://beehiiv.example/leftover" },
      }),
      "https://example.com",
      noWait,
    );
    expect(nav.ok).toBe(false);
    expect(nav.text).toMatch(/not verified/i);
    expect(nav.text).not.toMatch(/retrying|rewrit/i);

    const listed = compactToolsListLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: { tools: [{ name: "browser_navigate", description: "Cua long text" }] },
      }),
    );
    expect(listed).toContain('"name":"vm_open"');
    expect(listed).not.toContain("image/jpeg");
    expect(compactObserveImageForModel("ollama::ibm/granite4.1:3b")).toBe(false);
    expect(compactObserveImageForModel("ollama::ibm/granite4.1:8b")).toBe(false);
    expect(compactObserveImageForModel("ollama::qwen3-vl:4b")).toBe(true);
    expect(compactObserveImageForModel("ollama::qwen3-vl:4b-instruct")).toBe(true);
    expect(compactObserveImageForModel("ollama::qwen2.5vl:7b")).toBe(true);
    const mapped = z
      .object({ params: z.object({ name: z.string() }) })
      .safeParse(
        JSON.parse(
          compactToolsCallLine(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 3,
              method: "tools/call",
              params: { name: "vm_open", arguments: { url: "https://example.com" } },
            }),
          ),
        ),
      );
    expect(mapped.success).toBe(true);
    if (!mapped.success) throw new Error("mapped vm_open call");
    expect(mapped.data.params.name).toBe("browser_navigate");

    const inject = wrapComputerMcpForLocalModel({
      command: process.execPath,
      args: [inner, "podman", "openmausbot-computer", "/run/cua.sock"],
      env: {},
    });
    expect(inject.args[0]).toBe(SPAWNED_PROXIES.compactComputerMcp);
    expect(wrapComputerMcpForFrontier(inject).args[0]).toBe(SPAWNED_PROXIES.compactComputerMcp);
    expect(wrapComputerMcpForFrontier({ command: "cua-driver", args: ["mcp"], env: {} }).args).toEqual(["mcp"]);
  });

  it("B-06: a healthy stopped VM resumes; drifted image still recreates; profiles stay in workspace", () => {
    expect(IMAGE_LAYER_VERSION).toBe("7");
    expect(VM_BROWSER_PROFILES_GUEST).toBe(`${VM_WORKSPACE_GUEST}/.browser-profiles`);
    const healthyStopped = {
      container: "stopped" as const,
      imageMatches: true,
      managed: true,
      network: "loopback" as const,
      security: "hardened" as const,
      persistence: "durable" as const,
    };
    expect(localVmMustRecreate(healthyStopped)).toBe(false);
    expect(localVmCanResume(healthyStopped)).toBe(true);
    expect(localVmCanResume({ ...healthyStopped, imageMatches: false })).toBe(false);
    expect(localVmMustRecreate({ ...healthyStopped, imageMatches: false })).toBe(true);
    expect(localVmMustRecreate({ ...healthyStopped, container: "missing" })).toBe(false);
  });
});
