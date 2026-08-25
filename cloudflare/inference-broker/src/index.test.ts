import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_CLASSIFY_MODEL, HOSTED_MODEL_ID, MIN_FRONTIER_DEBIT } from "./route";
import { route, sha256, type InferenceEnv } from "./index";

interface Row {
  id: string;
  token_hash: string;
  created_at: number;
  last_seen_at: number;
  disabled_at: number | null;
  period_end: number;
  included_remaining: number;
  purchased_remaining: number;
}

const HARD = "Implement a binary search in TypeScript with tests.";
const EASY = "hi";
const MIDDLE = "What is a good name for a houseplant?";

function memoryDb(rows: Row[] = []) {
  const bind = (sql: string, values: unknown[]) => ({
    async first<T>() {
      if (sql.includes("WHERE token_hash")) {
        return (rows.find((row) => row.token_hash === values[0]) as T | undefined) ?? null;
      }
      return (rows[0] as T | undefined) ?? null;
    },
    async run() {
      if (sql.startsWith("INSERT")) {
        rows.push({
          id: String(values[0]),
          token_hash: String(values[1]),
          created_at: Number(values[2]),
          last_seen_at: Number(values[3]),
          disabled_at: null,
          period_end: Number(values[4]),
          included_remaining: Number(values[5]),
          purchased_remaining: Number(values[6]),
        });
        return;
      }
      if (sql.startsWith("UPDATE")) {
        const id = String(values[4]);
        const row = rows.find((entry) => entry.id === id);
        if (!row) return;
        row.last_seen_at = Number(values[0]);
        row.period_end = Number(values[1]);
        row.included_remaining = Number(values[2]);
        row.purchased_remaining = Number(values[3]);
      }
    },
  });
  return {
    rows,
    prepare(sql: string) {
      return { bind: (...values: unknown[]) => bind(sql, values) };
    },
  };
}

function testEnv(overrides: Partial<InferenceEnv> = {}, rows: Row[] = []) {
  const db = memoryDb(rows);
  const env: InferenceEnv = {
    DB: db,
    REGISTRATION_LIMITER: { limit: async () => ({ success: true }) },
    SESSION_LIMITER: { limit: async () => ({ success: true }) },
    REGISTRATION_MODE: "open",
    UPSTREAM_URL: "https://openrouter.ai/api/v1",
    UPSTREAM_API_KEY: "sk-test",
    INCLUDED_FRONTIER_TOKENS: "1000",
    CREDIT_GRANT_SECRET: "grant-secret",
    FRONTIER_UPSTREAM_MODEL: "openai/gpt-4o-mini",
    BASIC_UPSTREAM_MODEL: "meta-llama/llama-3.3-70b-instruct",
    ...overrides,
  };
  return { env, db };
}

async function creditedInstall(token: string, remaining = 1000, purchased = 0) {
  return {
    id: `install-${token.slice(0, 4)}`,
    token_hash: await sha256(token),
    created_at: 1,
    last_seen_at: 1,
    disabled_at: null,
    period_end: Date.now() + 86_400_000,
    included_remaining: remaining,
    purchased_remaining: purchased,
  };
}

function jsonReply(model: string, total = 9) {
  return new Response(JSON.stringify({ model, choices: [{ message: { content: "ok" } }], usage: { total_tokens: total } }), {
    headers: { "content-type": "application/json" },
  });
}

function classifyReply(word: string) {
  return new Response(JSON.stringify({ choices: [{ message: { content: word } }] }), {
    headers: { "content-type": "application/json" },
  });
}

