// Contract test for the image-generation MCP proxy (image-proxy.ts): spawn it
// the way a driver's mcpServers entry does (process.execPath + entry file +
// env) against a stub of an OpenAI-compatible images endpoint and of the
// harness callback, then drive the MCP stdio surface end to end. No shebang,
// no shell — plain node child, so this runs on every OS.
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const PROXY = join(dirname(fileURLToPath(import.meta.url)), "image-proxy.ts");
const TOKEN = "test-comms-token";

/** A whole PNG as far as the proxy's integrity check is concerned: magic,
 * enough bytes to clear the truncation floor, and a real IEND terminator. */
const PNG = Buffer.concat([
  Buffer.from("89504e470d0a1a0a", "hex"),
  Buffer.alloc(600, 7),
  Buffer.from("IEND"),
  Buffer.from("ae426082", "hex"),
]);
const PNG_B64 = PNG.toString("base64");

let stub: Server;
let stubPort = 0;
let lastGenerateBody: any = null;
let generateResponse: () => { status: number; body: unknown } = () => ({ status: 200, body: { data: [{ b64_json: PNG_B64 }] } });
let reported: any[] = [];
let lastReportAuth: string | undefined;

type Proxy = { child: ChildProcess; rpc: (method: string, params?: unknown) => Promise<any>; dir: string };
const started: Proxy[] = [];

function startProxy(extraEnv: Record<string, string> = {}): Proxy {
  const dir = mkdtempSync(join(tmpdir(), "omb-image-"));
  const child = spawn(process.execPath, [PROXY], {
    env: {
      ...process.env,
      OMB_IMAGE_BASE_URL: `http://127.0.0.1:${stubPort}/v1`,
      OMB_IMAGE_API_KEY: "test-image-key",
      OMB_IMAGE_MODEL: "test-image-model",
      OMB_IMAGE_DIR: dir,
      OMB_HARNESS_URL: `http://127.0.0.1:${stubPort}`,
      OMB_COMMS_TOKEN: TOKEN,
      OMB_BOT_ID: "bot-artist",
      OMB_THREAD_ID: "thread-artist",
      ...extraEnv,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  const pending = new Map<number, (msg: any) => void>();
  let nextId = 100;
  let buf = "";
  child.stdout!.on("data", (c) => {
    buf += c;
    let nl;
    while ((nl = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      const msg = JSON.parse(line);
      pending.get(msg.id)?.(msg);
      pending.delete(msg.id);
    }
  });
  const rpc = (method: string, params?: unknown): Promise<any> =>
    new Promise((resolve, reject) => {
      const id = nextId++;
      pending.set(id, resolve);
      child.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
      setTimeout(() => {
        if (pending.delete(id)) reject(new Error(`${method} timed out`));
      }, 15_000).unref?.();
    });
  const proxy = { child, rpc, dir };
  started.push(proxy);
  return proxy;
}

let proxy: Proxy;
const generate = (args: unknown) => proxy.rpc("tools/call", { name: "generate_image", arguments: args });

beforeAll(async () => {
  stub = createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (req.url === "/v1/images/generations") {
        lastGenerateBody = { headers: req.headers, body: JSON.parse(data || "{}") };
        const { status, body } = generateResponse();
        res.writeHead(status, { "content-type": "application/json" });
        return res.end(JSON.stringify(body));
      }
      if (req.url === "/api/internal/images") {
        lastReportAuth = req.headers.authorization;
        reported.push(JSON.parse(data || "{}"));
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(JSON.stringify({ ok: true }));
      }
      if (req.url === "/hosted/image.png") {
        res.writeHead(200, { "content-type": "image/png" });
        return res.end(PNG);
      }
      res.writeHead(404, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: "unknown" }));
    });
  });
  await new Promise<void>((r) => stub.listen(0, "127.0.0.1", r));
  stubPort = (stub.address() as { port: number }).port;
  proxy = startProxy();
});

