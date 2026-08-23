import { describe, expect, it } from "vitest";

import {
  compactComputerInnerName,
  compactComputerTools,
  compactToolsCallLine,
  compactToolsListLine,
  COMPACT_COMPUTER_WIRE_FLAG,
  computerWireName,
  cuaNameForComputerWire,
  isAllowedCompactComputerInner,
  LOCAL_COMPUTER_TOOL_BLURBS,
  LOCAL_COMPUTER_TOOL_NAMES,
  LOCAL_COMPUTER_WIRE_NAMES,
  VM_CLICK_INPUT_SCHEMA,
  VM_LAUNCH_INPUT_SCHEMA,
  VM_OPEN_INPUT_SCHEMA,
  VM_WINDOW_INPUT_SCHEMA,
  wrapComputerMcpForLocalModel,
} from "./compact-computer-tools.ts";
import { SPAWNED_PROXIES } from "./proxy-paths.ts";

describe("compactComputerTools", () => {
  it("keeps the local allowlist, shortens names, and replaces Cua's long descriptions", () => {
    const out = compactComputerTools([
      { name: "browser_navigate", description: "A".repeat(4000), inputSchema: { type: "object" } },
      { name: "start_recording", description: "drop me", inputSchema: {} },
      { name: "launch_app", description: "also long", extra: true },
      { name: "get_window_state", description: "Cua pid required", inputSchema: { required: ["pid"] } },
      { name: "click", description: "Cua click schema", inputSchema: { required: ["pid"] } },
    ]);
    expect(out).toEqual([
      {
        name: "vm_open",
        description: LOCAL_COMPUTER_TOOL_BLURBS.browser_navigate,
        inputSchema: VM_OPEN_INPUT_SCHEMA,
      },
      {
        name: "vm_launch",
        description: LOCAL_COMPUTER_TOOL_BLURBS.launch_app,
        extra: true,
        inputSchema: VM_LAUNCH_INPUT_SCHEMA,
      },
      {
        name: "vm_window",
        description: LOCAL_COMPUTER_TOOL_BLURBS.get_window_state,
        inputSchema: VM_WINDOW_INPUT_SCHEMA,
      },
      {
        name: "vm_click",
        description: LOCAL_COMPUTER_TOOL_BLURBS.click,
        inputSchema: VM_CLICK_INPUT_SCHEMA,
      },
    ]);
  });

  it("returns an empty list when nothing matches", () => {
    expect(compactComputerTools([{ name: "install_ffmpeg" }])).toEqual([]);
  });

  it("maps every allowlisted Cua name to a unique vm_ alias and back", () => {
    const wires = new Set<string>();
    for (const cua of LOCAL_COMPUTER_TOOL_NAMES) {
      const wire = LOCAL_COMPUTER_WIRE_NAMES[cua];
      expect(wire.startsWith("vm_")).toBe(true);
      expect(computerWireName(cua)).toBe(wire);
      expect(cuaNameForComputerWire(wire)).toBe(cua);
      expect(wires.has(wire)).toBe(false);
      wires.add(wire);
    }
    expect(wires.size).toBe(LOCAL_COMPUTER_TOOL_NAMES.length);
    expect(LOCAL_COMPUTER_TOOL_NAMES).toHaveLength(8);
    expect(cuaNameForComputerWire("browser_navigate")).toBeUndefined();
  });

  it("tells the model to use numbered items instead of re-opening", () => {
    expect(LOCAL_COMPUTER_TOOL_BLURBS.browser_navigate).toMatch(/numbered item/i);
    expect(LOCAL_COMPUTER_TOOL_BLURBS.browser_navigate).toMatch(/not proof the destination loaded/i);
    expect(LOCAL_COMPUTER_TOOL_BLURBS.click).toMatch(/already open/i);
    expect(COMPACT_COMPUTER_WIRE_FLAG).toBe("--wire=vm-look-5");
  });

  it("drops Cua output schemas so a text-only click result is valid MCP", () => {
    const out = compactComputerTools([
      {
        name: "click",
        description: "Cua click",
        outputSchema: { type: "object" },
        output_schema: { type: "object" },
      },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]?.name).toBe("vm_click");
    expect(out[0]?.outputSchema).toBeUndefined();
    expect(out[0]?.output_schema).toBeUndefined();
  });

  it("does not name wire ids in blurbs", () => {
    for (const cua of LOCAL_COMPUTER_TOOL_NAMES) {
      const blurb = LOCAL_COMPUTER_TOOL_BLURBS[cua];
      expect(blurb).not.toMatch(/mcp__/);
      expect(blurb).not.toContain(LOCAL_COMPUTER_WIRE_NAMES[cua]);
    }
  });
});

