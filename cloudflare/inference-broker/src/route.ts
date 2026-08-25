// Path C routing: capability first, credits as a ceiling, never a hang-up.
//
// The desktop is untrusted for billing. This module is the whole product
// decision for one completion request — whether the task wants frontier,
// whether credits allow it, which SKU, whether to debit, how a month rolls.
// The Worker authenticates, may ask a nano classifier, and proxies; it must
// not invent a second policy.
// See docs/plans/2026-08-25-001-path-c-hosted-trial-plan.md.

export const PERIOD_MS = 30 * 24 * 60 * 60 * 1000;
export const DEFAULT_INCLUDED_FRONTIER_TOKENS = 250_000;
export const MIN_FRONTIER_DEBIT = 500;
export const HOSTED_MODEL_ID = "openmausbot/auto";
export const DEFAULT_CLASSIFY_MODEL = "meta-llama/llama-3.2-3b-instruct";
export const CLASSIFY_EXCERPT_CHARS = 800;

export type InferenceTier = "frontier" | "basic";
export type InferenceWant = "frontier" | "basic";
export type RouteReason = "frontier" | "capability" | "credits";
export type CapabilityLook = "frontier" | "basic" | "classify";

export interface CreditLedger {
  periodEnd: number;
  includedRemaining: number;
  purchasedRemaining: number;
}

export interface RouterCatalog {
  frontierModel: string;
  basicModel: string;
  includedFrontierTokens: number;
}

export interface CapabilityAssessment {
  look: CapabilityLook;
  excerpt: string;
}

const CHITCHAT = /^(ok(ay)?|thanks?|thank you|please|yes|no|hi|hello|hey|sure|got it|cool|great|nice|yep|nope|k|thx|ty)[\s!.?]*$/i;
const FRONTIER_VERB = /\b(implement|refactor|debug|fix|write|build)\b/i;

export function frontierRemaining(ledger: CreditLedger): number {
  return Math.max(0, ledger.includedRemaining) + Math.max(0, ledger.purchasedRemaining);
}

export function rollPeriod(ledger: CreditLedger, now: number, includedFrontierTokens: number): CreditLedger {
  if (now < ledger.periodEnd) return ledger;
  return {
    periodEnd: now + PERIOD_MS,
    includedRemaining: includedFrontierTokens,
    purchasedRemaining: Math.max(0, ledger.purchasedRemaining),
  };
}

/** Capability first, credits as a ceiling. Easy turns stay basic even with a
 * full ledger. Hard turns stay basic once frontier credits are gone. */
export function selectTier(ledger: CreditLedger, want: InferenceWant): InferenceTier {
  return want === "frontier" && frontierRemaining(ledger) > 0 ? "frontier" : "basic";
}

export function routeReason(ledger: CreditLedger, want: InferenceWant): RouteReason {
  if (want === "frontier" && frontierRemaining(ledger) <= 0) return "credits";
  if (want === "basic") return "capability";
  return "frontier";
}

/** The client always sends HOSTED_MODEL_ID. Anything else is still rewritten
 * so a patched desktop cannot escalate to a frontier SKU on our bill. */
export function rewriteModel(tier: InferenceTier, catalog: RouterCatalog): string {
  return tier === "frontier" ? catalog.frontierModel : catalog.basicModel;
}

export function lastUserText(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const row = messages[i];
    if (!row || typeof row !== "object") continue;
    const record = row as Record<string, unknown>;
    if (record.role !== "user") continue;
    return contentText(record.content).trim();
  }
  return "";
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const part of content) {
    if (typeof part === "string") {
      parts.push(part);
      continue;
    }
    if (part && typeof part === "object") {
      const text = (part as Record<string, unknown>).text;
      if (typeof text === "string") parts.push(text);
    }
  }
  return parts.join("\n");
}

/** Heuristics that skip the nano classify call. Obvious chitchat is basic;
 * fenced code, long prompts, and coding verbs are frontier. The middle band
 * returns `classify` so the Worker can ask a cheap model. Empty input also
 * classifies — the Worker fails closed to frontier if that call errors. */
