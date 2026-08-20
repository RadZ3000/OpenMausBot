// Native (un-normalized) protocol tee — the debugging trick from upstream's
// EventNdjsonLogger and agentcal's onRaw: every provider-native message is
// written verbatim next to the canonical stream, so protocol drift can be
// diagnosed by diffing the two.
import { appendFileSync } from "node:fs";
import { join } from "node:path";

import { NATIVE_DIR } from "../config.ts";
import { redactSecrets } from "../redact.ts";

/** Long enough for any protocol string worth diffing, short enough that an
 * attached image cannot turn this log into the biggest file in the profile. */
const MAX_LOGGED_STRING = 4096;

/** Verbatim, except for payloads that are bytes rather than protocol. An
 * inlined image is megabytes of base64 that says nothing about protocol
 * drift, and a turn that carries a few of them would otherwise write more to
 * this log than to the transcript. The shape is preserved so a diff still
 * lines up; only the middle of the value goes. */
function elideBulk(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > MAX_LOGGED_STRING
      ? `${value.slice(0, 64)}…«${value.length} chars elided»`
      : value;
  }
  if (Array.isArray(value)) return value.map(elideBulk);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, elideBulk(inner)]));
  }
  return value;
}

export function appendNative(threadId: string, entry: { dir: "in" | "out"; source: string; msg: unknown }) {
  try {
    // The session-setup messages carry the credentials the agent is handed —
    // the box and comms tokens ride inside session/new's mcpServers env, and
    // an MCP header can carry a Composio key. These files are ordinary
    // 0644 files people paste into bug reports, so values are masked while
    // the shape stays intact.
    appendFileSync(
      join(NATIVE_DIR, `${threadId}.ndjson`),
      JSON.stringify({ at: new Date().toISOString(), ...entry, msg: elideBulk(redactSecrets(entry.msg)) }) + "\n",
      { mode: 0o600 },
    );
  } catch {
    /* never let logging break a run */
  }
}
