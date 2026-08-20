// Fails when a dependency arrives under terms we have not agreed to ship.
//
// The app is distributed as a packaged binary, so every bundled dependency's
// licence travels with it. Permissive terms are fine and need only a notice;
// copyleft is a decision, not a default, and a routine version bump is exactly
// how one arrives unnoticed. So anything outside ALLOWED has to be named in
// REVIEWED with the reason it is acceptable, or this exits non-zero.
//
// It reads the `license` field each package declares, which is a claim rather
// than proof — it is a tripwire for drift, not an audit.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

// Permissive: use freely, commercially, with attribution in the notices.
const ALLOWED = new Set([
  "0BSD",
  "Apache-2.0",
  "BlueOak-1.0.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "CC0-1.0",
  "CC-BY-4.0",
  "ISC",
  "MIT",
  "Python-2.0",
  "Unlicense",
  "WTFPL",
]);

// Everything else, each with the reason it is allowed through. Prefixes,
// because native packages fan out into one build per platform.
const REVIEWED = [
  {
    prefix: "@trycua/cua-driver",
    reason: "MPL-2.0 file-level copyleft, shipped unmodified; notices and SBOM in third_party/cua-driver/",
  },
  {
    prefix: "@ubjs/",
    reason: "MPL-2.0, pulled in by @trycua/cua-driver and shipped unmodified under the same notices",
  },
  {
    prefix: "lightningcss",
    reason: "MPL-2.0, build-time only via vite and @tailwindcss/node — never packaged into the app",
  },
  {
    prefix: "@img/sharp",
    reason: "bundles LGPL-3.0 libvips, but arrives through miniflare (a dev-only Cloudflare tool) and is not shipped",
  },
];

/** SPDX expressions: OR lets us elect a licence, AND binds us to all of them. */
export function permitted(expression) {
  const expr = expression.trim().replace(/^\((.*)\)$/s, "$1").trim();
  if (/\sAND\s/i.test(expr)) return expr.split(/\sAND\s/i).every(permitted);
  if (/\sOR\s/i.test(expr)) return expr.split(/\sOR\s/i).some(permitted);
  return ALLOWED.has(expr.replace(/\+$/, ""));
}

function declaredLicense(pkg) {
  if (pkg.license && pkg.license.type) return pkg.license.type;
  if (Array.isArray(pkg.licenses)) return pkg.licenses.map((entry) => entry.type ?? entry).join(" OR ");
  return pkg.license || null;
}

function installedPackages(store) {
  const found = new Map();
  for (const entry of readdirSync(store)) {
    const inner = join(store, entry, "node_modules");
    if (!existsSync(inner)) continue;
    for (const name of readdirSync(inner)) {
      const paths = name.startsWith("@")
        ? readdirSync(join(inner, name)).map((scoped) => join(inner, name, scoped))
        : [join(inner, name)];
      for (const path of paths) {
        const manifest = join(path, "package.json");
        if (!existsSync(manifest)) continue;
        let pkg;
        try {
          pkg = JSON.parse(readFileSync(manifest, "utf8"));
        } catch {
          continue;
        }
        if (!pkg.name || !pkg.version) continue;
        found.set(`${pkg.name}@${pkg.version}`, { name: pkg.name, license: declaredLicense(pkg) });
      }
    }
  }
  return found;
}

function main() {
  const store = join(process.cwd(), "node_modules", ".pnpm");
  if (!existsSync(store)) {
    console.error("no node_modules/.pnpm — run `pnpm install` first");
    process.exit(1);
  }

  const packages = installedPackages(store);
  const counts = new Map();
  const violations = [];
  const reviewed = [];

  for (const [id, { name, license }] of [...packages].sort()) {
    counts.set(license ?? "(none declared)", (counts.get(license ?? "(none declared)") ?? 0) + 1);
    if (license && permitted(license)) continue;
    const exception = REVIEWED.find((candidate) => name.startsWith(candidate.prefix));
    if (exception && license) reviewed.push(`  ${id} — ${license}\n      ${exception.reason}`);
    else violations.push(`  ${id} — ${license ?? "no license field"}`);
  }

  console.log(`Scanned ${packages.size} installed packages.\n`);
  for (const [license, count] of [...counts].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(5)}  ${license}`);
  }

  if (reviewed.length > 0) console.log(`\nAllowed by review (${reviewed.length}):\n${reviewed.join("\n")}`);

  if (violations.length === 0) {
    console.log("\nNo unreviewed licenses. OK.");
    return;
  }

  console.error(
    `\n${violations.length} package(s) under terms nobody has signed off on:\n${violations.join("\n")}\n\n` +
      "Decide whether the app may ship this. If it may, add it to REVIEWED in\n" +
      "scripts/check-licenses.mjs with the reason. If it may not, drop the dependency.",
  );
  process.exit(1);
}

// Only act as a CLI when invoked directly; the unit test imports permitted
// without wanting a scan of the whole store as a side effect.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
