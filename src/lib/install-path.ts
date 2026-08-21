// Which of the three first-run paths this build offers, and which one the person
// running it picked.
//
// The wedge is that a customer should not have to do sysadmin work to get a
// working bot, and these are the three honest routes to one — they answer
// genuinely different buyers: a firm whose data cannot leave the building, a
// team that already has an API key, and someone who wants to see it work before
// thinking about either. See
// docs/plans/2026-08-20-005-three-path-first-run-plan.md.
//
// Two questions live here, and keeping them apart is the point of the module:
//
//   - which paths a BUILD offers is build configuration, resolved in
//     ./distribution from VITE_INSTALL_PATHS, so a customer build can ship one
//     arm without the others
//   - which path a PERSON picked is runtime state on this install
//
// Conflating them means a single-arm build needs the wrong half rebuilt. The
// decision below is deliberately free of browser globals and of any notion of
// whether an arm's setup *succeeded* — that is a server question (is an engine
// available?) and belongs to the caller.

/** `local` runs open weights on this machine, `byok` bills the customer's own
 * API key, `hosted` is the capped trial we pay for. */
export type InstallPath = "local" | "byok" | "hosted";

/** Every path, in the order a chooser should present them. */
export const INSTALL_PATHS: readonly InstallPath[] = ["local", "byok", "hosted"];

/** The three methods wanted from `localStorage`, named so this never reaches
 * for a browser global. */
export interface InstallPathStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Joins the other omb-* keys, which identify the app to itself and are not
// branding — see docs/identity-surface.md §2.
const CHOICE_KEY = "omb-install-path";

function asInstallPath(value: string | null): InstallPath | null {
  return INSTALL_PATHS.find((path) => path === value) ?? null;
}

/** Parse `VITE_INSTALL_PATHS` — a comma-separated list, in the order given.
 *
 * Anything unparseable falls back to offering everything, because the failure
 * this guards is a typo in a build variable silently shipping a product with no
 * way to get started at all. Narrowing what a build offers should take a
 * deliberate, correct value. */
export function parseInstallPaths(raw: string | undefined): InstallPath[] {
  const named = (raw ?? "")
    .split(",")
    .map((entry) => asInstallPath(entry.trim()))
    .filter((path): path is InstallPath => path !== null);
  const unique = [...new Set(named)];
  return unique.length > 0 ? unique : [...INSTALL_PATHS];
}

export function chosenPath(storage: InstallPathStorage): InstallPath | null {
  return asInstallPath(storage.getItem(CHOICE_KEY));
}

export function choosePath(storage: InstallPathStorage, path: InstallPath): void {
  storage.setItem(CHOICE_KEY, path);
}

/** Forget the choice so first run can be walked again. The arms convert into
 * one another — a trial ends, a key is bought — so a decision that can never be
 * revisited is a dead end rather than a default. */
export function forgetPath(storage: InstallPathStorage): void {
  storage.removeItem(CHOICE_KEY);
}

export type FirstRunStep =
  /** Nothing to ask: first run is behind us. */
  | { kind: "done" }
  /** More than one arm on offer, so the person picks. */
  | { kind: "choose"; options: InstallPath[] }
  /** Exactly one arm on offer — there is no choice to present, only setup. */
  | { kind: "setup"; path: InstallPath };

/** What first run should show, given what this build offers and what has been
 * picked before.
 *
 * A stored path that the build no longer offers is treated as unpicked rather
 * than honoured: a build reconfigured to drop an arm must not strand an install
 * on a route it can no longer take. */
export function firstRunStep(storage: InstallPathStorage, offered: InstallPath[]): FirstRunStep {
  const options = offered.length > 0 ? offered : [...INSTALL_PATHS];
  const chosen = chosenPath(storage);
  if (chosen && options.includes(chosen)) return { kind: "done" };
  if (options.length === 1) return { kind: "setup", path: options[0] };
  return { kind: "choose", options };
}
