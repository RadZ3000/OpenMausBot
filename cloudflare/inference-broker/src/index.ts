import {
  DEFAULT_CLASSIFY_MODEL,
  HOSTED_MODEL_ID,
  type CreditLedger,
  type InferenceTier,
  type InferenceWant,
  type RouteReason,
  assessCapability,
  catalogFromEnv,
  debitFrontier,
  frontierRemaining,
  grantPurchased,
  newInstallLedger,
  parseClassifyReply,
  parseUsage,
  rewriteModel,
  rollPeriod,
  routeReason,
  selectTier,
  tokensToDebit,
} from "./route";

export interface InferenceEnv {
  DB: {
    prepare(sql: string): {
      bind(...values: unknown[]): {
        first<T>(): Promise<T | null>;
        run(): Promise<unknown>;
      };
    };
  };
  REGISTRATION_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  SESSION_LIMITER: { limit(input: { key: string }): Promise<{ success: boolean }> };
  REGISTRATION_MODE: string;
  UPSTREAM_URL: string;
  UPSTREAM_API_KEY: string;
  FRONTIER_UPSTREAM_MODEL?: string;
  BASIC_UPSTREAM_MODEL?: string;
  CLASSIFY_UPSTREAM_MODEL?: string;
  INCLUDED_FRONTIER_TOKENS?: string;
  CREDIT_GRANT_SECRET?: string;
}

interface InstallationRow {
  id: string;
  token_hash: string;
  created_at: number;
  last_seen_at: number;
  disabled_at: number | null;
  period_end: number;
  included_remaining: number;
  purchased_remaining: number;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const MAX_CHAT_BODY = 1024 * 1024;
const TOKEN = /^[0-9a-f]{64}$/;
const CLASSIFY_TIMEOUT_MS = 1_500;

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function ledgerOf(row: InstallationRow): CreditLedger {
  return {
    periodEnd: row.period_end,
    includedRemaining: row.included_remaining,
    purchasedRemaining: row.purchased_remaining,
  };
}

function usageFromSseLine(line: string): ReturnType<typeof parseUsage> {
  const trimmed = line.trim();
  if (!trimmed.startsWith("data:")) return null;
  const data = trimmed.slice(5).trim();
  if (!data || data === "[DONE]") return null;
  try {
    return parseUsage(JSON.parse(data));
  } catch {
    return null;
  }
}

function normalizeUpstreamUrl(value: string) {
  return value.replace(/\/+$/, "");
}

export async function authenticate(request: Request, env: InferenceEnv) {
  const header = request.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!TOKEN.test(token)) return null;
  const row = await env.DB.prepare(
    "SELECT id, token_hash, created_at, last_seen_at, disabled_at, period_end, included_remaining, purchased_remaining FROM installations WHERE token_hash = ?",
  )
    .bind(await sha256(token))
    .first<InstallationRow>();
  return row && row.disabled_at === null ? row : null;
}

export async function persistLedger(env: InferenceEnv, id: string, ledger: CreditLedger, now: number) {
  await env.DB.prepare(
    "UPDATE installations SET last_seen_at = ?, period_end = ?, included_remaining = ?, purchased_remaining = ? WHERE id = ?",
  )
    .bind(now, ledger.periodEnd, ledger.includedRemaining, ledger.purchasedRemaining, id)
    .run();
}

async function register(request: Request, env: InferenceEnv) {
  if (env.REGISTRATION_MODE !== "open") return json({ error: "registration is temporarily closed" }, 503);
  const fingerprint = `${request.headers.get("cf-connecting-ip") ?? "unknown"}|${request.headers.get("user-agent") ?? "unknown"}`;
  if (!(await env.REGISTRATION_LIMITER.limit({ key: await sha256(fingerprint.slice(0, 512)) })).success) {
    return json({ error: "too many registration attempts" }, 429);
  }
  const catalog = catalogFromEnv(env);
  const now = Date.now();
  const ledger = newInstallLedger(now, catalog.includedFrontierTokens);
  const installationId = crypto.randomUUID();
  const token = randomToken();
  await env.DB.prepare(
    "INSERT INTO installations (id, token_hash, created_at, last_seen_at, disabled_at, period_end, included_remaining, purchased_remaining) VALUES (?, ?, ?, ?, NULL, ?, ?, ?)",
  )
    .bind(installationId, await sha256(token), now, now, ledger.periodEnd, ledger.includedRemaining, ledger.purchasedRemaining)
    .run();
  return json({ installationId, token, model: HOSTED_MODEL_ID }, 201);
}

