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
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md and
// docs/plans/2026-08-24-005-path-a-qwen3vl-8b-thinking-plan.md.
import { join } from "node:path";

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
  /** Windows without NVIDIA: Ollama's Vulkan path crashed llama-server
   * (`0xc0000409`). Omit on NVIDIA so CUDA stays the default. */
  disableVulkan?: boolean;
}

/** Environment for `ollama serve`.
 *
 * Returned as plain strings because that is what a spawn takes, and kept as one
 * function so there is a single place to read what this app does to a runtime it
 * starts. Vulkan keys are omitted unless asked — setting VULKAN=1 would force
 * Vulkan over CUDA on an NVIDIA box. */
export function runtimeEnv(policy: RuntimePolicy) {
  const env = {
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
  };
  if (!policy.disableVulkan) return env;
  return {
    ...env,
    OLLAMA_VULKAN: "0",
    GGML_VK_VISIBLE_DEVICES: "-1",
  };
}

/** Windows without `nvcuda.dll` must not use Ollama Vulkan. POSIX keeps the
 * current default. `exists` is injected so tests never touch the real DLL. */
export function shouldDisableOllamaVulkan(opts: {
  platform: NodeJS.Platform;
  systemRoot: string;
  exists: (path: string) => boolean;
}): boolean {
  if (opts.platform !== "win32") return false;
  return !opts.exists(join(opts.systemRoot, "System32", "nvcuda.dll"));
}

/** Path A first-run is Thinking 8B at 32k on both RAM tiers. */
export const DEFAULT_CONTEXT_TOKENS = 32768;
export const TIGHT_CONTEXT_TOKENS = 32768;