export function assessCapability(messages: unknown): CapabilityAssessment {
  const text = lastUserText(messages);
  const excerpt = text.slice(0, CLASSIFY_EXCERPT_CHARS);
  if (!text) return { look: "classify", excerpt };
  if (text.includes("```") || text.length >= 400) return { look: "frontier", excerpt };
  if (FRONTIER_VERB.test(text)) return { look: "frontier", excerpt };
  if (text.length <= 48 && (CHITCHAT.test(text) || text.length <= 12)) return { look: "basic", excerpt };
  return { look: "classify", excerpt };
}

export function parseClassifyReply(body: unknown): InferenceWant | null {
  if (!body || typeof body !== "object") return null;
  const choices = (body as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: unknown }).message;
  if (!message || typeof message !== "object") return null;
  const raw = (message as { content?: unknown }).content;
  const text = typeof raw === "string" ? raw : "";
  const word = text.trim().toLowerCase().split(/\s+/)[0]?.replace(/[^a-z]/g, "") ?? "";
  if (word === "basic") return "basic";
  if (word === "frontier") return "frontier";
  return null;
}

export function debitFrontier(ledger: CreditLedger, tokens: number): CreditLedger {
  let left = Math.max(0, Math.floor(tokens));
  let included = Math.max(0, ledger.includedRemaining);
  let purchased = Math.max(0, ledger.purchasedRemaining);
  const fromIncluded = Math.min(included, left);
  included -= fromIncluded;
  left -= fromIncluded;
  const fromPurchased = Math.min(purchased, left);
  purchased -= fromPurchased;
  return { ...ledger, includedRemaining: included, purchasedRemaining: purchased };
}

export function grantPurchased(ledger: CreditLedger, tokens: number): CreditLedger {
  return {
    ...ledger,
    purchasedRemaining: Math.max(0, ledger.purchasedRemaining) + Math.max(0, Math.floor(tokens)),
  };
}

/** Usage from an OpenAI-compatible body, or a floor so a silent stream still
 * spends frontier. Basic completions do not debit. */
export function tokensToDebit(tier: InferenceTier, usage: { prompt?: number; completion?: number; total?: number } | null): number {
  if (tier !== "frontier") return 0;
  const total = usage?.total ?? (usage?.prompt ?? 0) + (usage?.completion ?? 0);
  if (total > 0) return Math.floor(total);
  return MIN_FRONTIER_DEBIT;
}

export function newInstallLedger(now: number, includedFrontierTokens: number): CreditLedger {
  return {
    periodEnd: now + PERIOD_MS,
    includedRemaining: includedFrontierTokens,
    purchasedRemaining: 0,
  };
}

export function parseUsage(body: unknown): { prompt?: number; completion?: number; total?: number } | null {
  if (!body || typeof body !== "object") return null;
  const usage = (body as { usage?: unknown }).usage;
  if (!usage || typeof usage !== "object") return null;
  const record = usage as Record<string, unknown>;
  const prompt = typeof record.prompt_tokens === "number" ? record.prompt_tokens : undefined;
  const completion = typeof record.completion_tokens === "number" ? record.completion_tokens : undefined;
  const total = typeof record.total_tokens === "number" ? record.total_tokens : undefined;
  if (prompt === undefined && completion === undefined && total === undefined) return null;
  return { prompt, completion, total };
}

export function catalogFromEnv(env: {
  FRONTIER_UPSTREAM_MODEL?: string;
  BASIC_UPSTREAM_MODEL?: string;
  INCLUDED_FRONTIER_TOKENS?: string;
}): RouterCatalog {
  const included = Number(env.INCLUDED_FRONTIER_TOKENS);
  return {
    frontierModel: env.FRONTIER_UPSTREAM_MODEL?.trim() || "openai/gpt-4o-mini",
    basicModel: env.BASIC_UPSTREAM_MODEL?.trim() || "meta-llama/llama-3.3-70b-instruct",
    includedFrontierTokens:
      Number.isFinite(included) && included > 0 ? Math.floor(included) : DEFAULT_INCLUDED_FRONTIER_TOKENS,
  };
}
