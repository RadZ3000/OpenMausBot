import { describe, expect, it, vi } from "vitest";
import {
  ensureManagedInferenceCredentials,
  managedInferenceAccess,
  managedInferenceChildEnvironment,
  normalizeManagedInferenceBrokerUrl,
} from "./managed-inference.mjs";

const TOKEN = "a".repeat(64);

describe("managed hosted-inference desktop registration", () => {
  it("publishes only a complete broker credential", () => {
    expect(managedInferenceAccess("https://inference.example/", { inferenceBrokerToken: TOKEN })).toEqual({
      url: "https://inference.example",
      token: TOKEN,
    });
    expect(managedInferenceAccess("https://inference.example", {})).toBeNull();
    expect(managedInferenceAccess("", { inferenceBrokerToken: TOKEN })).toBeNull();
  });

  it("accepts HTTPS and loopback development brokers but rejects insecure remote URLs", async () => {
    expect(normalizeManagedInferenceBrokerUrl("https://inference.example/root/")).toBe(
      "https://inference.example/root",
    );
    expect(normalizeManagedInferenceBrokerUrl("http://127.0.0.1:8787/")).toBe("http://127.0.0.1:8787");
    expect(normalizeManagedInferenceBrokerUrl("http://localhost:8787")).toBe("http://localhost:8787");
    expect(normalizeManagedInferenceBrokerUrl("http://[::1]:8787/")).toBe("http://[::1]:8787");
    expect(normalizeManagedInferenceBrokerUrl("http://inference.example")).toBe("");
    expect(normalizeManagedInferenceBrokerUrl("https://user:secret@inference.example")).toBe("");
    expect(normalizeManagedInferenceBrokerUrl("https://inference.example?redirect=evil")).toBe("");

    const fetchImpl = vi.fn();
    const credentials = { inferenceBrokerToken: TOKEN };
    await ensureManagedInferenceCredentials({
      brokerUrl: "http://inference.example",
      credentials,
      fetchImpl,
      saveCredentials: vi.fn(),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(managedInferenceAccess("http://inference.example", credentials)).toBeNull();
    expect(
      managedInferenceChildEnvironment("http://inference.example", credentials, {
        PATH: "/usr/bin",
        OMB_INFERENCE_BROKER_URL: "http://attacker.example",
        OMB_INFERENCE_BROKER_TOKEN: "attacker-controlled",
      }),
    ).toEqual({ PATH: "/usr/bin" });
    expect(
      managedInferenceChildEnvironment("http://[::1]:8787", credentials, { PATH: "/usr/bin" }),
    ).toEqual({
      PATH: "/usr/bin",
      OMB_INFERENCE_BROKER_URL: "http://[::1]:8787",
      OMB_INFERENCE_BROKER_TOKEN: TOKEN,
    });
  });

  it("publishes the broker URL without a token so the server can say the arm exists", () => {
    expect(managedInferenceChildEnvironment("https://inference.example/", {}, { PATH: "/usr/bin" })).toEqual({
      PATH: "/usr/bin",
      OMB_INFERENCE_BROKER_URL: "https://inference.example",
    });
  });

  it("registers a new installation and persists it", async () => {
    const credentials = {};
    const saveCredentials = vi.fn(async () => {});
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({ token: TOKEN, installationId: "installation-test" }),
    }));

    await ensureManagedInferenceCredentials({
      brokerUrl: "https://inference.example",
      credentials,
      fetchImpl,
      saveCredentials,
    });

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://inference.example/v1/installations",
      expect.objectContaining({ method: "POST", redirect: "error" }),
    );
    expect(credentials).toEqual({
      inferenceBrokerToken: TOKEN,
      inferenceInstallationId: "installation-test",
    });
    expect(saveCredentials).toHaveBeenCalledWith(credentials);
  });

  it("settles a stalled optional registration without storing partial credentials", async () => {
    vi.useFakeTimers();
    try {
      const credentials = {};
      const saveCredentials = vi.fn(async () => {});
      const log = vi.fn();
      const fetchImpl = vi.fn(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            init.signal.addEventListener("abort", () => reject(init.signal.reason), { once: true });
          }),
      );
      const operation = ensureManagedInferenceCredentials({
        brokerUrl: "https://inference.example",
        credentials,
        fetchImpl,
        saveCredentials,
        log,
        registrationTimeoutMs: 25,
      });

      await vi.advanceTimersByTimeAsync(25);
      await expect(operation).resolves.toBe(credentials);
      expect(credentials).toEqual({});
      expect(saveCredentials).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith(expect.stringContaining("registration failed"));
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps a valid installation identity during a transient broker outage", async () => {
    const credentials = {
      inferenceBrokerToken: TOKEN,
      inferenceInstallationId: "installation-test",
    };
    const saveCredentials = vi.fn(async () => {});

    await ensureManagedInferenceCredentials({
      brokerUrl: "https://inference.example",
      credentials,
      fetchImpl: vi.fn(async () => {
        throw new Error("offline");
      }),
      saveCredentials,
    });

    expect(credentials).toEqual({
      inferenceBrokerToken: TOKEN,
      inferenceInstallationId: "installation-test",
    });
    expect(saveCredentials).not.toHaveBeenCalled();
  });
});
