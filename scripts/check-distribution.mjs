// Fails when something that ships still points at the project we forked from.
//
// A fork inherits its parent's endpoints, and each one is a way for a customer's
// build to talk to upstream instead of to us: the update feed replaces our app
// with theirs, the Composio broker routes their Gmail through upstream's Worker
// on upstream's key, and a "Docs" link lands them on the repo we forked. None of
// it fires in development, which is exactly why it ships.
//
// This is the runnable half of "Nothing may default to upstream" in
// .claude/skills/commercial-fork/SKILL.md. Two modes, because the list is not
// empty yet and a gate that always fails is a gate people learn to skip:
//
//   pnpm check:distribution            every finding must be named in ACCEPTED
//   pnpm check:distribution --release  ACCEPTED must itself be empty
//
// The first runs in CI and is green today; it fails when a NEW upstream default
// arrives through a merge or a routine edit. The second is the gate before a
// build leaves the building, and it stays red until the release-channel
// decisions in docs/plans/2026-08-20-004-release-channel-plan.md are made.
//
// The markers are deliberately narrow. Most "openmausbot" strings in this tree
// are not branding: ~/.openmausbot, openmausbot://pair, _openmausbot._tcp and
// the openmaus.team wire format identify the app to itself and must survive a
// rebrand untouched (docs/identity-surface.md §2). Only names that identify
// *upstream* belong below.
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MARKERS = [
  { pattern: /milind-soni/i, what: "upstream's GitHub account" },
  { pattern: /milindsoni201/i, what: "upstream's workers.dev subdomain" },
  { pattern: /openmausbot-releases/, what: "upstream's release feed" },
  { pattern: /openmausbot-teams/, what: "upstream's team library" },
];

// Only what ends up in, or configures, a packaged build. Docs and skills discuss
// upstream constantly and correctly, so they are not scanned.
const SHIPPED = ["electron-builder.yml", "package.json", "electron", "server", "src"];

const READABLE = new Set([".ts", ".tsx", ".mjs", ".cjs", ".js", ".jsx", ".yml", ".yaml", ".json"]);

// Known today, each naming the decision it waits on. `count` is what keeps this
// from becoming a blanket exemption: a new upstream reference in an
// already-listed file still fails, because the number moves.
const ACCEPTED = [
  {
    file: "electron-builder.yml",
    count: 3,
    reason: "publish feed (12-15) and the Linux .deb maintainer (152) are upstream's",
    blocks: "decision 3 (where releases live) and decision 4 (signing identity)",
  },
  {
    file: "package.json",
    count: 3,
    reason: "homepage, repository and author carry upstream's URLs into installer metadata",
    blocks: "decision 2 (product name) and decision 3",
  },
  {
    file: "electron/main.mjs",
    count: 1,
    reason: "packaged builds fall back to upstream's Composio Worker, on upstream's key",
    blocks: "deploying our own Worker from cloudflare/composio-broker/",
  },
  {
    file: "server/team-library.ts",
    count: 2,
    reason: "the Team Library fetches from a repo upstream controls, at runtime",
    blocks: "our own team repo, or the feature off in our builds",
  },
  {
    file: "server/team-library.test.ts",
    count: 1,
    reason: "asserts the constant above; moves with it",
    blocks: "the same decision as server/team-library.ts",
  },
  {
    file: "src/components/TeamLibraryPanel.tsx",
    count: 1,
    reason: '"Browse community teams" opens upstream\'s repository',
    blocks: "the same decision as server/team-library.ts",
  },
  {
    file: "src/components/ApiKeys.tsx",
    count: 1,
    reason: "the BYO-VPS docs link opens the project we forked from",
    blocks: "somewhere of our own for documentation links to point",
  },
  {
    file: "src/components/LinuxLocalControl.tsx",
    count: 1,
    reason: "the local-control docs link opens the project we forked from",
    blocks: "the same decision as src/components/ApiKeys.tsx",
  },
];

