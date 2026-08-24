import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { z } from "zod";

import { COMPACT_COMPUTER_WIRE_FLAG } from "./compact-computer-tools.ts";
import { computerLookWriteSchema, type ComputerLookWrite } from "./computer-thread-state.ts";

const COMPACT = fileURLToPath(new URL("./compact-computer-mcp.ts", import.meta.url));

describe("compact-computer-mcp", () => {
  it("refuses to wrap anything but our Cua bridge entries", async () => {
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [COMPACT, "C:\\\\Windows\\\\System32\\\\notepad.exe"], {
        stdio: ["ignore", "ignore", "pipe"],
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      });
      let stderr = "";
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stderr }));
    });
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("container-mcp");
  });

  it("renames tools/list outbound and non-URL tools/call inbound", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { writeFileSync } = require("node:fs");',
        "const seen = process.argv[2];",
        'let buf = "";',
        'process.stdin.setEncoding("utf8");',
        'process.stdin.on("data", (c) => { buf += c; });',
        'process.stdin.on("end", () => {',
        "  writeFileSync(seen, buf);",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "browser_navigate", description: "long" }] } }) + "\\n");',
        "});",
        "",
      ].join("\n"),
    );
    const listed = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner, seen], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
        else resolve(stdout);
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: { name: "vm_keys", arguments: { text: "hi" } },
        })}\n`,
      );
      child.stdin.end();
    });
    expect(JSON.parse(listed.trim().split("\n")[0] ?? "").result.tools[0].name).toBe("vm_open");
    expect(readFileSync(seen, "utf8")).toContain('"name":"type_text"');
  });

  it("opens a URL by preparing Chromium then calling Cua navigate", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-open-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { appendFileSync } = require("node:fs");',
        "const seen = process.argv[2];",
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "let windowLooks = 0;",
        "function reply(id, payload, text) {",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: text || "✅ markdown" }], structuredContent: payload } }) + "\\n");',
        "}",
        'process.stdin.on("data", (chunk) => {',
        "  buf += chunk;",
        '  for (;;) {',
        '    const nl = buf.indexOf("\\n");',
        "    if (nl < 0) break;",
        "    const line = buf.slice(0, nl);",
        "    buf = buf.slice(nl + 1);",
        "    if (!line) continue;",
        "    appendFileSync(seen, line + '\\n');",
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "list_apps") reply(msg.id, { apps: [{ name: "Chromium Web Browser", bundle_id: "chromium", launch_path: "/usr/bin/chromium", running: true, pid: 11, windows: [{ pid: 11, window_id: 22 }] }] });',
        '    else if (name === "list_windows") reply(msg.id, { windows: [{ pid: 11, window_id: 22, is_on_screen: true, app_name: "Chromium" }] });',
        '    else if (name === "get_browser_state") reply(msg.id, { target_id: "tgt", tabs: [{ tab_id: "tab" }] });',
        '    else if (name === "browser_navigate") reply(msg.id, { status: "ok" });',
        '    else if (name === "get_window_state") { windowLooks += 1; reply(msg.id, { status: "ok" }, windowLooks === 1 ? "- [0] frame \\"Quoted For Truth leftover - Chromium\\"" : "- [0] frame \\"Example Domain - Chromium\\"\\n- [9] link \\"More information\\""); }',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner, seen], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
        else resolve(stdout);
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: { name: "vm_open", arguments: { url: "https://example.com" } },
        })}\n`,
      );
      child.stdin.end();
    });
    const frame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":9')) ?? listed.trim());
    expect(frame.result.isError).toBe(false);
    expect(frame.result.content[0].text).toContain("https://example.com");
    expect(frame.result.content[0].text).toContain("More information");
    expect(frame.result.content[0].text).toMatch(/^opened /);
    const innerCalls = readFileSync(seen, "utf8");
    expect(innerCalls).toContain('"name":"browser_navigate"');
    expect(innerCalls).toContain('"tab_id":"tab"');
    expect(innerCalls).toMatch(/"session":"omb-[0-9a-f]{8}"/);
    expect(innerCalls).not.toContain("firefox");
  });

  it("fills pid for vm_window from the frontmost Chromium window", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-look-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { appendFileSync } = require("node:fs");',
        "const seen = process.argv[2];",
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "function reply(id, payload, text) {",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: text || "✅ markdown" }], structuredContent: payload } }) + "\\n");',
        "}",
        'process.stdin.on("data", (chunk) => {',
        "  buf += chunk;",
        '  for (;;) {',
        '    const nl = buf.indexOf("\\n");',
        "    if (nl < 0) break;",
        "    const line = buf.slice(0, nl);",
        "    buf = buf.slice(nl + 1);",
        "    if (!line) continue;",
        "    appendFileSync(seen, line + '\\n');",
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "list_windows") reply(msg.id, { windows: [{ pid: 11, window_id: 22, is_on_screen: true, z_index: 2, app_name: "Chromium" }] });',
        '    else if (name === "get_window_state") reply(msg.id, { status: "ok" }, "Posts Published: 2");',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner, seen], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
        else resolve(stdout);
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "vm_window", arguments: { capture_mode: "ax" } },
        })}\n`,
      );
      child.stdin.end();
    });
    const frame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":7')) ?? listed.trim());
    expect(frame.result.isError).toBe(false);
    expect(frame.result.content[0].text).toContain("Posts Published: 2");
    const innerCalls = readFileSync(seen, "utf8");
    expect(innerCalls).toContain('"name":"list_windows"');
    expect(innerCalls).toContain('"name":"get_window_state"');
    expect(innerCalls).toContain('"pid":11');
    expect(innerCalls).toContain('"window_id":22');
    expect(innerCalls).not.toContain("capture_mode");
  });

  it("fills Cua snapshot ids when vm_click sends only an index", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-click-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { appendFileSync } = require("node:fs");',
        "const seen = process.argv[2];",
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "function reply(id, payload, text) {",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: text || "✅ markdown" }], structuredContent: payload } }) + "\\n");',
        "}",
        'process.stdin.on("data", (chunk) => {',
        "  buf += chunk;",
        '  for (;;) {',
        '    const nl = buf.indexOf("\\n");',
        "    if (nl < 0) break;",
        "    const line = buf.slice(0, nl);",
        "    buf = buf.slice(nl + 1);",
        "    if (!line) continue;",
        "    appendFileSync(seen, line + '\\n');",
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "list_windows") reply(msg.id, { windows: [{ pid: 11, window_id: 22, is_on_screen: true, z_index: 2, app_name: "Chromium" }] });',
        '    else if (name === "get_window_state") reply(msg.id, { status: "ok", pid: 11, window_id: 22, snapshot_id: "snap-1", elements: [{ element_index: 120, role: "link", label: "Posts", element_token: "s1:120" }] }, "- [120] link \\"Posts\\" [actions=[press]]");',
        '    else if (name === "click") reply(msg.id, { status: "ok" }, "clicked");',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner, seen], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
        else resolve(stdout);
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 7,
          method: "tools/call",
          params: { name: "vm_window", arguments: {} },
        })}\n`,
      );
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 8,
          method: "tools/call",
          params: { name: "vm_click", arguments: { index: 120 } },
        })}\n`,
      );
      child.stdin.end();
    });
    const clickFrame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":8')) ?? "");
    expect(clickFrame.result.isError).toBe(false);
    expect(clickFrame.result.content[0].text).toContain("clicked [120]");
    expect(clickFrame.result.content[0].text).toContain("Posts");
    const innerCalls = readFileSync(seen, "utf8");
    expect(innerCalls).toContain('"name":"click"');
    expect(innerCalls).toContain('"element_token":"s1:120"');
    expect(innerCalls).not.toContain('"index":120');
  });

  it("surfaces Cua MCP isError instead of claiming no browser target", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-iserror-"));
    const inner = join(dir, "container-mcp.js");
    writeFileSync(
      inner,
      [
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "function reply(id, payload, isError) {",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: isError ? "session \'omb\' has ended" : "✅ markdown" }], structuredContent: payload, isError } }) + "\\n");',
        "}",
        'process.stdin.on("data", (chunk) => {',
        "  buf += chunk;",
        '  for (;;) {',
        '    const nl = buf.indexOf("\\n");',
        "    if (nl < 0) break;",
        "    const line = buf.slice(0, nl);",
        "    buf = buf.slice(nl + 1);",
        "    if (!line) continue;",
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "list_apps") reply(msg.id, { apps: [{ name: "Chromium Web Browser", bundle_id: "chromium", launch_path: "/usr/bin/chromium", running: true, pid: 11, windows: [{ pid: 11, window_id: 22 }] }] });',
        '    else if (name === "list_windows") reply(msg.id, { windows: [{ pid: 11, window_id: 22, is_on_screen: true, app_name: "Chromium" }] });',
        '    else if (name === "browser_prepare") reply(msg.id, { exit_code: 1 }, true);',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner], {
        stdio: ["pipe", "pipe", "pipe"],
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
        else resolve(stdout);
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 4,
          method: "tools/call",
          params: { name: "vm_open", arguments: { url: "https://example.com" } },
        })}\n`,
      );
      child.stdin.end();
    });
    const frame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":4')) ?? listed.trim());
    expect(frame.result.isError).toBe(true);
    expect(frame.result.content[0].text).toMatch(/has ended/);
    expect(frame.result.content[0].text).not.toMatch(/did not mint/);
  });

  it("clicks from a harness last-look when this process never read the window", async () => {
    const lookServer = await listenLook({
      botId: "bot-a",
      vmKey: "shared",
      excerpt: "Example Domain\n[120] link Posts",
      title: "Example Domain",
      pid: 11,
      windowId: 22,
      snapshotId: "snap-1",
      tokens: { "120": "s1:120" },
    });
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-stored-click-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { appendFileSync } = require("node:fs");',
        "const seen = process.argv[2];",
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "function reply(id, payload, text) {",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: text || "✅ markdown" }], structuredContent: payload } }) + "\\n");',
        "}",
        'process.stdin.on("data", (chunk) => {',
        "  buf += chunk;",
        '  for (;;) {',
        '    const nl = buf.indexOf("\\n");',
        "    if (nl < 0) break;",
        "    const line = buf.slice(0, nl);",
        "    buf = buf.slice(nl + 1);",
        "    if (!line) continue;",
        "    appendFileSync(seen, line + '\\n');",
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "click") reply(msg.id, { status: "ok" }, "clicked");',
        '    else if (name === "get_window_state") reply(msg.id, { status: "ok", pid: 11, window_id: 22, snapshot_id: "snap-1", elements: [{ element_index: 120, role: "link", label: "Posts", element_token: "s1:120" }] }, "- [120] link \\"Posts\\"");',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    try {
      const listed = await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner, seen], {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            NODE_NO_WARNINGS: "1",
            OMB_LOOK_URL: lookServer.url,
            OMB_LOOK_TOKEN: "look-secret",
            OMB_BOT_ID: "bot-a",
            OMB_VM_KEY: "shared",
          },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
          else resolve(stdout);
        });
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: 8,
            method: "tools/call",
            params: { name: "vm_click", arguments: { index: 120 } },
          })}\n`,
        );
        child.stdin.end();
      });
      const clickFrame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":8')) ?? "");
      expect(clickFrame.result.isError).toBe(false);
      expect(clickFrame.result.content[0].text).toContain("clicked [120]");
      const innerCalls = readFileSync(seen, "utf8");
      expect(innerCalls).toContain('"name":"click"');
      expect(innerCalls).toContain('"element_token":"s1:120"');
      expect(innerCalls).not.toContain('"index":120');
    } finally {
      await lookServer.close();
    }
  });

  it("writes the last look to the harness after vm_open", async () => {
    const lookServer = await listenLook(null);
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-put-look-"));
    const inner = join(dir, "container-mcp.js");
    writeFileSync(
      inner,
      [
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "let windowLooks = 0;",
        "function reply(id, payload, text) {",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: text || "✅ markdown" }], structuredContent: payload } }) + "\\n");',
        "}",
        'process.stdin.on("data", (chunk) => {',
        "  buf += chunk;",
        '  for (;;) {',
        '    const nl = buf.indexOf("\\n");',
        "    if (nl < 0) break;",
        "    const line = buf.slice(0, nl);",
        "    buf = buf.slice(nl + 1);",
        "    if (!line) continue;",
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "list_apps") reply(msg.id, { apps: [{ name: "Chromium Web Browser", bundle_id: "chromium", launch_path: "/usr/bin/chromium", running: true, pid: 11, windows: [{ pid: 11, window_id: 22 }] }] });',
        '    else if (name === "list_windows") reply(msg.id, { windows: [{ pid: 11, window_id: 22, is_on_screen: true, app_name: "Chromium" }] });',
        '    else if (name === "get_browser_state") reply(msg.id, { target_id: "tgt", tabs: [{ tab_id: "tab" }] });',
        '    else if (name === "browser_navigate") reply(msg.id, { status: "ok" });',
        '    else if (name === "get_window_state") { windowLooks += 1; reply(msg.id, { status: "ok", pid: 11, window_id: 22, snapshot_id: "snap-1", elements: [{ element_index: 1, role: "heading", label: "Example Domain", element_token: "s1:1" }] }, windowLooks === 1 ? "Quoted For Truth leftover" : "Example Domain heading"); }',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    try {
      await new Promise<string>((resolve, reject) => {
        const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner], {
          stdio: ["pipe", "pipe", "pipe"],
          env: {
            ...process.env,
            NODE_NO_WARNINGS: "1",
            OMB_LOOK_URL: lookServer.url,
            OMB_LOOK_TOKEN: "look-secret",
            OMB_BOT_ID: "bot-a",
            OMB_VM_KEY: "shared",
          },
        });
        let stdout = "";
        let stderr = "";
        child.stdout.on("data", (chunk: Buffer) => {
          stdout += chunk.toString();
        });
        child.stderr.on("data", (chunk: Buffer) => {
          stderr += chunk.toString();
        });
        child.on("error", reject);
        child.on("close", (code) => {
          if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
          else resolve(stdout);
        });
        child.stdin.write(
          `${JSON.stringify({
            jsonrpc: "2.0",
            id: 9,
            method: "tools/call",
            params: { name: "vm_open", arguments: { url: "https://example.com" } },
          })}\n`,
        );
        child.stdin.end();
      });
      expect(lookServer.puts.length).toBeGreaterThan(0);
      const last = lookServer.puts[lookServer.puts.length - 1];
      expect(last?.pid).toBe(11);
      expect(last?.windowId).toBe(22);
      expect(last?.title).toContain("Example Domain");
      expect(last?.tokens?.["1"]).toBe("s1:1");
    } finally {
      await lookServer.close();
    }
  });

  it("fuses a screenshot onto vm_open only when OMB_COMPACT_OBSERVE_IMAGE=1", async () => {
    const pngBuf = Buffer.alloc(520, 0);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(pngBuf, 0);
    Buffer.from("IEND", "ascii").copy(pngBuf, pngBuf.length - 8);
    const png = pngBuf.toString("base64");
    const dir = mkdtempSync(join(tmpdir(), "omb-compact-img-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { appendFileSync } = require("node:fs");',
        "const seen = process.argv[2];",
        `const png = ${JSON.stringify(png)};`,
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "let windowLooks = 0;",
        "function reply(id, payload, text, image) {",
        "  const content = [{ type: \"text\", text: text || \"✅ markdown\" }];",
        "  if (image) content.push({ type: \"image\", data: image, mimeType: \"image/png\" });",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content, structuredContent: payload } }) + "\\n");',
        "}",
        'process.stdin.on("data", (chunk) => {',
        "  buf += chunk;",
        "  for (;;) {",
        '    const nl = buf.indexOf("\\n");',
        "    if (nl < 0) break;",
        "    const line = buf.slice(0, nl);",
        "    buf = buf.slice(nl + 1);",
        "    if (!line) continue;",
        "    appendFileSync(seen, line + '\\n');",
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "list_apps") reply(msg.id, { apps: [{ name: "Chromium Web Browser", bundle_id: "chromium", launch_path: "/usr/bin/chromium", running: true, pid: 11, windows: [{ pid: 11, window_id: 22 }] }] });',
        '    else if (name === "list_windows") reply(msg.id, { windows: [{ pid: 11, window_id: 22, is_on_screen: true, app_name: "Chromium" }] });',
        '    else if (name === "get_browser_state") reply(msg.id, { target_id: "tgt", tabs: [{ tab_id: "tab" }] });',
        '    else if (name === "browser_navigate") reply(msg.id, { status: "ok" });',
        '    else if (name === "screenshot") reply(msg.id, { status: "ok" }, "shot", png);',
        '    else if (name === "get_window_state") { windowLooks += 1; reply(msg.id, { status: "ok" }, windowLooks === 1 ? "- [0] frame \\"Quoted For Truth leftover - Chromium\\"" : "- [0] frame \\"Example Domain - Chromium\\"\\n- [9] link \\"More information\\""); }',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await new Promise<string>((resolve, reject) => {
      const child = spawn(process.execPath, [COMPACT, COMPACT_COMPUTER_WIRE_FLAG, inner, seen], {
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          NODE_NO_WARNINGS: "1",
          OMB_COMPACT_OBSERVE_IMAGE: "1",
          OMB_OBSERVE_SETTLE_MS: "0",
        },
      });
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      child.on("error", reject);
      child.on("close", (code) => {
        if (code !== 0 && code !== null) reject(new Error(`exit ${code}: ${stderr}`));
        else resolve(stdout);
      });
      child.stdin.write(
        `${JSON.stringify({
          jsonrpc: "2.0",
          id: 9,
          method: "tools/call",
          params: { name: "vm_open", arguments: { url: "https://example.com" } },
        })}\n`,
      );
      child.stdin.end();
    });
    const frame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":9')) ?? listed.trim());
    expect(frame.result.isError).toBe(false);
    expect(JSON.stringify(frame.result.content)).toContain('"type":"image"');
    expect(readFileSync(seen, "utf8")).toContain('"name":"screenshot"');
  });
});

function listenLook(initial: ComputerLookWrite | null): Promise<{
  url: string;
  puts: ComputerLookWrite[];
  close: () => Promise<void>;
}> {
  const puts: ComputerLookWrite[] = [];
  let current = initial;
  return new Promise((resolve, reject) => {
    const server: Server = createServer((req, res) => {
      if (req.method === "GET") {
        if (!current) {
          res.writeHead(404, { "content-type": "application/json" });
          res.end(JSON.stringify({ error: "no look" }));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(current));
        return;
      }
      if (req.method === "PUT") {
        const chunks: Buffer[] = [];
        req.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
        });
        req.on("end", () => {
          const parsed = computerLookWriteSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
          if (!parsed.success) {
            res.writeHead(400, { "content-type": "application/json" });
            res.end(JSON.stringify({ error: "invalid look" }));
            return;
          }
          current = parsed.data;
          puts.push(parsed.data);
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        });
        return;
      }
      res.writeHead(405);
      res.end();
    });
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const parsed = z.object({ port: z.number() }).safeParse(server.address());
      if (!parsed.success) {
        reject(new Error("look server had no port"));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${parsed.data.port}/api/internal/computer-look?threadId=t1`,
        puts,
        close: () =>
          new Promise((done, fail) => {
            server.close((err) => (err ? fail(err) : done()));
          }),
      });
    });
  });
}