afterAll(async () => {
  for (const p of started) p.child.kill();
  await new Promise<void>((r) => stub.close(() => r()));
});

describe("image-proxy MCP surface", () => {
  it("answers the MCP handshake and lists the one tool", async () => {
    const init = await proxy.rpc("initialize", { protocolVersion: "2024-11-05" });
    expect(init.result.serverInfo.name).toContain("image");
    const list = await proxy.rpc("tools/list");
    expect(list.result.tools.map((t: { name: string }) => t.name)).toEqual(["generate_image"]);
  });

  it("generates, saves the file, returns the picture, and reports it to the harness", async () => {
    reported = [];
    const res = await generate({ prompt: "A red barn at dusk", size: "512x512" });

    const [text, image] = res.result.content;
    expect(text.text).toContain("Generated and saved to");
    expect(image).toMatchObject({ type: "image", mimeType: "image/png", data: PNG_B64 });

    const saved = String(text.text).match(/saved to (.+?)\. /)![1];
    expect(existsSync(saved)).toBe(true);
    expect(readFileSync(saved).equals(PNG)).toBe(true);
    expect(saved).toContain("a-red-barn-at-dusk");

    expect(reported).toHaveLength(1);
    expect(reported[0]).toMatchObject({ botId: "bot-artist", threadId: "thread-artist", mime: "image/png", data: PNG_B64 });
    expect(lastReportAuth).toBe(`Bearer ${TOKEN}`);
  });

  it("sends the configured model and bearer, and omits response_format", async () => {
    await generate({ prompt: "a cat" });
    expect(lastGenerateBody.body).toEqual({ model: "test-image-model", prompt: "a cat", size: "1024x1024", n: 1 });
    expect(lastGenerateBody.body.response_format).toBeUndefined();
    expect(lastGenerateBody.headers.authorization).toBe("Bearer test-image-key");
  });

  it("downloads the image when the endpoint answers with a URL instead of base64", async () => {
    generateResponse = () => ({ status: 200, body: { data: [{ url: `http://127.0.0.1:${stubPort}/hosted/image.png` }] } });
    const res = await generate({ prompt: "via url" });
    expect(res.result.content[1]).toMatchObject({ type: "image", data: PNG_B64 });
    generateResponse = () => ({ status: 200, body: { data: [{ b64_json: PNG_B64 }] } });
  });

  it("refuses a truncated image rather than writing a corrupt file", async () => {
    generateResponse = () => ({ status: 200, body: { data: [{ b64_json: PNG.subarray(0, 300).toString("base64") }] } });
    const res = await generate({ prompt: "truncated" });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("truncated");
    generateResponse = () => ({ status: 200, body: { data: [{ b64_json: PNG_B64 }] } });
  });

  it("surfaces the endpoint's error message without echoing the request", async () => {
    generateResponse = () => ({ status: 400, body: { error: { message: "content policy violation" } } });
    const res = await generate({ prompt: "nope" });
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toBe("content policy violation");
    generateResponse = () => ({ status: 200, body: { data: [{ b64_json: PNG_B64 }] } });
  });

  it("requires a prompt", async () => {
    const res = await generate({ prompt: "   " });
    expect(res.result.isError).toBe(true);
  });

  it("rejects unknown tools with -32602", async () => {
    const res = await proxy.rpc("tools/call", { name: "made_up", arguments: {} });
    expect(res.error.code).toBe(-32602);
  });

  it("stops generating once the per-turn cap is reached", async () => {
    const capped = startProxy({ OMB_IMAGE_MAX_CALLS: "1" });
    const first = await capped.rpc("tools/call", { name: "generate_image", arguments: { prompt: "one" } });
    expect(first.result.isError).toBeFalsy();
    const second = await capped.rpc("tools/call", { name: "generate_image", arguments: { prompt: "two" } });
    expect(second.result.isError).toBe(true);
    expect(second.result.content[0].text).toContain("per-turn limit");
  });
});
