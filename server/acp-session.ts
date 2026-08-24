// Idle ACP child pool — one long-lived stdio session per bot+thread.
//
// `server/drivers/acp/core.ts` is upstream-owned and still assumed a
// spawn-per-turn world (settle used to killCliTree because "the agent
// process does not exit on its own"). The pool lives here so a future
// upstream keep-alive does not collide on their filename, and so idle /
// cap / fingerprint stay out of that merge. Deletion test: inlining this
// into core.ts would park the merge cost in the upstream file forever.
//
// Identity is bot+thread (`sessionKey`), not thread alone: a room shares
// one threadId across members. Kill on Stop, rewind, failure, idle, cap,
// fingerprint miss, or dispose — not on a successful end_turn.
import { homedir } from "node:os";

import type { SendTurnInput } from "./contracts.ts";

export const ACP_SESSION_IDLE_MS = 15 * 60_000;
export const ACP_SESSION_CAP = 3;

export interface AcpSessionTimer {
  unref(): void;
}

export interface AcpSessionClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): AcpSessionTimer;
  clearTimeout(timer: AcpSessionTimer): void;
}

const realTimeouts = new WeakMap<AcpSessionTimer, ReturnType<typeof setTimeout>>();

export const defaultAcpSessionClock: AcpSessionClock = {
  now: () => Date.now(),
  setTimeout(fn, ms) {
    const native = setTimeout(fn, ms);
    native.unref?.();
    const handle: AcpSessionTimer = {
      unref() {
        native.unref?.();
      },
    };
    realTimeouts.set(handle, native);
    return handle;
  },
  clearTimeout(timer) {
    const native = realTimeouts.get(timer);
    if (native) clearTimeout(native);
  },
};

const manualTimerIds = new WeakMap<AcpSessionTimer, number>();

/** Injected clock for tests — advance() fires due timers. No sleeps. */
export function createManualAcpSessionClock(start = 0): AcpSessionClock & { advance(ms: number): void } {
  let now = start;
  let seq = 0;
  const pending = new Map<number, { at: number; fn: () => void }>();
  return {
    now: () => now,
    setTimeout(fn, ms) {
      const id = ++seq;
      const handle: AcpSessionTimer = { unref() {} };
      pending.set(id, { at: now + ms, fn });
      manualTimerIds.set(handle, id);
      return handle;
    },
    clearTimeout(timer) {
      const id = manualTimerIds.get(timer);
      if (id !== undefined) pending.delete(id);
    },
    advance(ms) {
      now += ms;
      const due = [...pending.entries()]
        .filter(([, timer]) => timer.at <= now)
        .sort((a, b) => a[1].at - b[1].at || a[0] - b[0]);
      for (const [id, timer] of due) {
        if (!pending.delete(id)) continue;
        timer.fn();
      }
    },
  };
}

export interface AcpSessionSlotTurn {
  sessionKey?: string;
  threadId: string;
}

export function acpSessionSlot(turn: AcpSessionSlotTurn): string {
  return turn.sessionKey ?? turn.threadId;
}

export function acpMcpNames(integrations: SendTurnInput["integrations"] | undefined): string[] {
  const names: string[] = [];
  if (integrations?.agents) names.push("agents");
  if (integrations?.composio) names.push("composio");
  if (integrations?.computer || integrations?.localComputer) names.push("computer");
  if (integrations?.imageGen) names.push("image");
  if (integrations?.phone) names.push("phone");
  names.sort();
  return names;
}

export interface AcpSessionFingerprintParts {
  cwd: string;
  model: string;
  mcpNames: readonly string[];
}

export function acpSessionFingerprint(parts: AcpSessionFingerprintParts): string {
  return JSON.stringify({
    cwd: parts.cwd,
    model: parts.model,
    mcp: [...parts.mcpNames].sort(),
  });
}

export function fingerprintTurn(turn: SendTurnInput, cwd: string, model: string): string {
  return acpSessionFingerprint({ cwd, model, mcpNames: acpMcpNames(turn.integrations) });
}

/** Same cwd rule the ACP driver uses (`turn.cwd ?? workspace ?? homedir()`).
 * Fingerprint uses the picker model (`turn.model`), not resolveTurnModel —
 * the harness skip-last-look check cannot see that rewrite. */
