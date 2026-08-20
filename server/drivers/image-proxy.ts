// Image generation MCP proxy — spawned as an MCP server inside a bot's agent
// process (via the "imageGen" integration). Exposes one tool:
//
//   generate_image(prompt, size?)  → writes a PNG into the bot's workspace,
//                                    returns the path plus the picture itself
//
// The endpoint is any OpenAI-compatible /v1/images/generations: the hosted
// OpenAI one, or a local diffusion server (LocalAI, ComfyUI behind its
// openai-api proxy). Only the base URL and key differ, which is the same
// trick drivers/local-inject.ts plays for text models.
//
// Two things this proxy owns that the agent cannot:
//   - the credential, which stays in this child's env and never reaches the
//     agent CLI (a leaked OPENAI_API_KEY there would flip Codex's billing off
//     the ChatGPT login — see drivers/codex.ts)
//   - telling the harness an image exists. Tool results go to the agent, not
//     through the harness, so without this callback the user would see a
//     "generate_image" chip and no picture.
//
// Speaks raw JSON-RPC 2.0 over stdio (no MCP SDK — house style, matches
// agents-proxy / computer-proxy). All state comes from env:
//   OMB_IMAGE_BASE_URL   OpenAI-compatible base (default https://api.openai.com/v1)
//   OMB_IMAGE_API_KEY    bearer for that endpoint; omitted for keyless local hosts
//   OMB_IMAGE_MODEL      model id (default gpt-image-1)
//   OMB_IMAGE_DIR        directory to write images into
//   OMB_IMAGE_MAX_CALLS  per-process cap, so a retry loop cannot bill forever
//   OMB_HARNESS_URL / OMB_COMMS_TOKEN / OMB_BOT_ID / OMB_THREAD_ID  callback
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import readline from "node:readline";

const BASE_URL = (process.env.OMB_IMAGE_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const API_KEY = process.env.OMB_IMAGE_API_KEY ?? "";
const MODEL = process.env.OMB_IMAGE_MODEL || "gpt-image-1";
const IMAGE_DIR = process.env.OMB_IMAGE_DIR ?? "";
const HARNESS = process.env.OMB_HARNESS_URL ?? "http://127.0.0.1:8799";
const TOKEN = process.env.OMB_COMMS_TOKEN ?? "";
const BOT_ID = process.env.OMB_BOT_ID ?? "";
const THREAD_ID = process.env.OMB_THREAD_ID ?? "";
const MAX_CALLS = Number(process.env.OMB_IMAGE_MAX_CALLS ?? "8") || 8;

/** Generation is slow on a local diffusion server; a hosted one is seconds. */
const REQUEST_TIMEOUT_MS = 180_000;
/** Past this the picture goes to the transcript and the file, but not into
 * the agent's context — a multi-megabyte base64 block buys nothing there. */
const INLINE_MAX_BYTES = 400_000;

const PNG_MAGIC = Buffer.from("89504e470d0a1a0a", "hex");

const TOOLS = [
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt and save it into this bot's workspace. Returns the saved file path, and the image is shown to the user in the chat automatically. Use it for mockups, diagrams, illustrations and other pictures the user asked you to make. Describe the image fully in the prompt — the generator sees only this prompt, not the conversation.",
    inputSchema: {
      type: "object",
      properties: {
        prompt: { type: "string", description: "What to draw. Be specific about subject, style, layout and colours." },
        size: { type: "string", description: 'Pixel dimensions, e.g. "1024x1024", "1536x1024", "1024x1536". Defaults to 1024x1024.' },
      },
      required: ["prompt"],
    },
  },
];

type Json = Record<string, unknown>;
const send = (msg: Json) => process.stdout.write(JSON.stringify(msg) + "\n");
const ok = (id: unknown, result: unknown) => send({ jsonrpc: "2.0", id, result });
const rpcErr = (id: unknown, code: number, message: string) => send({ jsonrpc: "2.0", id, error: { code, message } });

let calls = 0;

/** A filename that says what the picture is, without letting a prompt steer
 * the path: letters, digits and dashes only, never empty, never absolute. */
function slug(prompt: string): string {
  const base = prompt.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return base || "image";
}

/** The bytes have to be a whole image before anything downstream trusts them:
 * a truncated body from a proxy or a half-written local file would otherwise
 * become a corrupt file on disk and a broken bubble in the transcript. */
function decodedImage(base64: string): { bytes: Buffer; mime: string } {
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 512) throw new Error("the image endpoint returned a truncated image");
  if (bytes.subarray(0, 8).equals(PNG_MAGIC)) {
    if (bytes.subarray(-8, -4).toString("latin1") !== "IEND") throw new Error("the PNG was cut off before its end marker");
    return { bytes, mime: "image/png" };
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    if (bytes[bytes.length - 2] !== 0xff || bytes[bytes.length - 1] !== 0xd9) {
      throw new Error("the JPEG was cut off before its end marker");
    }
    return { bytes, mime: "image/jpeg" };
  }
  throw new Error("the image endpoint returned something that is not a PNG or JPEG");
}

