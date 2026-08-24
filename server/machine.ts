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
  /** Enough room for the full-size model. */
  | "comfortable"
  /** It will run, and it will be slow. Offer the small model and say so. */
  | "tight"
  /** Do not offer the local path at all. */
  | "unsupported";

export interface MachineSpec {
  totalMemoryBytes: number;
  /** null when the filesystem could not be queried — never a reason to block. */
  freeDiskBytes: number | null;
}

// 8 GB is where a 4B model plus Windows plus an Electron app stops fitting at
// all. Below the comfortable floor the small tier fits and the full one thrashes.
//
// The comfortable floor is 15 rather than 16 on purpose: an OS reserves some of
// what is installed, so a nominal 16 GB machine reports about 15.7. Testing
// against 16 put every 16 GB laptop — an extremely common machine — in the tight
// tier and quietly moved the comfortable tier's real start to 32 GB.
const TIGHT_FLOOR_BYTES = 8 * GB;
const COMFORTABLE_FLOOR_BYTES = 15 * GB;

export function tierFor(spec: MachineSpec): MachineTier {
  if (spec.totalMemoryBytes < TIGHT_FLOOR_BYTES) return "unsupported";
  if (spec.totalMemoryBytes < COMFORTABLE_FLOOR_BYTES) return "tight";
  return "comfortable";
}

/** The model to offer, or null when none should be. Ollama tags.
 *
 * Both are Apache-2.0, which is the gate that comes before benchmarks: weights
 * are not npm packages, so `pnpm check:licenses` will never see them.
 * Candidate (not first-run): `qwen3-vl:4b-instruct` is also Apache-2.0 (~3.3 GB). */
export function modelForTier(tier: MachineTier): string | null {
  if (tier === "unsupported") return null;
  // Same Apache-2.0 3B weight on both runnable tiers. The 8B class does not
  // fit a 16 GB laptop once the OS, this app, and a 32k KV cache sit on top;
  // Qwen 3 1.7B would fit the tight tier but is not the agent we ship.
  return "ibm/granite4.1:3b";
}

/** A conservative stand-in for the download, used for the disk check before a
 * tier is settled. The tight tier's model is smaller, so sizing both against the
 * larger one errs toward telling someone the truth early. */
export const APPROX_MODEL_BYTES = 2.5 * GB;

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
