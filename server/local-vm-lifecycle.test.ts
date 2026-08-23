import { describe, expect, it } from "vitest";

import { localVmCanResume, localVmMustRecreate } from "../shared/local-vm-lifecycle.ts";

const healthyStopped = {
  container: "stopped" as const,
  imageMatches: true,
  managed: true,
  network: "loopback" as const,
  security: "hardened" as const,
  persistence: "durable" as const,
};

describe("localVmMustRecreate", () => {
  it("leaves a missing desktop as create, not recreate", () => {
    expect(localVmMustRecreate({ ...healthyStopped, container: "missing" })).toBe(false);
  });

  it("recreates when the image, labels, or safety contract drifted", () => {
    expect(localVmMustRecreate({ ...healthyStopped, imageMatches: false })).toBe(true);
    expect(localVmMustRecreate({ ...healthyStopped, managed: false })).toBe(true);
    expect(localVmMustRecreate({ ...healthyStopped, network: "unsafe" })).toBe(true);
    expect(localVmMustRecreate({ ...healthyStopped, security: "unsafe" })).toBe(true);
    expect(localVmMustRecreate({ ...healthyStopped, persistence: "unsafe" })).toBe(true);
  });
});

describe("localVmCanResume", () => {
  it("starts a healthy stopped desktop and refuses a drifted one", () => {
    expect(localVmCanResume(healthyStopped)).toBe(true);
    expect(localVmCanResume({ ...healthyStopped, container: "running" })).toBe(false);
    expect(localVmCanResume({ ...healthyStopped, imageMatches: false })).toBe(false);
  });
});