export function acpFingerprintFromTurn(turn: SendTurnInput, workspace?: string): string {
  const cwd = turn.cwd ?? workspace ?? homedir();
  return fingerprintTurn(turn, cwd, turn.model ?? "");
}

export interface AcpSessionPoolOptions<T> {
  idleMs: number;
  cap: number;
  clock: AcpSessionClock;
  stop: (handle: T) => void;
}

interface LiveEntry<T> {
  handle: T;
  fingerprint: string;
  lastUsedAt: number;
  busy: boolean;
  timer: AcpSessionTimer | null;
}

export class AcpSessionPool<T> {
  private readonly live = new Map<string, LiveEntry<T>>();
  private readonly idleMs: number;
  private readonly cap: number;
  private readonly clock: AcpSessionClock;
  private readonly stopHandle: (handle: T) => void;

  constructor(options: AcpSessionPoolOptions<T>) {
    if (!Number.isFinite(options.idleMs) || options.idleMs <= 0) {
      throw new Error("ACP session idle timeout must be positive");
    }
    if (!Number.isInteger(options.cap) || options.cap < 1) {
      throw new Error("ACP session cap must be a positive integer");
    }
    this.idleMs = options.idleMs;
    this.cap = options.cap;
    this.clock = options.clock;
    this.stopHandle = options.stop;
  }

  get size(): number {
    return this.live.size;
  }

  compatible(key: string, fingerprint: string): boolean {
    const entry = this.live.get(key);
    return Boolean(entry && !entry.busy && entry.fingerprint === fingerprint);
  }

  /** Idle matching key+fingerprint → busy. Fingerprint miss kills the leftover. */
  take(key: string, fingerprint: string): T | undefined {
    const entry = this.live.get(key);
    if (!entry) return undefined;
    if (entry.busy) throw new Error("ACP session is already in a turn");
    if (entry.fingerprint !== fingerprint) {
      this.drop(key);
      return undefined;
    }
    this.clearTimer(entry);
    entry.busy = true;
    entry.lastUsedAt = this.clock.now();
    return entry.handle;
  }

  /** New live session occupying a slot. Evicts LRU idle when at cap. */
  occupy(key: string, fingerprint: string, handle: T): void {
    if (this.live.has(key)) this.drop(key);
    while (this.live.size >= this.cap) {
      const victim = this.lruIdle();
      if (!victim) break;
      this.drop(victim);
    }
    this.live.set(key, {
      handle,
      fingerprint,
      lastUsedAt: this.clock.now(),
      busy: true,
      timer: null,
    });
  }

  /** Successful end_turn: idle + timer. */
  release(key: string): void {
    const entry = this.live.get(key);
    if (!entry) return;
    entry.busy = false;
    entry.lastUsedAt = this.clock.now();
    this.clearTimer(entry);
    entry.timer = this.clock.setTimeout(() => this.drop(key), this.idleMs);
    entry.timer.unref();
  }

  drop(key: string): void {
    const entry = this.live.get(key);
    if (!entry) return;
    this.clearTimer(entry);
    this.live.delete(key);
    this.stopHandle(entry.handle);
  }

  dropAll(): void {
    for (const key of Array.from(this.live.keys())) this.drop(key);
  }

  /** Child already died — forget without stop. */
  forget(key: string): void {
    const entry = this.live.get(key);
    if (!entry) return;
    this.clearTimer(entry);
    this.live.delete(key);
  }

  /** Forget only if `handle` is still the occupant — a later spawn at this
   *  key must not be deleted when the previous child's close arrives. */
  forgetIf(key: string, handle: T): void {
    const entry = this.live.get(key);
    if (!entry || entry.handle !== handle) return;
    this.forget(key);
  }

  private lruIdle(): string | undefined {
    let bestKey: string | undefined;
    let bestAt = Infinity;
    for (const [key, entry] of this.live) {
      if (entry.busy) continue;
      if (entry.lastUsedAt < bestAt) {
        bestAt = entry.lastUsedAt;
        bestKey = key;
      }
    }
    return bestKey;
  }

  private clearTimer(entry: LiveEntry<T>): void {
    if (!entry.timer) return;
    this.clock.clearTimeout(entry.timer);
    entry.timer = null;
  }
}
