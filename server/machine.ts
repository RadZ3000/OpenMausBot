// Whether this machine can actually run a model locally, and which one.
//
// The failure worth preventing is specific: someone picks the local path, waits
// through a multi-gigabyte download, and only then finds out their laptop was
// never going to manage it. That reads as a broken product rather than a small
// machine, and it arrives as a refund rather than a bug report. So the offer is
// sized to the hardware before it is made.
//
// Memory is the binding constraint, not disk. A model has to be resident to run
// — roughly 0.6 GB per billion parameters at 4-bit, plus working space for the
// conversation — and that sits on top of the OS and this app.
//
// Deliberately RAM-only. GPU detection needs Electron's main process, and the
// harness is a separate process with no access to it. That is a real blind spot
// and it is one-sided: a machine with a dedicated GPU is scored as if it had
// none, so the tier is a floor rather than a guess. The common case for the
// people this has to work for — a business laptop with integrated graphics — has
// no VRAM anyway, which is exactly when system RAM is the number that matters.
//
// See docs/plans/2026-08-20-005-three-path-first-run-plan.md.
import { statfs } from "node:fs/promises";
import { totalmem } from "node:os";

const GB = 1024 * 1024 * 1024;

/** What the local path can honestly promise on this machine. */
export type MachineTier =
  /** Enough RAM that 8B + 32k + the Local VM is a reasonable offer. */
  | "comfortable"
  /** It will run, and it will be slow. Same weight as comfortable. */
  | "tight"
  /** Do not offer the local path at all. */
  | "unsupported";

export interface MachineSpec {
  totalMemoryBytes: number;
  /** null when the filesystem could not be queried — never a reason to block. */
  freeDiskBytes: number | null;
}

// 8 GB is where 8B + Windows + this app stops fitting at all. Below the
// comfortable floor the same weight still runs, slowly, and we say so.
//
// Comfortable is 24 GB installed: 8B weights (~6.1 GB) + 32k KV + Local VM
// (~6 GB) + Windows do not fit a 16 GB machine with headroom. Granite 8B on
// a 15.7 GB / 6 GB VRAM box left 0.6 GB RAM free with the VM up. A nominal
// 16 GB machine reports about 15.7 and is therefore tight on purpose.
const TIGHT_FLOOR_BYTES = 8 * GB;
const COMFORTABLE_FLOOR_BYTES = 24 * GB;

export function tierFor(spec: MachineSpec): MachineTier {
  if (spec.totalMemoryBytes < TIGHT_FLOOR_BYTES) return "unsupported";
  if (spec.totalMemoryBytes < COMFORTABLE_FLOOR_BYTES) return "tight";
  return "comfortable";
}

/** The model to offer, or null when none should be. Ollama tags.
 *
 * Apache-2.0, which is the gate that comes before benchmarks: weights are not
 * npm packages, so `pnpm check:licenses` will never see them. Same Thinking 8B
 * on both runnable tiers — tight is slower, not a smaller download. */
export function modelForTier(tier: MachineTier): string | null {
  if (tier === "unsupported") return null;
  return "qwen3-vl:8b";
}

/** A conservative stand-in for the download, used for the disk check before a
 * tier is settled. Both runnable tiers pull this weight. */
export const APPROX_MODEL_BYTES = 6.1 * GB;

/** Bytes the download needs, with headroom for the runtime and the unpack.
 *
 * Deliberately generous. Running out of disk halfway through several gigabytes
 * is a worse experience than being told up front that it will not fit. The extra
 * five gigabytes cover the pinned Ollama zip (~1.36 GiB) plus unpack. */
export function diskNeededBytes(modelBytes: number): number {
  // Model plus the pinned Ollama zip (~1.36 GiB) and unpack/working space.
  return modelBytes + 5 * GB;
}

export function hasRoomOnDisk(spec: MachineSpec, modelBytes: number): boolean {
  // an unknown free-space figure must not block the path; the download reports
  // its own failure well enough
  if (spec.freeDiskBytes === null) return true;
  return spec.freeDiskBytes >= diskNeededBytes(modelBytes);
}

export async function readMachine(dataDir: string): Promise<MachineSpec> {
  let freeDiskBytes: number | null = null;
  try {
    const stats = await statfs(dataDir);
    freeDiskBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    freeDiskBytes = null;
  }
  return { totalMemoryBytes: totalmem(), freeDiskBytes };
}
