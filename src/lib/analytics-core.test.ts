import { describe, expect, it } from "vitest";

import { createAnalytics, type AnalyticsClient, type AnalyticsStorage } from "./analytics-core";

/** Records what would have gone to the wire. The point of most of the suite
 * below is that this stays empty. */
function recordingClient() {
  const calls: string[] = [];
  const client: AnalyticsClient = {
    init: () => calls.push("init"),
    capture: (event) => calls.push(`capture:${event}`),
    identify: (id) => calls.push(`identify:${id}`),
    optOut: () => calls.push("optOut"),
    reset: () => calls.push("reset"),
  };
  return { calls, client };
}

function memoryStorage(): AnalyticsStorage {
  const entries = new Map<string, string>();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => void entries.set(key, value),
  };
}

describe("with no destination configured", () => {
  // this is the shipped default, and the reason the suite exists: a fork that
  // inherits someone else's key reports its users to them
  it("is not configured, not enabled, and initialises nothing", () => {
    const { calls, client } = recordingClient();
    const analytics = createAnalytics(client, memoryStorage(), "", "https://example.test", "desktop");
    expect(analytics.configured()).toBe(false);
    expect(analytics.enabled()).toBe(false);
    analytics.init();
    expect(calls).toEqual([]);
  });

  it("stays silent even after consent is granted", () => {
    const { calls, client } = recordingClient();
    const analytics = createAnalytics(client, memoryStorage(), "   ", "https://example.test", "desktop");
    analytics.setConsent(true);
    analytics.init();
    analytics.track("message_sent", { driver: "codex" });
    analytics.identifyEmail("someone@example.test");
    expect(analytics.enabled()).toBe(false);
    expect(calls).toEqual([]);
  });
});

describe("with a destination configured", () => {
  it("waits for consent before sending anything", () => {
    const { calls, client } = recordingClient();
    const analytics = createAnalytics(client, memoryStorage(), "phc_test", "https://example.test", "desktop");
    expect(analytics.configured()).toBe(true);
    expect(analytics.consent()).toBeNull();
    expect(analytics.enabled()).toBe(false);
    analytics.init();
    analytics.track("message_sent");
    analytics.identifyEmail("someone@example.test");
    expect(calls).toEqual([]);
  });

  it("starts sending once consent is granted", () => {
    const { calls, client } = recordingClient();
    const analytics = createAnalytics(client, memoryStorage(), "phc_test", "https://example.test", "desktop");
    analytics.setConsent(true);
    expect(analytics.enabled()).toBe(true);
    expect(calls).toEqual(["init", "capture:app_first_open", "capture:app_opened"]);
    analytics.track("message_sent");
    expect(calls).toContain("capture:message_sent");
  });

  it("marks the install only on the first run against shared storage", () => {
    const storage = memoryStorage();
    const first = recordingClient();
    createAnalytics(first.client, storage, "phc_test", "https://example.test", "desktop").setConsent(true);
    expect(first.calls).toContain("capture:app_first_open");

    const second = recordingClient();
    createAnalytics(second.client, storage, "phc_test", "https://example.test", "desktop").init();
    expect(second.calls).not.toContain("capture:app_first_open");
    expect(second.calls).toContain("capture:app_opened");
  });

  it("stops sending and drops the identity when consent is withdrawn", () => {
    const { calls, client } = recordingClient();
    const analytics = createAnalytics(client, memoryStorage(), "phc_test", "https://example.test", "desktop");
    analytics.setConsent(true);
    calls.length = 0;
    analytics.setConsent(false);
    expect(calls).toEqual(["optOut", "reset"]);
    expect(analytics.enabled()).toBe(false);
    analytics.track("message_sent");
    analytics.identifyEmail("someone@example.test");
    expect(calls).toEqual(["optOut", "reset"]);
  });

  it("remembers a refusal across reloads", () => {
    const storage = memoryStorage();
    createAnalytics(recordingClient().client, storage, "phc_test", "https://example.test", "desktop").setConsent(
      false,
    );

    const reloaded = recordingClient();
    const analytics = createAnalytics(reloaded.client, storage, "phc_test", "https://example.test", "desktop");
    expect(analytics.consent()).toBe(false);
    analytics.init();
    expect(reloaded.calls).toEqual([]);
  });

  it("does not re-initialise a session that is already running", () => {
    const { calls, client } = recordingClient();
    const analytics = createAnalytics(client, memoryStorage(), "phc_test", "https://example.test", "desktop");
    analytics.setConsent(true);
    analytics.init();
    analytics.init();
    expect(calls.filter((call) => call === "init")).toHaveLength(1);
  });
});