function publicLedger(ledger: CreditLedger, catalog: ReturnType<typeof catalogFromEnv>) {
  const remaining = frontierRemaining(ledger);
  return {
    model: HOSTED_MODEL_ID,
    frontierAllowed: remaining > 0,
    frontierCreditsRemaining: remaining,
    includedFrontierTokens: catalog.includedFrontierTokens,
    periodEnd: ledger.periodEnd,
  };
}

async function grantCredits(request: Request, row: InstallationRow, env: InferenceEnv) {
  const secret = env.CREDIT_GRANT_SECRET?.trim();
  if (!secret || request.headers.get("x-credit-grant") !== secret) {
    return json({ error: "unauthorized" }, 401);
  }
  const body = (await request.json().catch(() => null)) as { tokens?: unknown } | null;
  const tokens = typeof body?.tokens === "number" ? body.tokens : NaN;
  if (!Number.isFinite(tokens) || tokens <= 0 || tokens > 50_000_000) {
    return json({ error: "tokens must be a positive number" }, 400);
  }
  const catalog = catalogFromEnv(env);
  const now = Date.now();
  const ledger = grantPurchased(rollPeriod(ledgerOf(row), now, catalog.includedFrontierTokens), tokens);
  await persistLedger(env, row.id, ledger, now);
  return json(publicLedger(ledger, catalog));
}

function passthroughHeaders(upstream: Response, tier: InferenceTier, reason: RouteReason) {
  const headers = new Headers({ "cache-control": "no-store" });
  const contentType = upstream.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("x-openmausbot-tier", tier);
  headers.set("x-openmausbot-route", reason);
  return headers;
}

