// The memory policy for a local model runtime we start ourselves.
//
// Ollama's defaults are tuned for a server, and on a laptop they are hostile: it
// will keep up to THREE models resident, and hold each one for five minutes
// after the last reply. A 16 GB machine can end up sitting on several gigabytes
// of idle weights while someone reads an answer, which is the difference between
// "slow but fine" and "my computer froze".
//
// Every setting below is a server-process environment variable. That is the
// whole point, and it is the argument for launching the runtime ourselves rather
// than asking the user to install it: a runtime someone else started gives us
// its defaults and no say. Owning the process is a memory decision before it is
// a convenience one.
//
// The keep_alive REQUEST parameter would override this, but the requests are
// made by the agent CLI (hermes, qwen), not by us — so the server environment is
// the only lever we actually hold.
//
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md.

/** Where the models live. Ollama defaults to the user's home directory; putting
 * them under our data directory is what lets uninstalling the app reclaim the
 * several gigabytes, instead of stranding them somewhere nobody will find. */
export const MODELS_DIRNAME = "local-models";

export interface RuntimePolicy {
  /** Absolute path for downloaded weights. */
  modelsDir: string;
  /** Context window. Bigger costs KV cache on every resident model, and agent
   * transcripts grow, so this is a real memory lever rather than a nicety. */
  contextTokens: number;
}

/** Environment for `ollama serve`.
 *
 * Returned as plain strings because that is what a spawn takes, and kept as one
 * function so there is a single place to read what this app does to a runtime it
 * starts. */
export function runtimeEnv(policy: RuntimePolicy) {
  return {
    OLLAMA_MODELS: policy.modelsDir,
    // default is 3 — three resident models on a laptop is the single worst
    // default here
    OLLAMA_MAX_LOADED_MODELS: "1",
    // default is 5m of holding the weights after the last token
    OLLAMA_KEEP_ALIVE: "60s",
    // memory scales by NUM_PARALLEL * CONTEXT_LENGTH, and one person is using
    // this
    OLLAMA_NUM_PARALLEL: "1",
    OLLAMA_CONTEXT_LENGTH: String(policy.contextTokens),
    // roughly halves the KV cache, which is the part that grows with the
    // transcript
    OLLAMA_KV_CACHE_TYPE: "q8_0",
    OLLAMA_FLASH_ATTENTION: "1",
  } satisfies Record<string, string>;
}

/** Long enough for a real agent turn with tool results, short enough that the
 * cache does not dominate memory on a small machine. */
export const DEFAULT_CONTEXT_TOKENS = 8192;
export const TIGHT_CONTEXT_TOKENS = 4096;
