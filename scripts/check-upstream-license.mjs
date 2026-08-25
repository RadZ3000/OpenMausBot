// Fails when milind-soni/OpenMausBot is no longer under terms we can sell.
//
// Apache-2.0 already in this tree stays Apache-2.0. New upstream commits are a
// new deal. The dangerous step is `git merge` / cherry-pick / rebase of
// `upstream`, including when the user said "fetch and merge". Fetch stays
// vanilla — that is how we *see* LICENSE move. This script is the merge gate.
//
//   pnpm check:upstream-license           checks upstream/main
//   pnpm check:upstream-license --ref REV checks that revision
//
// A red check is not a suggestion. Stop, paste the alert, wait for a new
// message that names the detected license. The original merge order is not
// acknowledgment. Default after acknowledgment is freeze, not merge.
//
// SPDX reuse permitted() from check-licenses.mjs (the npm-tree gate). Extra
// terms that keep an Apache SPDX (Commons Clause, BSL, …) are a body scan of
// LICENSE / NOTICE. Dual "Apache-2.0 OR GPL-3.0" still passes — we elect Apache
// and do not treat the other text as a tripwire.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

import { permitted } from "./check-licenses.mjs";

export const DEFAULT_REF = "upstream/main";

const RESTRICTIONS = [
  { name: "AGPL", pattern: /GNU Affero General Public/i },
  { name: "AGPL", pattern: /\bAGPL\b/ },
  { name: "GPL", pattern: /GNU GENERAL PUBLIC LICENSE/i },
  { name: "SSPL", pattern: /Server Side Public License/i },
  { name: "SSPL", pattern: /\bSSPL\b/ },
  { name: "Commons Clause", pattern: /Commons Clause/i },
  { name: "Business Source", pattern: /Business Source License/i },
  { name: "Elastic License", pattern: /Elastic License/i },
  { name: "PolyForm Noncommercial", pattern: /PolyForm (?:Noncommercial|Shield)/i },
  { name: "CC NonCommercial", pattern: /Creative Commons Attribution-NonCommercial/i },
];

/**
 * @typedef {{
 *   ok: boolean,
 *   spdx: string | null,
 *   reasons: string[],
 *   notes: string[],
 *   restrictions: string[],
 * }} Assessment
 *
 * @typedef {{ sha: string, spdx: string | null, licenseText: string, noticeText: string }} LicenseCommit
 *
 * @typedef {{ ok: true, ref: string } | { ok: false, error: string }} ParsedRef
 */