describe("compactToolsListLine", () => {
  it("rewrites tools/list results and leaves other frames alone", () => {
    const listed = compactToolsListLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        result: {
          tools: [
            { name: "browser_navigate", description: "long" },
            { name: "install_ffmpeg", description: "no" },
          ],
        },
      }),
    );
    expect(JSON.parse(listed).result.tools).toEqual([
      {
        name: "vm_open",
        description: LOCAL_COMPUTER_TOOL_BLURBS.browser_navigate,
        inputSchema: VM_OPEN_INPUT_SCHEMA,
      },
    ]);
    expect(compactToolsListLine('{"jsonrpc":"2.0","id":2,"method":"tools/call"}')).toBe(
      '{"jsonrpc":"2.0","id":2,"method":"tools/call"}',
    );
    expect(compactToolsListLine("not-json")).toBe("not-json");
  });
});

describe("compactToolsCallLine", () => {
  it("maps vm_open back to Cua's browser_navigate", () => {
    const mapped = compactToolsCallLine(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "vm_open", arguments: { url: "https://example.com" } },
      }),
    );
    expect(JSON.parse(mapped)).toEqual({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "browser_navigate", arguments: { url: "https://example.com" } },
    });
  });

  it("leaves Cua names and non-calls alone", () => {
    const already = '{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"browser_navigate"}}';
    expect(compactToolsCallLine(already)).toBe(already);
    expect(compactToolsCallLine('{"jsonrpc":"2.0","id":1,"method":"initialize"}')).toBe(
      '{"jsonrpc":"2.0","id":1,"method":"initialize"}',
    );
    expect(compactToolsCallLine("not-json")).toBe("not-json");
  });
});

describe("compact computer inner path", () => {
  it("allows only our Cua bridge entries", () => {
    expect(compactComputerInnerName("C:\\\\srv\\\\container-mcp.js")).toBe("container-mcp.js");
    expect(isAllowedCompactComputerInner("/app/container-mcp.ts")).toBe(true);
    expect(isAllowedCompactComputerInner("/app/vps-container-mcp.js")).toBe(true);
    expect(isAllowedCompactComputerInner("/app/computer-proxy.js")).toBe(false);
  });
});

describe("wrapComputerMcpForLocalModel", () => {
  it("prepends compact-computer-mcp once", () => {
    const inner = SPAWNED_PROXIES.containerMcp;
    const once = wrapComputerMcpForLocalModel({
      command: process.execPath,
      args: [inner, "podman", "openmausbot-computer", "/run/cua.sock"],
      env: { ELECTRON_RUN_AS_NODE: "1" },
    });
    expect(once.args[0]).toBe(SPAWNED_PROXIES.compactComputerMcp);
    expect(once.args[1]).toBe(COMPACT_COMPUTER_WIRE_FLAG);
    expect(once.args[2]).toBe(inner);
    expect(wrapComputerMcpForLocalModel(once).args).toEqual(once.args);
  });

  it("wraps the VPS Cua bridge", () => {
    const inner = SPAWNED_PROXIES.vpsContainerMcp;
    const wrapped = wrapComputerMcpForLocalModel({
      command: process.execPath,
      args: [inner, "ssh-alias", "container"],
      env: {},
    });
    expect(wrapped.args[0]).toBe(SPAWNED_PROXIES.compactComputerMcp);
    expect(wrapped.args[2]).toBe(inner);
  });

  it("does not wrap host Cua driver argv", () => {
    const host = wrapComputerMcpForLocalModel({
      command: "C:\\cua-driver.exe",
      args: ["mcp"],
      env: { CUA_DRIVER_EMBEDDED: "1" },
    });
    expect(host.args).toEqual(["mcp"]);
  });
});
