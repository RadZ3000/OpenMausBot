import { homedir } from "node:os";
import { describe, expect, it } from "vitest";

import {
  ACP_SESSION_CAP,
  ACP_SESSION_IDLE_MS,
  AcpSessionPool,
  acpFingerprintFromTurn,
  acpMcpNames,
  acpSessionFingerprint,
  acpSessionSlot,
  createManualAcpSessionClock,
  fingerprintTurn,
} from "./acp-session.ts";

class FakeHandle {
  stopped = false;
  stop(): void {
    this.stopped = true;
  }
}

function poolOf(clock = createManualAcpSessionClock(), cap = ACP_SESSION_CAP, idleMs = ACP_SESSION_IDLE_MS) {
  return new AcpSessionPool<FakeHandle>({
    idleMs,
    cap,
    clock,
    stop: (handle) => handle.stop(),
  });
}

describe("acpSessionSlot", () => {
  it("prefers sessionKey and falls back to threadId", () => {
    expect(acpSessionSlot({ threadId: "t1" })).toBe("t1");
    expect(acpSessionSlot({ threadId: "t1", sessionKey: "bot:t1" })).toBe("bot:t1");
  });
});

describe("fingerprint", () => {
  it("sorts MCP names so insertion order does not fork the key", () => {
    const left = acpMcpNames({
      imageGen: { command: "i", args: [], env: {} },
      agents: { command: "a", args: [], env: {} },
    });
    const right = acpMcpNames({
      agents: { command: "a", args: [], env: {} },
      imageGen: { command: "i", args: [], env: {} },
    });
    expect(left).toEqual(["agents", "image"]);
    expect(right).toEqual(["agents", "image"]);
    expect(acpSessionFingerprint({ cwd: "/w", model: "m", mcpNames: left })).toBe(
      acpSessionFingerprint({ cwd: "/w", model: "m", mcpNames: right }),
    );
  });

  it("treats computer and localComputer as the same MCP name", () => {
    expect(acpMcpNames({ computer: { boxId: "b", token: "t" } })).toEqual(["computer"]);
    expect(
      acpMcpNames({ localComputer: { command: "cua", args: ["mcp"], env: {} } }),
    ).toEqual(["computer"]);
  });

  it("uses picker model and homedir when cwd/model are omitted", () => {
    expect(acpFingerprintFromTurn({ threadId: "t", text: "hi" })).toBe(
      fingerprintTurn({ threadId: "t", text: "hi" }, homedir(), ""),
    );
    expect(acpFingerprintFromTurn({ threadId: "t", text: "hi", model: "qwen", cwd: "/desk" })).toBe(
      fingerprintTurn({ threadId: "t", text: "hi", model: "qwen", cwd: "/desk" }, "/desk", "qwen"),
    );
  });
});

describe("AcpSessionPool", () => {
  it("reuses an idle matching fingerprint and serializes a busy key", () => {
    const pool = poolOf();
    const handle = new FakeHandle();
    pool.occupy("bot:t", "fp-a", handle);
    pool.release("bot:t");
    expect(pool.compatible("bot:t", "fp-a")).toBe(true);
    expect(pool.take("bot:t", "fp-a")).toBe(handle);
    expect(pool.compatible("bot:t", "fp-a")).toBe(false);
    expect(() => pool.take("bot:t", "fp-a")).toThrow(/already in a turn/);
    expect(handle.stopped).toBe(false);
  });

  it("kills a leftover on fingerprint miss", () => {
    const pool = poolOf();
    const handle = new FakeHandle();
    pool.occupy("bot:t", "fp-a", handle);
    pool.release("bot:t");
    expect(pool.take("bot:t", "fp-b")).toBeUndefined();
    expect(handle.stopped).toBe(true);
    expect(pool.size).toBe(0);
  });

  it("evicts the oldest idle child when the fourth session occupies", () => {
    const clock = createManualAcpSessionClock();
    const pool = poolOf(clock, 3);
    const handles = [new FakeHandle(), new FakeHandle(), new FakeHandle(), new FakeHandle()];
    pool.occupy("k1", "fp", handles[0]);
    pool.release("k1");
    clock.advance(1);
    pool.occupy("k2", "fp", handles[1]);
    pool.release("k2");
    clock.advance(1);
    pool.occupy("k3", "fp", handles[2]);
    pool.release("k3");
    clock.advance(1);
    pool.occupy("k4", "fp", handles[3]);
    expect(handles[0].stopped).toBe(true);
    expect(handles[1].stopped).toBe(false);
    expect(handles[2].stopped).toBe(false);
    expect(handles[3].stopped).toBe(false);
    expect(pool.size).toBe(3);
    expect(pool.compatible("k1", "fp")).toBe(false);
    pool.release("k4");
    expect(pool.compatible("k2", "fp")).toBe(true);
  });

  it("does not evict a busy child when the pool is full", () => {
    const pool = poolOf(createManualAcpSessionClock(), 2);
    const a = new FakeHandle();
    const b = new FakeHandle();
    const c = new FakeHandle();
    pool.occupy("k1", "fp", a);
    pool.occupy("k2", "fp", b);
    pool.occupy("k3", "fp", c);
    expect(a.stopped).toBe(false);
    expect(b.stopped).toBe(false);
    expect(pool.size).toBe(3);
  });

  it("kills an idle child when the clock advances past the idle window", () => {
    const clock = createManualAcpSessionClock();
    const pool = poolOf(clock, 3, ACP_SESSION_IDLE_MS);
    const handle = new FakeHandle();
    pool.occupy("bot:t", "fp", handle);
    pool.release("bot:t");
    clock.advance(ACP_SESSION_IDLE_MS - 1);
    expect(handle.stopped).toBe(false);
    clock.advance(1);
    expect(handle.stopped).toBe(true);
    expect(pool.size).toBe(0);
  });

  it("forget drops a dead child without stopping it again", () => {
    const pool = poolOf();
    const handle = new FakeHandle();
    pool.occupy("bot:t", "fp", handle);
    pool.forget("bot:t");
    expect(handle.stopped).toBe(false);
    expect(pool.size).toBe(0);
    pool.drop("bot:t");
    expect(handle.stopped).toBe(false);
  });

  it("forgetIf ignores a close from a replaced child", () => {
    const pool = poolOf();
    const first = new FakeHandle();
    const second = new FakeHandle();
    pool.occupy("bot:t", "fp", first);
    pool.occupy("bot:t", "fp", second);
    expect(first.stopped).toBe(true);
    pool.forgetIf("bot:t", first);
    expect(pool.size).toBe(1);
    pool.release("bot:t");
    expect(pool.take("bot:t", "fp")).toBe(second);
  });
});
