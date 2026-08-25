import { describe, expect, it } from "vitest";

import {
  DEFAULT_INCLUDED_FRONTIER_TOKENS,
  HOSTED_MODEL_ID,
  MIN_FRONTIER_DEBIT,
  PERIOD_MS,
  assessCapability,
  catalogFromEnv,
  debitFrontier,
  frontierRemaining,
  grantPurchased,
  lastUserText,
  newInstallLedger,
  parseClassifyReply,
  parseUsage,
  rewriteModel,
  rollPeriod,
  routeReason,
  selectTier,
  tokensToDebit,
} from "./route";

const catalog = catalogFromEnv({});
const full = newInstallLedger(0, 100);
const empty = { periodEnd: PERIOD_MS, includedRemaining: 0, purchasedRemaining: 0 };

describe("capability-then-credit routing", () => {
  it("keeps easy turns on basic even with a full frontier ledger", () => {
    expect(selectTier(full, "basic")).toBe("basic");
    expect(routeReason(full, "basic")).toBe("capability");
    expect(tokensToDebit("basic", { total: 9_000 })).toBe(0);
  });

  it("uses frontier for a hard turn while any included or purchased credit remains", () => {
    expect(selectTier(full, "frontier")).toBe("frontier");
    expect(rewriteModel("frontier", catalog)).toBe(catalog.frontierModel);
    const purchased = { periodEnd: PERIOD_MS, includedRemaining: 0, purchasedRemaining: 1 };
    expect(selectTier(purchased, "frontier")).toBe("frontier");
    expect(routeReason(purchased, "frontier")).toBe("frontier");
  });

  it("downgrades a hard turn to basic when frontier credits are gone, and still answers", () => {
    expect(selectTier(empty, "frontier")).toBe("basic");
    expect(routeReason(empty, "frontier")).toBe("credits");
    expect(rewriteModel("basic", catalog)).toBe(catalog.basicModel);
    expect(tokensToDebit("basic", { total: 9_000 })).toBe(0);
  });

  it("never returns frontier when capability wants basic", () => {
    expect(selectTier(full, "basic")).not.toBe("frontier");
    expect(routeReason(empty, "basic")).toBe("capability");
  });

  it("ignores whatever model the client asked for", () => {
    expect(HOSTED_MODEL_ID).toBe("openmausbot/auto");
    expect(rewriteModel("frontier", catalog)).not.toBe("gpt-4o");
  });
});

describe("assessCapability heuristics", () => {
  it("sends short chitchat to basic without classifying", () => {
    expect(assessCapability([{ role: "user", content: "hi" }]).look).toBe("basic");
    expect(assessCapability([{ role: "user", content: "thanks!" }]).look).toBe("basic");
  });

  it("sends fenced code, long prompts, and coding verbs to frontier without classifying", () => {
    expect(assessCapability([{ role: "user", content: "```ts\nconst x = 1;\n```" }]).look).toBe("frontier");
    expect(assessCapability([{ role: "user", content: "Implement a binary search in TypeScript with tests." }]).look).toBe(
      "frontier",
    );
    expect(assessCapability([{ role: "user", content: "x".repeat(400) }]).look).toBe("frontier");
  });

  it("asks the classifier for the middle band, including an empty turn", () => {
    expect(assessCapability([{ role: "user", content: "What is a good name for a houseplant?" }]).look).toBe("classify");
    expect(assessCapability([]).look).toBe("classify");
    expect(lastUserText([{ role: "assistant", content: "hi" }, { role: "user", content: "  later  " }])).toBe("later");
  });

  it("parses a strict classify reply and rejects anything else", () => {
    expect(parseClassifyReply({ choices: [{ message: { content: "basic" } }] })).toBe("basic");
    expect(parseClassifyReply({ choices: [{ message: { content: "Frontier." } }] })).toBe("frontier");
    expect(parseClassifyReply({ choices: [{ message: { content: "maybe" } }] })).toBeNull();
    expect(parseClassifyReply(null)).toBeNull();
  });
});

describe("credit ledger", () => {
  it("spends included credits before purchased, and keeps purchased across a month", () => {
    const start = { periodEnd: 10, includedRemaining: 40, purchasedRemaining: 30 };
    const after = debitFrontier(start, 50);
    expect(after.includedRemaining).toBe(0);
    expect(after.purchasedRemaining).toBe(20);
    const rolled = rollPeriod(after, 10, 100);
    expect(rolled.includedRemaining).toBe(100);
    expect(rolled.purchasedRemaining).toBe(20);
    expect(frontierRemaining(rolled)).toBe(120);
  });

  it("does not reset included mid-period", () => {
    const ledger = { periodEnd: 100, includedRemaining: 7, purchasedRemaining: 0 };
    expect(rollPeriod(ledger, 99, 250_000)).toEqual(ledger);
  });

  it("grants add to purchased, not the included allotment", () => {
    const ledger = newInstallLedger(0, 10);
    expect(grantPurchased(ledger, 5_000).purchasedRemaining).toBe(5_000);
    expect(grantPurchased(ledger, 5_000).includedRemaining).toBe(10);
  });

  it("debits a floor when frontier usage is missing so a silent stream still counts", () => {
    expect(tokensToDebit("frontier", null)).toBe(MIN_FRONTIER_DEBIT);
    expect(tokensToDebit("frontier", { total: 12 })).toBe(12);
    expect(parseUsage({ usage: { prompt_tokens: 3, completion_tokens: 4, total_tokens: 7 } })).toEqual({
      prompt: 3,
      completion: 4,
      total: 7,
    });
  });

  it("reads catalog and included allotment from env with safe defaults", () => {
    expect(catalogFromEnv({}).includedFrontierTokens).toBe(DEFAULT_INCLUDED_FRONTIER_TOKENS);
    expect(catalogFromEnv({ INCLUDED_FRONTIER_TOKENS: "1000" }).includedFrontierTokens).toBe(1000);
    expect(catalogFromEnv({ INCLUDED_FRONTIER_TOKENS: "-1" }).includedFrontierTokens).toBe(
      DEFAULT_INCLUDED_FRONTIER_TOKENS,
    );
  });
});
