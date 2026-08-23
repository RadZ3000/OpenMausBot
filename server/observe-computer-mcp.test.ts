import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { OBSERVE_COMPUTER_WIRE_FLAG, WAIT_FOR_NAVIGATION_NAME } from "./observe-computer.ts";

const OBSERVE = fileURLToPath(new URL("./observe-computer-mcp.ts", import.meta.url));

function wholePng(): string {
  const buf = Buffer.alloc(520, 0);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  Buffer.from("IEND", "ascii").copy(buf, buf.length - 8);
  return buf.toString("base64");
}

function spawnObserve(inner: string, frames: object[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [OBSERVE, OBSERVE_COMPUTER_WIRE_FLAG, inner], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, NODE_NO_WARNINGS: "1", OMB_OBSERVE_SETTLE_MS: "0" },
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
    for (const frame of frames) child.stdin.write(`${JSON.stringify(frame)}\n`);
    child.stdin.end();
  });
}

describe("observe-computer-mcp", () => {
  it("refuses to wrap anything but our Cua bridge entries", async () => {
    const result = await new Promise<{ code: number | null; stderr: string }>((resolve, reject) => {
      const child = spawn(process.execPath, [OBSERVE, "C:\\\\Windows\\\\System32\\\\notepad.exe"], {
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

  it("keeps Cua names on tools/list and adds wait_for_navigation", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-observe-list-"));
    const inner = join(dir, "container-mcp.js");
    writeFileSync(
      inner,
      [
        'let buf = "";',
        'process.stdin.setEncoding("utf8");',
        'process.stdin.on("data", (c) => { buf += c; });',
        'process.stdin.on("end", () => {',
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { tools: [{ name: "click", description: "Cua click" }] } }) + "\\n");',
        "});",
        "",
      ].join("\n"),
    );
    const listed = await spawnObserve(inner, [{ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }]);
    const frame = JSON.parse(listed.trim().split("\n")[0] ?? "");
    expect(frame.result.tools[0].name).toBe("click");
    expect(frame.result.tools.some((tool: { name: string }) => tool.name === WAIT_FOR_NAVIGATION_NAME)).toBe(true);
    expect(frame.result.tools.some((tool: { name: string }) => tool.name.startsWith("vm_"))).toBe(false);
  });

  it("attaches a screenshot to a mutating click without a follow-up screenshot call from the model", async () => {
    const png = wholePng();
    const dir = mkdtempSync(join(tmpdir(), "omb-observe-click-"));
    const inner = join(dir, "container-mcp.js");
    writeFileSync(
      inner,
      [
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        `const png = ${JSON.stringify(png)};`,
        "function reply(id, payload, content) {",
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
        "    const msg = JSON.parse(line);",
        "    const name = msg.params && msg.params.name;",
        '    if (name === "click") reply(msg.id, { status: "ok" }, [{ type: "text", text: "clicked 10,20" }]);',
        '    else if (name === "screenshot") reply(msg.id, { status: "ok" }, [{ type: "image", data: png, mimeType: "image/png" }]);',
        "    else reply(msg.id, { status: \"ok\" }, [{ type: \"text\", text: \"ok\" }]);",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await spawnObserve(inner, [
      {
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: { name: "click", arguments: { x: 10, y: 20 } },
      },
    ]);
    const clickFrame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":8')) ?? "");
    expect(clickFrame.result.isError).toBeFalsy();
    expect(clickFrame.result.content[0].text).toContain("clicked 10,20");
    expect(clickFrame.result.content.some((part: { type?: string }) => part.type === "image")).toBe(true);
  });

  it("leaves get_window_state as a pass-through with no extra screenshot", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-observe-look-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { appendFileSync } = require("node:fs");',
        `const seen = ${JSON.stringify(seen)};`,
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
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
        '    process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { content: [{ type: "text", text: "tree" }] } }) + "\\n");',
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await spawnObserve(inner, [
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_window_state", arguments: { pid: 11, window_id: 22 } },
      },
    ]);
    const frame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":3')) ?? "");
    expect(frame.result.content[0].text).toBe("tree");
    expect(frame.result.content.some((part: { type?: string }) => part.type === "image")).toBe(false);
    expect(readFileSync(seen, "utf8")).toContain("get_window_state");
    expect(readFileSync(seen, "utf8")).not.toContain("screenshot");
  });

  it("wait_for_navigation binds Chromium then reports Cua's page URL", async () => {
    const dir = mkdtempSync(join(tmpdir(), "omb-observe-nav-"));
    const inner = join(dir, "container-mcp.js");
    const seen = join(dir, "seen.txt");
    writeFileSync(
      inner,
      [
        'const { appendFileSync } = require("node:fs");',
        `const seen = ${JSON.stringify(seen)};`,
        'process.stdin.setEncoding("utf8");',
        'let buf = "";',
        "function reply(id, payload, text) {",
        '  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result: { content: [{ type: "text", text: text || "ok" }], structuredContent: payload } }) + "\\n");',
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
        '    if (name === "list_windows") reply(msg.id, { windows: [{ pid: 11, window_id: 22, is_on_screen: true, z_index: 2, app_name: "Chromium" }] });',
        '    else if (name === "get_browser_state") reply(msg.id, { url: "https://example.com/" });',
        "    else reply(msg.id, { status: \"ok\" });",
        "  }",
        "});",
        "",
      ].join("\n"),
    );
    const listed = await spawnObserve(inner, [
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: WAIT_FOR_NAVIGATION_NAME, arguments: { url: "https://example.com/" } },
      },
    ]);
    const frame = JSON.parse(listed.trim().split("\n").find((line) => line.includes('"id":4')) ?? "");
    expect(frame.result.isError).toBeFalsy();
    expect(frame.result.content[0].text).toContain("navigation verified");
    expect(readFileSync(seen, "utf8")).toContain("list_windows");
    expect(readFileSync(seen, "utf8")).toContain('"pid":11');
    expect(readFileSync(seen, "utf8")).toContain('"window_id":22');
    expect(readFileSync(seen, "utf8")).toContain("get_browser_state");
    expect(readFileSync(seen, "utf8")).not.toContain("browser_navigate");
  });
});
