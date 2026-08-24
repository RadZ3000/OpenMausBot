import { describe, expect, it } from "vitest";

import {
  deleteModel,
  hasModel,
  ndjsonLines,
  parsePullLine,
  pullFraction,
  pullModel,
  RECOMMENDED_MODEL,
  runtimeUp,
} from "./local-model.ts";

function fakeFetch(respond: () => Promise<Response>): typeof fetch {
  // SAFETY: the functions under test call fetch one way only — with a URL, for
  // a Response — so a plain responder satisfies every use they make of it, even
  // though it does not implement fetch's full declared surface.
  return respond as typeof fetch;
}

function streaming(chunks: string[], status = 200): typeof fetch {
  return fakeFetch(async () => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
        controller.close();
      },
    });
    return new Response(body, { status });
  });
}

async function collect(model = RECOMMENDED_MODEL, fetchImpl: typeof fetch) {
  const events = [];
  for await (const event of pullModel(model, fetchImpl, "http://runtime.test")) events.push(event);
  return events;
}

describe("parsePullLine", () => {
  it("reads a progress line", () => {
    expect(parsePullLine('{"status":"pulling","total":100,"completed":25}')).toEqual({
      status: "pulling",
      total: 100,
      completed: 25,
    });
  });

  it("ignores blank lines and whitespace", () => {
    expect(parsePullLine("")).toBeNull();
    expect(parsePullLine("   \r")).toBeNull();
  });

  // A malformed line mid-download must not abort a multi-gigabyte transfer that
  // is otherwise fine.
  it("ignores a line that is not JSON", () => {
    expect(parsePullLine("<html>502</html>")).toBeNull();
  });

  it("ignores JSON of the wrong shape", () => {
    expect(parsePullLine('{"status":42}')).toBeNull();
  });

  it("keeps an error line, which is how a real failure arrives", () => {
    expect(parsePullLine('{"error":"model not found"}')).toEqual({ error: "model not found" });
  });
});

describe("ndjsonLines", () => {
  it("holds back a partial line for the next chunk", () => {
    expect(ndjsonLines('{"a":1}\n{"b":2}\n{"c":')).toEqual({
      lines: ['{"a":1}', '{"b":2}'],
      rest: '{"c":',
    });
  });

  it("treats a chunk with no newline as entirely leftover", () => {
    expect(ndjsonLines('{"a"')).toEqual({ lines: [], rest: '{"a"' });
  });
});

describe("pullFraction", () => {
  it("is null before a size is known", () => {
    expect(pullFraction({ status: "pulling manifest" })).toBeNull();
    expect(pullFraction({ status: "x", total: 0, completed: 0 })).toBeNull();
  });

  it("is the share of bytes received", () => {
    expect(pullFraction({ total: 200, completed: 50 })).toBe(0.25);
  });

  // Ollama can report completed > total on the last line of a layer.
  it("clamps an overshoot rather than reporting more than done", () => {
    expect(pullFraction({ total: 100, completed: 140 })).toBe(1);
  });
});

describe("hasModel", () => {
  it("finds the model under whichever Ollama host id survived dedup", () => {
    expect(hasModel(["ollama::qwen3-vl:8b"])).toBe(true);
    expect(hasModel(["local_ollama::qwen3-vl:8b"])).toBe(true);
  });

  it("is false when only other models are pulled", () => {
    expect(hasModel(["ollama::llama3.2:latest", "lmstudio::phi-4"])).toBe(false);
    expect(hasModel(["ollama::ibm/granite4.1:3b"])).toBe(false);
    expect(hasModel(["ollama::qwen3-vl:4b"])).toBe(false);
    expect(hasModel(["ollama::qwen3-vl:4b-instruct"])).toBe(false);
  });

  // ":8b" and ":8b-instruct" are different downloads; a suffix match must not
  // treat one as the other.
  it("does not match a longer tag that merely starts the same", () => {
    expect(hasModel(["ollama::qwen3-vl:8b-instruct"])).toBe(false);
  });
});

describe("runtimeUp", () => {
  it("is true when the runtime answers", async () => {
    const ok = fakeFetch(async () => new Response("{}", { status: 200 }));
    expect(await runtimeUp(ok, "http://runtime.test")).toBe(true);
  });

  it("is false when nothing is listening", async () => {
    const refused = fakeFetch(async () => {
      throw new Error("ECONNREFUSED");
    });
    expect(await runtimeUp(refused, "http://runtime.test")).toBe(false);
  });

  it("is false when the runtime answers with an error", async () => {
    const bad = fakeFetch(async () => new Response("nope", { status: 503 }));
    expect(await runtimeUp(bad, "http://runtime.test")).toBe(false);
  });
});

describe("deleteModel", () => {
  it("asks the runtime to remove the model", async () => {
    const seen: Array<{ url: string; method: string | undefined; body: string }> = [];
    const record = fakeFetch(async () => new Response("", { status: 200 }));
    const spy: typeof fetch = async (url, init) => {
      seen.push({ url: String(url), method: init?.method, body: String(init?.body) });
      return record(url, init);
    };
    await deleteModel("qwen3:1.7b", spy, "http://runtime.test");
    expect(seen).toEqual([
      {
        url: "http://runtime.test/api/delete",
        method: "DELETE",
        body: JSON.stringify({ model: "qwen3:1.7b" }),
      },
    ]);
  });

  // Already gone is the state the caller wanted, so it is not a failure.
  it("treats a missing model as success", async () => {
    const gone = fakeFetch(async () => new Response("", { status: 404 }));
    await expect(deleteModel("qwen3:1.7b", gone, "http://runtime.test")).resolves.toBeUndefined();
  });

  it("reports a runtime that refuses", async () => {
    const refused = fakeFetch(async () => new Response("", { status: 500 }));
    await expect(deleteModel("qwen3:1.7b", refused, "http://runtime.test")).rejects.toThrow("HTTP 500");
  });
});

describe("pullModel", () => {
  it("yields every progress line", async () => {
    const events = await collect(
      RECOMMENDED_MODEL,
      streaming(['{"status":"pulling manifest"}\n', '{"status":"downloading","total":100,"completed":50}\n']),
    );
    expect(events).toEqual([
      { status: "pulling manifest", fraction: null, completed: null, total: null },
      { status: "downloading", fraction: 0.5, completed: 50, total: 100 },
    ]);
  });

  // The failure this guards: a chunk boundary inside a JSON object silently
  // dropping progress, or worse, dropping the final line.
  it("reassembles a line split across chunks", async () => {
    const events = await collect(RECOMMENDED_MODEL, streaming(['{"status":"down', 'loading","total":10,"completed":10}\n']));
    expect(events).toEqual([{ status: "downloading", fraction: 1, completed: 10, total: 10 }]);
  });

  it("yields a final line that arrives with no trailing newline", async () => {
    const events = await collect(RECOMMENDED_MODEL, streaming(['{"status":"downloading"}\n', '{"status":"success"}']));
    expect(events.at(-1)?.status).toBe("success");
  });

  it("throws when the runtime reports an error mid-stream", async () => {
    await expect(collect(RECOMMENDED_MODEL, streaming(['{"status":"pulling"}\n', '{"error":"model not found"}\n']))).rejects.toThrow(
      "model not found",
    );
  });

  it("throws on an error line that closes the stream without a newline", async () => {
    await expect(collect(RECOMMENDED_MODEL, streaming(['{"error":"disk full"}']))).rejects.toThrow("disk full");
  });

  it("throws when the runtime refuses the request", async () => {
    await expect(collect(RECOMMENDED_MODEL, streaming([], 500))).rejects.toThrow("HTTP 500");
  });
});