/** Unique restriction names in RESTRICTIONS order. */
export function restrictionHits(text) {
  const names = [];
  const seen = new Set();
  for (const { name, pattern } of RESTRICTIONS) {
    if (!pattern.test(text)) continue;
    if (seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names;
}

/** @param {string} spdx */
export function namesApache(spdx) {
  return /(^|[\s(])Apache-2\.0([\s)]|$)/.test(spdx);
}

function uniqueNames(names) {
  const seen = new Set();
  const out = [];
  for (const name of names) {
    if (seen.has(name)) continue;
    seen.add(name);
    out.push(name);
  }
  return out;
}

/** @param {string} spdx */
export function restrictionNamesFromSpdx(spdx) {
  const names = [];
  if (/AGPL/i.test(spdx)) names.push("AGPL");
  else if (/LGPL/i.test(spdx)) names.push("LGPL");
  else if (/GPL/i.test(spdx)) names.push("GPL");
  if (/SSPL/i.test(spdx)) names.push("SSPL");
  if (/BUSL/i.test(spdx) || /Business Source/i.test(spdx)) names.push("Business Source");
  if (/Commons Clause/i.test(spdx)) names.push("Commons Clause");
  return names;
}

function electsPermissiveViaOr(spdx) {
  return /\sOR\s/i.test(spdx) && permitted(spdx);
}

/**
 * @param {{ spdx: string | null, licenseText: string, noticeText: string }} input
 * @returns {Assessment}
 */
export function assessUpstreamLicense({ spdx, licenseText, noticeText }) {
  const reasons = [];
  const notes = [];
  /** @type {string[]} */
  let restrictions = [];

  if (!spdx || !spdx.trim()) {
    return {
      ok: false,
      spdx: spdx,
      reasons: ["package.json has no license field"],
      notes,
      restrictions: [],
    };
  }

  const trimmed = spdx.trim();
  if (!permitted(trimmed)) {
    restrictions = restrictionNamesFromSpdx(trimmed);
    reasons.push(`package.json license ${trimmed} is not a permissive SPDX we can sell under`);
    return { ok: false, spdx: trimmed, reasons, notes, restrictions };
  }

  if (!licenseText.trim()) {
    return {
      ok: false,
      spdx: trimmed,
      reasons: ["LICENSE is missing or empty"],
      notes,
      restrictions: [],
    };
  }

  if (!electsPermissiveViaOr(trimmed)) {
    restrictions = uniqueNames([
      ...restrictionHits(licenseText),
      ...restrictionHits(noticeText),
    ]);
    if (restrictions.length > 0) {
      reasons.push(
        `LICENSE/NOTICE add restrictive terms while SPDX stays ${trimmed}: ${restrictions.join(", ")}`,
      );
      return { ok: false, spdx: trimmed, reasons, notes, restrictions };
    }
  }

  if (!namesApache(trimmed)) {
    notes.push(
      `upstream SPDX is ${trimmed} (still permissive; Apache notices may no longer apply)`,
    );
  }

  return { ok: true, spdx: trimmed, reasons, notes, restrictions: [] };
}

/** @param {string} text */
export function spdxFromPackageJson(text) {
  let pkg;
  try {
    pkg = JSON.parse(text);
  } catch {
    return null;
  }
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) {
    return pkg.licenses.map((entry) => entry.type ?? entry).join(" OR ");
  }
  if (pkg.license == null || pkg.license === "") return null;
  if (Array.isArray(pkg.license)) {
    return pkg.license.map((entry) => entry.type ?? entry).join(" OR ");
  }
  return pkg.license;
}

/**
 * Newest-first. First commit whose assessment passes is the freeze point.
 * @param {LicenseCommit[]} commits
 * @returns {{ sha: string, spdx: string | null } | null}
 */
export function findLastCleanCommit(commits) {
  for (const commit of commits) {
    const assessment = assessUpstreamLicense({
      spdx: commit.spdx,
      licenseText: commit.licenseText,
      noticeText: commit.noticeText,
    });
    if (assessment.ok) return { sha: commit.sha, spdx: commit.spdx };
  }
  return null;
}

/** @param {string[]} args argv after the script path */
export function parseRefFlag(args) {
  let ref = DEFAULT_REF;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--ref") {
      const value = args[i + 1];
      if (!value || value.startsWith("-")) {
        return { ok: false, error: "--ref needs a git revision (not another flag)" };
      }
      ref = value;
      i += 1;
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, error: `unknown flag ${arg}` };
    }
    return { ok: false, error: `unexpected argument ${arg}` };
  }
  return { ok: true, ref };
}

/** @param {string} ref */
export function refNeedsUpstreamRemote(ref) {
  return ref === DEFAULT_REF || ref.startsWith("upstream/");
}

/**
 * @param {{
 *   ref: string,
 *   sha: string,
 *   lastClean: { sha: string, spdx: string | null } | null,
 *   assessment: Assessment,
 * }} input
 */
export function formatUpstreamLicenseAlert({ ref, sha, lastClean, assessment }) {
  const named =
    assessment.restrictions[0] ?? assessment.spdx ?? "the new license";
  const lastCleanLine = lastClean
    ? `${lastClean.sha} (${lastClean.spdx ?? "permissive"})`
    : "unknown (no passing commit in LICENSE / package.json history)";
  const freezeTarget = lastClean ? lastClean.sha : "the last SHA that still passed";
  return [
    "UPSTREAM LICENSE GATE FAILED",
    "",
    `Ref:          ${ref}`,
    `SHA:          ${sha}`,
    `SPDX:         ${assessment.spdx ?? "(none)"}`,
    `Restrictions: ${assessment.restrictions.length > 0 ? assessment.restrictions.join(", ") : "(see reasons)"}`,
    "",
    ...assessment.reasons.map((reason) => `Reason:       ${reason}`),
    "",
    `Last clean SHA: ${lastCleanLine}`,
    "",
    "Do not merge, cherry-pick, or rebase this ref into this fork.",
    "",
    `"Fetch and merge" / "catch upstream" is NOT acknowledgment of this change.`,
    `"ok" / "continue" / "do it" / "proceed" / "lgtm" do not count.`,
    "",
    "Reply with one of:",
    `  1. I acknowledge ${named}. Freeze at ${freezeTarget}.`,
    `  2. I acknowledge ${named}. Merge anyway despite ${named}.`,
    "",
    "A bare \"I acknowledge\" is not a merge order. Default after acknowledgment is freeze.",
    "Looking at their tree for ideas is fine; copying those commits is not.",
  ].join("\n");
}