/** Lines naming upstream. One finding per line — the first marker describes it well enough. */
export function upstreamRefs(text) {
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    const marker = MARKERS.find(({ pattern }) => pattern.test(line));
    if (marker) hits.push({ line: index + 1, what: marker.what, text: line.trim() });
  });
  return hits;
}

function* walk(root) {
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!existsSync(current)) continue;
    if (statSync(current).isFile()) {
      yield current;
      continue;
    }
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      stack.push(join(current, entry));
    }
  }
}

function scan(cwd) {
  const found = new Map();
  for (const root of SHIPPED) {
    for (const path of walk(join(cwd, root))) {
      if (!READABLE.has(extname(path))) continue;
      const hits = upstreamRefs(readFileSync(path, "utf8"));
      if (hits.length > 0) found.set(relative(cwd, path).split(sep).join("/"), hits);
    }
  }
  return found;
}

function main() {
  const releaseMode = process.argv.includes("--release");
  const found = scan(process.cwd());

  const unlisted = [];
  const drifted = [];
  for (const [file, hits] of [...found].sort()) {
    const entry = ACCEPTED.find((candidate) => candidate.file === file);
    if (!entry) {
      unlisted.push(`  ${file}\n${hits.map((h) => `      ${file}:${h.line} — ${h.what}`).join("\n")}`);
    } else if (entry.count !== hits.length) {
      drifted.push(`  ${file} — accepted ${entry.count}, found ${hits.length}`);
    }
  }
  const resolved = ACCEPTED.filter((entry) => !found.has(entry.file));

  const total = [...found.values()].reduce((sum, hits) => sum + hits.length, 0);
  console.log(`Scanned ${SHIPPED.join(", ")} — ${total} reference(s) to upstream in ${found.size} file(s).\n`);
  for (const entry of ACCEPTED) {
    if (found.has(entry.file)) console.log(`  ${entry.file}\n      ${entry.reason}\n      waits on: ${entry.blocks}`);
  }

  const failures = [];
  if (unlisted.length > 0) {
    failures.push(
      `${unlisted.length} file(s) point at upstream and are not in ACCEPTED:\n${unlisted.join("\n")}\n\n` +
        "A default that reaches a customer sends them to the project we forked from.\n" +
        "Repoint it, or add it to ACCEPTED in scripts/check-distribution.mjs naming\n" +
        "the decision it waits on.",
    );
  }
  if (drifted.length > 0) {
    failures.push(
      `${drifted.length} accepted file(s) gained or lost references:\n${drifted.join("\n")}\n\n` +
        "Re-read the file. If a new upstream default arrived, repoint it; if one was\n" +
        "removed, lower the count.",
    );
  }
  if (resolved.length > 0) {
    failures.push(
      `${resolved.length} ACCEPTED entr(y/ies) no longer match anything:\n` +
        `${resolved.map((entry) => `  ${entry.file}`).join("\n")}\n\n` +
        "The work was done — delete the entry so the list keeps meaning something.",
    );
  }
  if (releaseMode && ACCEPTED.length > 0) {
    failures.push(
      `${ACCEPTED.length} upstream default(s) remain, and this is a release build:\n` +
        `${ACCEPTED.map((entry) => `  ${entry.file} — waits on ${entry.blocks}`).join("\n")}\n\n` +
        "See docs/plans/2026-08-20-004-release-channel-plan.md. A build carrying these\n" +
        "updates itself onto upstream's product and routes customer traffic through\n" +
        "upstream's infrastructure.",
    );
  }

  if (failures.length === 0) {
    console.log(releaseMode ? "\nNothing points at upstream. OK to ship." : "\nNo unaccepted upstream defaults. OK.");
    return;
  }
  console.error(`\n${failures.join("\n\n")}`);
  process.exit(1);
}

// Only act as a CLI when invoked directly; the unit test imports upstreamRefs
// without wanting a scan of the whole tree as a side effect.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