function stubByModel(replies: { classify?: () => Response | Promise<Response>; complete: (model: string) => Response | Promise<Response> }) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    const payload = JSON.parse(String(init?.body)) as { model: string };
    if (payload.model === DEFAULT_CLASSIFY_MODEL) {
      if (!replies.classify) throw new Error("classifier was not supposed to be called");
      return replies.classify();
    }
    return replies.complete(payload.model);
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("inference broker HTTP surface", () => {
  it("registers an install, refuses a closed door, and rate-limits sign-up", async () => {
    const { env } = testEnv();
    const created = await route(new Request("https://broker.test/v1/installations", { method: "POST" }), env);
    expect(created.status).toBe(201);
    const body = (await created.json()) as { token: string; model: string };
    expect(body.token).toMatch(/^[0-9a-f]{64}$/);
    expect(body.model).toBe(HOSTED_MODEL_ID);

    const closed = await route(new Request("https://broker.test/v1/installations", { method: "POST" }), {
      ...env,
      REGISTRATION_MODE: "closed",
    });
    expect(closed.status).toBe(503);

    const limited = await route(new Request("https://broker.test/v1/installations", { method: "POST" }), {
      ...env,
      REGISTRATION_LIMITER: { limit: async () => ({ success: false }) },
    });
    expect(limited.status).toBe(429);
  });

  it("reports credit ceiling on /v1/me without pretending the next turn is frontier", async () => {
    const token = "a".repeat(64);
    const { env } = testEnv({}, [await creditedInstall(token, 80)]);
    const me = await route(
      new Request("https://broker.test/v1/me", { headers: { authorization: `Bearer ${token}` } }),
      env,
    );
    expect(me.status).toBe(200);
    const snapshot = (await me.json()) as { frontierAllowed: boolean; frontierCreditsRemaining: number; tier?: string };
    expect(snapshot.frontierAllowed).toBe(true);
    expect(snapshot.frontierCreditsRemaining).toBe(80);
    expect(snapshot.tier).toBeUndefined();
  });

  it("sends chitchat to the basic model even with frontier credits, and ignores a requested SKU", async () => {
    const token = "a".repeat(64);
    const { env, db } = testEnv({}, [await creditedInstall(token, 80)]);
    const fetchImpl = stubByModel({
      complete: (model) => {
        expect(model).toBe("meta-llama/llama-3.3-70b-instruct");
        return jsonReply(model);
      },
    });
    vi.stubGlobal("fetch", fetchImpl);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ model: "gpt-4o", messages: [{ role: "user", content: EASY }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(chat.headers.get("x-openmausbot-tier")).toBe("basic");
    expect(chat.headers.get("x-openmausbot-route")).toBe("capability");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(db.rows[0].included_remaining).toBe(80);
  });

  it("sends a coding prompt to frontier without calling the classifier", async () => {
    const token = "c".repeat(64);
    const { env, db } = testEnv({}, [await creditedInstall(token)]);
    const fetchImpl = stubByModel({
      complete: (model) => {
        expect(model).toBe("openai/gpt-4o-mini");
        return jsonReply(model, 40);
      },
    });
    vi.stubGlobal("fetch", fetchImpl);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: HARD }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(chat.headers.get("x-openmausbot-tier")).toBe("frontier");
    expect(chat.headers.get("x-openmausbot-route")).toBe("frontier");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(db.rows[0].included_remaining).toBe(960);
  });

  it("asks the nano classifier only for the middle band", async () => {
    const token = "11".repeat(32);
    const { env } = testEnv({}, [await creditedInstall(token)]);
    const fetchImpl = stubByModel({
      classify: () => classifyReply("basic"),
      complete: (model) => {
        expect(model).toBe("meta-llama/llama-3.3-70b-instruct");
        return jsonReply(model);
      },
    });
    vi.stubGlobal("fetch", fetchImpl);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: MIDDLE }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(chat.headers.get("x-openmausbot-tier")).toBe("basic");
    expect(chat.headers.get("x-openmausbot-route")).toBe("capability");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("honours a middle-band classify that says frontier, and debits", async () => {
    const token = "22".repeat(32);
    const { env, db } = testEnv({}, [await creditedInstall(token)]);
    const fetchImpl = stubByModel({
      classify: () => classifyReply("frontier"),
      complete: (model) => {
        expect(model).toBe("openai/gpt-4o-mini");
        return jsonReply(model, 40);
      },
    });
    vi.stubGlobal("fetch", fetchImpl);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: MIDDLE }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(chat.headers.get("x-openmausbot-tier")).toBe("frontier");
    expect(chat.headers.get("x-openmausbot-route")).toBe("frontier");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(db.rows[0].included_remaining).toBe(960);
  });

  it("fails closed to frontier when the classifier times out", async () => {
    const token = "33".repeat(32);
    const { env, db } = testEnv({}, [await creditedInstall(token)]);
    const fetchImpl = stubByModel({
      classify: async () => {
        throw new DOMException("The operation was aborted.", "TimeoutError");
      },
      complete: (model) => {
        expect(model).toBe("openai/gpt-4o-mini");
        return jsonReply(model, 40);
      },
    });
    vi.stubGlobal("fetch", fetchImpl);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: MIDDLE }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(chat.headers.get("x-openmausbot-tier")).toBe("frontier");
    expect(db.rows[0].included_remaining).toBe(960);
  });

  it("keeps a hard turn on basic after frontier credits are gone, without classifying", async () => {
    const token = "b".repeat(64);
    const { env, db } = testEnv({}, [await creditedInstall(token, 0)]);
    const fetchImpl = stubByModel({
      complete: (model) => {
        expect(model).toBe("meta-llama/llama-3.3-70b-instruct");
        return jsonReply(model, 4000);
      },
    });
    vi.stubGlobal("fetch", fetchImpl);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: HARD }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(chat.headers.get("x-openmausbot-route")).toBe("credits");
    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(db.rows[0].included_remaining).toBe(0);
  });

  it("still answers on basic when credits are gone even if classify would have said frontier", async () => {
    const token = "44".repeat(32);
    const { env } = testEnv({}, [await creditedInstall(token, 0)]);
    const fetchImpl = stubByModel({
      classify: () => classifyReply("frontier"),
      complete: (model) => {
        expect(model).toBe("meta-llama/llama-3.3-70b-instruct");
        return jsonReply(model);
      },
    });
    vi.stubGlobal("fetch", fetchImpl);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: MIDDLE }] }),
      }),
      env,
    );
    expect(chat.status).toBe(200);
    expect(chat.headers.get("x-openmausbot-route")).toBe("credits");
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it("grants purchased credits", async () => {
    const token = "55".repeat(32);
    const { env, db } = testEnv({}, [await creditedInstall(token, 960)]);
    const granted = await route(
      new Request("https://broker.test/v1/credits", {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          "x-credit-grant": "grant-secret",
        },
        body: JSON.stringify({ tokens: 200 }),
      }),
      env,
    );
    expect(granted.status).toBe(200);
    expect(db.rows[0].purchased_remaining).toBe(200);
    expect((await granted.json() as { frontierCreditsRemaining: number }).frontierCreditsRemaining).toBe(1160);

    const refused = await route(
      new Request("https://broker.test/v1/credits", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ tokens: 1 }),
      }),
      env,
    );
    expect(refused.status).toBe(401);
  });

  it("rate-limits the hot path without hanging up the install", async () => {
    const token = "d".repeat(64);
    const { env } = testEnv({ SESSION_LIMITER: { limit: async () => ({ success: false }) } }, [await creditedInstall(token)]);
    const chat = await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: EASY }] }),
      }),
      env,
    );
    expect(chat.status).toBe(429);
    const body = (await chat.json()) as { error: string };
    expect(body.error).toMatch(/wait/i);
  });

  it("debits the frontier floor when a hard turn omits usage", async () => {
    const token = "e".repeat(64);
    const { env, db } = testEnv({}, [await creditedInstall(token, 5000)]);
    vi.stubGlobal(
      "fetch",
      stubByModel({
        complete: () => new Response(JSON.stringify({ choices: [] }), { headers: { "content-type": "application/json" } }),
      }),
    );
    await route(
      new Request("https://broker.test/v1/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages: [{ role: "user", content: HARD }] }),
      }),
      env,
    );
    expect(db.rows[0].included_remaining).toBe(5000 - MIN_FRONTIER_DEBIT);
  });
});
