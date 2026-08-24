// Download an open-weights model so a first run can produce a working bot with
// nothing bought and nothing signed into.
//
// Four things have to be true before a local bot answers: a runtime is running,
// a model is pulled into it, a `custom`-access agent CLI is installed, and the
// bot points at `host::model`. Only the second is both slow and fully
// automatable, so it is the one this file owns. The probe half already exists
// upstream in ./drivers/local-inject.ts and is reused rather than rebuilt.
//
// Ollama's /api/pull streams NDJSON progress — {status, total, completed} per
// line — so the byte-level progress the container pull never had is available
// here for free. Nothing else in this repo calls it.
//
// The route streams these lines straight back to the caller rather than
// broadcasting them: a first-run download is nobody else's business, and
// keeping it in the response body means no new SSE kind and no change to the
// client store.
//
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md.
import { z } from "zod";

/** Apache-2.0 Qwen3-VL Thinking 8B — Path A first-run (Ollama `qwen3-vl:8b`,
 * digest prefix `901cae732162`, ~6.1 GB Q4_K_M, 32k). Instruct 8B
 * (`qwen3-vl:8b-instruct`, `0533d74300e4`), 4B, and Granite are not
 * first-run. See docs/plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md. */
export const RECOMMENDED_MODEL = "qwen3-vl:8b";

/** The `/v1` base in LOCAL_HOSTS is the OpenAI-compatible surface; pull lives on
 * Ollama's native API at the origin. */
export const OLLAMA_ORIGIN = "http://127.0.0.1:11434";

const pullLineSchema = z.object({
  status: z.string().optional(),
  digest: z.string().optional(),
  total: z.number().optional(),
  completed: z.number().optional(),
  error: z.string().optional(),
});

export type PullLine = z.infer<typeof pullLineSchema>;

/** One NDJSON line from Ollama, or null for a blank or unparseable one.
 *
 * Tolerant on purpose: a malformed line mid-download should not abort a
 * multi-gigabyte transfer that is otherwise fine. A real failure arrives as a
 * line carrying `error`, or as the response never completing. */
export function parsePullLine(line: string): PullLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = pullLineSchema.safeParse(JSON.parse(trimmed));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Split a buffer into whole lines plus whatever is left over.
 *
 * The leftover matters: a chunk boundary lands in the middle of a JSON object
 * often enough that treating each chunk as a line drops progress and, worse,
 * would drop the final line carrying `error`. */
export function ndjsonLines(buffer: string) {
  const parts = buffer.split("\n");
  const rest = parts.pop() ?? "";
  return { lines: parts, rest };
}

/** Download progress as a fraction, or null while the size is still unknown.
 *
 * Ollama reports several phases before any bytes move ("pulling manifest") and
 * `completed` can exceed `total` on the final line of a layer, so this clamps
 * rather than trusting the arithmetic. */
export function pullFraction(line: PullLine): number | null {
  if (!line.total || line.total <= 0 || line.completed === undefined) return null;
  return Math.min(1, Math.max(0, line.completed / line.total));
}

/** Whether a runtime is answering at all.
 *
 * Distinct from "it has models": probeLocalInjects() returns no rows both for a
 * runtime that is down and for one that is running and empty, and those need
 * different advice. Same 1200 ms budget the inject probe uses. */
export async function runtimeUp(fetchImpl: typeof fetch = fetch, origin: string = OLLAMA_ORIGIN): Promise<boolean> {
  try {
    const response = await fetchImpl(`${origin}/api/tags`, { signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

/** Whether the model is already pulled, given the inject ids from the probe.
 *
 * Matches on the suffix because the host prefix depends on which of the two
 * Ollama entries in LOCAL_HOSTS survived deduplication by base URL. */
export function hasModel(injectedIds: string[], model: string = RECOMMENDED_MODEL): boolean {
  return injectedIds.some((id) => id.endsWith(`::${model}`));
}

/** Remove a model, freeing whatever is not shared with another one.
 *
 * Ollama stores layers by content hash and shares them between models, so this
 * frees only what nothing else references — which is why nothing here reports a
 * number of bytes reclaimed. Deletion is immediate and has no undo, so the
 * confirmation belongs upstream of this call, in the UI. */
export async function deleteModel(
  model: string,
  fetchImpl: typeof fetch = fetch,
  origin: string = OLLAMA_ORIGIN,
): Promise<void> {
  const response = await fetchImpl(`${origin}/api/delete`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model }),
  });
  // 404 means it is already gone, which is the state the caller wanted
  if (!response.ok && response.status !== 404) {
    throw new Error(`the local runtime would not remove the model (HTTP ${response.status})`);
  }
}

export interface PullEvent {
  status: string;
  fraction: number | null;
  completed: number | null;
  total: number | null;
}

export function toPullEvent(line: PullLine): PullEvent {
  return {
    status: line.status ?? "",
    fraction: pullFraction(line),
    completed: line.completed ?? null,
    total: line.total ?? null,
  };
}

/** Ask Ollama to pull a model, yielding progress as it arrives.
 *
 * `fetchImpl` and `origin` are injectable for the same reason local-inject
 * injects them: this has to be exercisable without a runtime on the machine. */
export async function* pullModel(
  model: string,
  fetchImpl: typeof fetch = fetch,
  origin: string = OLLAMA_ORIGIN,
): AsyncGenerator<PullEvent> {
  const response = await fetchImpl(`${origin}/api/pull`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: true }),
  });
  if (!response.ok) throw new Error(`the local runtime refused the download (HTTP ${response.status})`);
  if (!response.body) throw new Error("the local runtime sent no download progress");

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const { lines, rest } = ndjsonLines(buffer);
      buffer = rest;
      for (const line of lines) {
        const parsed = parsePullLine(line);
        if (!parsed) continue;
        if (parsed.error) throw new Error(parsed.error);
        yield toPullEvent(parsed);
      }
    }
    // the last line usually arrives without a trailing newline
    const final = parsePullLine(buffer);
    if (final?.error) throw new Error(final.error);
    if (final) yield toPullEvent(final);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