async function classifyWant(env: InferenceEnv, excerpt: string): Promise<InferenceWant> {
  const model = env.CLASSIFY_UPSTREAM_MODEL?.trim() || DEFAULT_CLASSIFY_MODEL;
  try {
    const upstream = await fetch(`${normalizeUpstreamUrl(env.UPSTREAM_URL)}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.UPSTREAM_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 4,
        messages: [
          {
            role: "system",
            content: "Reply with one word: frontier if the user needs a strong coding or reasoning model, basic if a cheap chat model is enough.",
          },
          { role: "user", content: excerpt || "(empty)" },
        ],
      }),
      signal: AbortSignal.timeout(CLASSIFY_TIMEOUT_MS),
    });
    if (!upstream.ok) return "frontier";
    const parsed: unknown = await upstream.json();
    return parseClassifyReply(parsed) ?? "frontier";
  } catch {
    return "frontier";
  }
}

async function proxyChat(request: Request, row: InstallationRow, env: InferenceEnv) {
  if (!(await env.SESSION_LIMITER.limit({ key: row.id })).success) {
    return json({ error: "too many requests — wait and try again" }, 429);
  }
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_CHAT_BODY) return json({ error: "request is too large" }, 413);
  const raw = await request.arrayBuffer();
  if (raw.byteLength > MAX_CHAT_BODY) return json({ error: "request is too large" }, 413);
  let parsed: Record<string, unknown>;
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(raw));
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "invalid JSON body" }, 400);
    parsed = body as Record<string, unknown>;
  } catch {
    return json({ error: "invalid JSON body" }, 400);
  }
  const catalog = catalogFromEnv(env);
  const now = Date.now();
  let ledger = rollPeriod(ledgerOf(row), now, catalog.includedFrontierTokens);
  const assessment = assessCapability(parsed.messages);
  const allow = frontierRemaining(ledger) > 0;
  const want: InferenceWant =
    assessment.look !== "classify"
      ? assessment.look
      : allow
        ? await classifyWant(env, assessment.excerpt)
        : "frontier";
  const tier = selectTier(ledger, want);
  const reason = routeReason(ledger, want);
  const model = rewriteModel(tier, catalog);
  const stream = parsed.stream === true;
  const streamOptions =
    parsed.stream_options && typeof parsed.stream_options === "object" && !Array.isArray(parsed.stream_options)
      ? (parsed.stream_options as Record<string, unknown>)
      : {};
  const payload = {
    ...parsed,
    model,
    ...(stream ? { stream_options: { ...streamOptions, include_usage: true } } : {}),
  };
  const upstreamUrl = `${normalizeUpstreamUrl(env.UPSTREAM_URL)}/chat/completions`;
  const upstream = await fetch(upstreamUrl, {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.UPSTREAM_API_KEY}`,
      "content-type": "application/json",
      accept: request.headers.get("accept") ?? (stream ? "text/event-stream" : "application/json"),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10 * 60_000),
  });
  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text().catch(() => "");
    return json({ error: text.trim().slice(0, 240) || `upstream HTTP ${upstream.status}` }, upstream.status === 429 ? 429 : 502);
  }

  const debit = async (usage: ReturnType<typeof parseUsage>) => {
    const next = debitFrontier(ledger, tokensToDebit(tier, usage));
    ledger = next;
    await persistLedger(env, row.id, next, Date.now());
  };

  const contentType = upstream.headers.get("content-type") ?? "";
  if (!contentType.includes("text/event-stream")) {
    const text = await upstream.text();
    let usage = null;
    try {
      usage = parseUsage(JSON.parse(text));
    } catch {
      /* keep floor debit */
    }
    await debit(usage);
    return new Response(text, { status: upstream.status, headers: passthroughHeaders(upstream, tier, reason) });
  }

  const decoder = new TextDecoder();
  let pending = "";
  let usage: ReturnType<typeof parseUsage> = null;
  const streamOut = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          controller.enqueue(value);
          pending += decoder.decode(value, { stream: true });
          const lines = pending.split("\n");
          pending = lines.pop() ?? "";
          for (const line of lines) {
            const found = usageFromSseLine(line);
            if (found) usage = found;
          }
        }
        const found = usageFromSseLine(pending);
        if (found) usage = found;
        await debit(usage);
        controller.close();
      } catch (error) {
        try {
          await debit(usage);
        } catch {
          /* still surface the stream error */
        }
        controller.error(error);
      }
    },
  });
  return new Response(streamOut, { status: upstream.status, headers: passthroughHeaders(upstream, tier, reason) });
}

export async function route(request: Request, env: InferenceEnv) {
  const url = new URL(request.url);
  if (request.method === "GET" && url.pathname === "/health") {
    return json({ service: "openmausbot-inference", ready: Boolean(env.UPSTREAM_API_KEY) });
  }
  if (request.method === "POST" && url.pathname === "/v1/installations") return register(request, env);
  if (!url.pathname.startsWith("/v1/")) return json({ error: "not found" }, 404);
  const installation = await authenticate(request, env);
  if (!installation) return json({ error: "unauthorized" }, 401);
  if (request.method === "GET" && url.pathname === "/v1/me") {
    const catalog = catalogFromEnv(env);
    const now = Date.now();
    const before = ledgerOf(installation);
    const ledger = rollPeriod(before, now, catalog.includedFrontierTokens);
    if (ledger.periodEnd !== before.periodEnd) await persistLedger(env, installation.id, ledger, now);
    return json({ installationId: installation.id, ...publicLedger(ledger, catalog) });
  }
  if (request.method === "GET" && url.pathname === "/v1/models") {
    return json({
      object: "list",
      data: [{ id: HOSTED_MODEL_ID, object: "model", owned_by: "openmausbot", name: "Hosted" }],
    });
  }
  if (request.method === "POST" && url.pathname === "/v1/credits") return grantCredits(request, installation, env);
  if (request.method === "POST" && url.pathname === "/v1/chat/completions") return proxyChat(request, installation, env);
  return json({ error: "not found" }, 404);
}

export default {
  async fetch(request: Request, env: InferenceEnv) {
    try {
      return await route(request, env);
    } catch (error) {
      console.error(JSON.stringify({ message: "request failed", path: new URL(request.url).pathname, error: error instanceof Error ? error.message : String(error) }));
      return json({ error: "service unavailable" }, 503);
    }
  },
};