/** `response_format` is deliberately not sent: gpt-image-1 rejects it and
 * always answers with b64_json, while older models and local servers may
 * answer with a URL. Accepting either keeps one client for every backend. */
async function generate(prompt: string, size: string): Promise<{ bytes: Buffer; mime: string }> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (API_KEY) headers.authorization = `Bearer ${API_KEY}`;
  const res = await fetch(`${BASE_URL}/images/generations`, {
    method: "POST",
    headers,
    body: JSON.stringify({ model: MODEL, prompt, size, n: 1 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const body = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    // Never echo the whole body — an error payload can quote the request,
    // and the request is not where a credential should end up in a log.
    const error = (body.error ?? {}) as Json;
    throw new Error(String(error.message ?? `image endpoint returned HTTP ${res.status}`));
  }
  const first = (Array.isArray(body.data) ? body.data[0] : null) as Json | null;
  if (!first) throw new Error("the image endpoint returned no image");
  const inline = String(first.b64_json ?? "");
  if (inline) return decodedImage(inline);
  const url = String(first.url ?? "");
  if (!url) throw new Error("the image endpoint returned neither image data nor a URL");
  const fetched = await fetch(url, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  if (!fetched.ok) throw new Error(`could not download the generated image (HTTP ${fetched.status})`);
  return decodedImage(Buffer.from(await fetched.arrayBuffer()).toString("base64"));
}

/** Hand the finished picture to the harness so it lands in the transcript.
 * Best-effort by design: the file is already written and the agent already
 * has the image, so a callback failure must not fail the tool call. */
async function report(base64: string, mime: string, path: string): Promise<void> {
  try {
    await fetch(`${HARNESS}/api/internal/images`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ botId: BOT_ID, threadId: THREAD_ID, data: base64, mime, path }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    /* the image survives on disk and in the reply; the bubble is the only loss */
  }
}

async function callTool(args: Json): Promise<{ content: unknown[]; isError?: boolean }> {
  const prompt = String(args.prompt ?? "").trim();
  if (!prompt) return { content: [{ type: "text", text: "generate_image needs a prompt." }], isError: true };
  if (calls >= MAX_CALLS) {
    return {
      content: [{ type: "text", text: `This turn has already generated ${MAX_CALLS} images — the per-turn limit. Ask the user before generating more.` }],
      isError: true,
    };
  }
  calls += 1;
  const size = String(args.size ?? "").trim() || "1024x1024";
  const { bytes, mime } = await generate(prompt, size);
  const base64 = bytes.toString("base64");

  const directory = join(IMAGE_DIR, "images");
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `${Date.now()}-${slug(prompt)}.${mime === "image/jpeg" ? "jpg" : "png"}`);
  writeFileSync(file, bytes);
  await report(base64, mime, file);

  const content: unknown[] = [{ type: "text", text: `Generated and saved to ${file}. The user can already see it in the chat.` }];
  if (bytes.length <= INLINE_MAX_BYTES) content.push({ type: "image", data: base64, mimeType: mime });
  return { content };
}

async function handle(msg: Json) {
  const id = msg.id;
  const method = msg.method as string | undefined;
  if (!method) return;
  const params = (msg.params ?? {}) as Json;
  switch (method) {
    case "initialize":
      ok(id, {
        protocolVersion: (params.protocolVersion as string) ?? "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "openmausbot-image", version: "0.1.0" },
      });
      return;
    case "notifications/initialized":
    case "notifications/cancelled":
      return;
    case "ping":
      ok(id, {});
      return;
    case "tools/list":
      ok(id, { tools: TOOLS });
      return;
    case "tools/call": {
      const name = params.name as string;
      if (!TOOLS.some((tool) => tool.name === name)) return rpcErr(id, -32602, `Unknown tool: ${name}`);
      try {
        ok(id, await callTool((params.arguments ?? {}) as Json));
      } catch (e) {
        ok(id, { content: [{ type: "text", text: (e as Error).message }], isError: true });
      }
      return;
    }
    default:
      if (id !== undefined) rpcErr(id, -32601, `Method not found: ${method}`);
  }
}

const rl = readline.createInterface({ input: process.stdin, terminal: false });
rl.on("line", (line) => {
  const text = line.trim();
  if (!text) return;
  let msg: Json;
  try {
    msg = JSON.parse(text) as Json;
  } catch {
    return;
  }
  void handle(msg).catch((e) => {
    if (msg.id !== undefined) rpcErr(msg.id, -32603, (e as Error).message);
  });
});
rl.on("close", () => process.exit(0));