function git(args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function gitOrNull(args) {
  try {
    return git(args);
  } catch {
    return null;
  }
}

function showAt(ref, path) {
  return gitOrNull(["show", `${ref}:${path}`]);
}

function missingUpstreamMessage() {
  return [
    "No git remote named upstream (or it does not resolve). Add it and fetch:",
    "",
    "  git remote add upstream https://github.com/milind-soni/OpenMausBot.git",
    "  git remote set-url --push upstream DISABLED",
    "  git fetch upstream",
    "",
    "Then rerun `pnpm check:upstream-license`. Do not silently check HEAD.",
    "Fetch is how we see a license change; it is not the merge.",
  ].join("\n");
}

/** @param {string} ref */
function loadCommitsNewestFirst(ref) {
  const log = gitOrNull(["log", "--format=%H", ref, "--", "LICENSE", "package.json", "NOTICE"]);
  if (!log) return [];
  const shas = log
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  /** @type {LicenseCommit[]} */
  const commits = [];
  for (const sha of shas) {
    const manifest = showAt(sha, "package.json");
    const licenseText = showAt(sha, "LICENSE") ?? "";
    const noticeText = showAt(sha, "NOTICE") ?? "";
    commits.push({
      sha,
      spdx: manifest ? spdxFromPackageJson(manifest) : null,
      licenseText,
      noticeText,
    });
  }
  return commits;
}

function main() {
  const parsed = parseRefFlag(process.argv.slice(2));
  if (!parsed.ok) {
    console.error(parsed.error);
    process.exit(1);
  }
  const { ref } = parsed;

  if (refNeedsUpstreamRemote(ref) && gitOrNull(["remote", "get-url", "upstream"]) == null) {
    console.error(missingUpstreamMessage());
    process.exit(1);
  }

  const shaOut = gitOrNull(["rev-parse", "--verify", `${ref}^{commit}`]);
  if (!shaOut) {
    console.error(
      `No git ref ${ref}. Fetch it first (git fetch upstream), then rerun.\n` +
        "Do not silently check HEAD. Fetch is how we see a license change; it is not the merge.",
    );
    if (refNeedsUpstreamRemote(ref)) console.error(`\n${missingUpstreamMessage()}`);
    process.exit(1);
  }
  const sha = shaOut.trim();

  const manifest = showAt(ref, "package.json");
  if (!manifest) {
    console.error(formatUpstreamLicenseAlert({
      ref,
      sha,
      lastClean: null,
      assessment: {
        ok: false,
        spdx: null,
        reasons: [`${ref} has no package.json`],
        notes: [],
        restrictions: [],
      },
    }));
    process.exit(1);
  }

  const licenseText = showAt(ref, "LICENSE");
  const noticeText = showAt(ref, "NOTICE") ?? "";
  const assessment = assessUpstreamLicense({
    spdx: spdxFromPackageJson(manifest),
    licenseText: licenseText ?? "",
    noticeText,
  });

  if (assessment.ok) {
    console.log(`${ref} (${sha.slice(0, 12)}) license ${assessment.spdx}. OK to merge.`);
    for (const note of assessment.notes) console.log(note);
    return;
  }

  const lastClean = findLastCleanCommit(loadCommitsNewestFirst(ref));
  console.error(formatUpstreamLicenseAlert({ ref, sha, lastClean, assessment }));
  process.exit(1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
