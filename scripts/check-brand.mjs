// Fails when a shipped surface still names the upstream product, or when a
// brand-pack slot is empty on a customer artifact.
//
// Two modes, same shape as check-distribution:
//
//   pnpm check:brand            every leak or empty slot is named in INCOMPLETE
//   pnpm check:brand --release  INCOMPLETE must be empty
//
// Authority: docs/plans/2026-08-25-002-brand-pack-plan.md
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { parse as parseYaml } from "yaml";

const UNSET = "unset";

const SHIPPED = [
  "src",
  "electron",
  "server",
  "companion",
  "ios",
  "brand",
  "package.json",
  "brand/electron-builder.yml",
  "index.html",
];

const READABLE = new Set([
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".js",
  ".jsx",
  ".yml",
  ".yaml",
  ".json",
  ".html",
  ".swift",
  ".plist",
  ".md",
  ".txt",
]);

const SKIP_DIR = new Set(["node_modules", "vendor", "testing"]);

function isTestPath(rel) {
  return (
    /\.test\.(ts|tsx|mjs|cjs|js)$/.test(rel) ||
    /\.node-test\.(mjs|cjs|js)$/.test(rel) ||
    /(?:^|\/)(?:test|Tests|__tests__)(?:\/|$)/.test(rel) ||
    rel.startsWith("scripts/check-brand")
  );
}

function isCommentLine(line) {
  const t = line.trim();
  return (
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.startsWith("#") ||
    t.startsWith("<!--")
  );
}

/** Markers that identify the upstream product or their infrastructure. */
export function brandLeaks(
  text,
  { dataDirectorySet = false, executableNameSet = false, inheritedProtocol = false } = {},
) {
  const markers = [
    { pattern: /OpenMausBot/, what: "upstream product name" },
    { pattern: /OpenMausMobile/, what: "upstream companion name" },
    { pattern: /OpenMaus /, what: "upstream short name" },
    { pattern: /milind-soni/i, what: "upstream's GitHub account" },
    { pattern: /milindsoni201/i, what: "upstream's workers.dev subdomain" },
    { pattern: /openmausbot-releases/, what: "upstream's release feed" },
    { pattern: /openmausbot-teams/, what: "upstream's team library" },
    { pattern: /🐭/, what: "crash-page mouse" },
  ];
  if (dataDirectorySet) {
    markers.push({ pattern: /["']\.openmausbot["']/, what: "historical data-dir default" });
  }
  if (executableNameSet) {
    markers.push({ pattern: /executableName:\s*openmausbot/, what: "upstream Linux executable name" });
  }
  if (inheritedProtocol) {
    markers.push({ pattern: /openmausbot:\/\//, what: "inherited protocol scheme" });
  }
  const hits = [];
  text.split(/\r?\n/).forEach((line, index) => {
    if (isCommentLine(line)) return;
    if (/openmaus\.team/.test(line) && !/OpenMausBot|OpenMausMobile|OpenMaus /.test(line)) return;
    const marker = markers.find(({ pattern }) => pattern.test(line));
    if (marker) hits.push({ line: index + 1, what: marker.what, text: line.trim() });
  });
  return hits;
}

export function parseBrandProfile(source) {
  const field = (name) => {
    const match = source.match(new RegExp(`${name}:\\s*(UNSET|null|true|false|"([^"]*)")`));
    if (!match) return undefined;
    if (match[1] === "UNSET") return UNSET;
    if (match[1] === "null") return null;
    if (match[1] === "true") return true;
    if (match[1] === "false") return false;
    return match[2];
  };
  return {
    productName: field("productName"),
    companyName: field("companyName"),
    companionName: field("companionName"),
    defaultSkin: field("defaultSkin"),
    appId: field("appId"),
    dataDirectoryName: field("dataDirectoryName"),
    protocolDisplayName: field("protocolDisplayName"),
    protocolScheme: field("protocolScheme"),
    executableName: field("executableName"),
    speechHelperName: field("speechHelperName"),
    recorderHelperName: field("recorderHelperName"),
    httpUserAgent: field("httpUserAgent"),
    homepage: field("homepage"),
    authorName: field("authorName"),
    authorEmail: field("authorEmail"),
    docsBaseUrl: field("docsBaseUrl"),
    publish: field("publish"),
    composioBrokerUrl: field("composioBrokerUrl"),
    teamLibrary: field("teamLibrary"),
    showUpdateDownload: field("showUpdateDownload"),
    iconsDir: field("iconsDir"),
    mascotDir: field("mascotDir"),
  };
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
      if (entry.startsWith(".") || SKIP_DIR.has(entry)) continue;
      stack.push(join(current, entry));
    }
  }
}

function assetCount(dir) {
  if (!existsSync(dir)) return 0;
  return readdirSync(dir).filter((name) => name !== ".gitkeep" && name !== "index.ts").length;
}

function scan(cwd, profile) {
  const found = new Map();
  const opts = {
    dataDirectorySet: profile.dataDirectoryName !== UNSET,
    executableNameSet: profile.executableName !== UNSET,
    inheritedProtocol: profile.protocolScheme !== UNSET && profile.protocolScheme !== "openmausbot",
  };
  for (const root of SHIPPED) {
    const start = join(cwd, root);
    if (!existsSync(start)) continue;
    if (statSync(start).isFile()) {
      const rel = root.split(sep).join("/");
      if (isTestPath(rel) || !READABLE.has(extname(start))) continue;
      const hits = brandLeaks(readFileSync(start, "utf8"), opts);
      if (hits.length > 0) found.set(rel, hits);
      continue;
    }
    for (const path of walk(start)) {
      const rel = relative(cwd, path).split(sep).join("/");
      if (isTestPath(rel) || !READABLE.has(extname(path))) continue;
      const hits = brandLeaks(readFileSync(path, "utf8"), opts);
      if (hits.length > 0) found.set(rel, hits);
    }
  }
  return found;
}

// Remaining leaks and empty slots. `count` is what keeps this from becoming a
// blanket exemption: a new OpenMausBot / milind hit in an already-listed file
// still fails. Slot-only rows use count 0.
export const INCOMPLETE = [
  { slot: "appId", file: "brand/profile.ts", count: 0, reason: "lock-once identity still unset" },
  { slot: "dataDirectoryName", file: "brand/profile.ts", count: 0, reason: "default is still ~/.openmausbot" },
  { slot: "protocolDisplayName", file: "brand/profile.ts", count: 0, reason: "protocol display name still unset" },
  { slot: "protocolScheme", file: "brand/profile.ts", count: 0, reason: "scheme keep-or-replace still unset" },
  { slot: "executableName", file: "brand/profile.ts", count: 0, reason: "Linux binary still inherited" },
  { slot: "speechHelperName", file: "brand/profile.ts", count: 0, reason: "macOS speech helper still OpenMausBot Speech.app" },
  { slot: "recorderHelperName", file: "brand/profile.ts", count: 0, reason: "macOS recorder helper still OpenMausBot Recorder.app" },
  { slot: "httpUserAgent", file: "brand/profile.ts", count: 0, reason: "outbound UA still OpenMausBot-skills" },
  { slot: "homepage", file: "brand/profile.ts", count: 0, reason: "installer homepage still upstream's" },
  { slot: "authorName", file: "brand/profile.ts", count: 0, reason: "installer author still upstream's" },
  { slot: "authorEmail", file: "brand/profile.ts", count: 0, reason: "installer email still upstream's" },
  { slot: "docsBaseUrl", file: "brand/profile.ts", count: 0, reason: "in-app docs links stay hidden until we have a URL" },
  { slot: "publish", file: "brand/profile.ts", count: 0, reason: "no update feed until 004 plugs our repo" },
  { slot: "composioBrokerUrl", file: "brand/profile.ts", count: 0, reason: "packaged Composio fallback is still milind" },
  { slot: "companionName", file: "brand/profile.ts", count: 0, reason: "phone name falls back to productName; iOS strings remain" },
  { slot: "icons", file: "brand/icons", count: 0, reason: "brand/icons/ has no artwork" },
  { slot: "mascot", file: "brand/mascot", count: 0, reason: "brand/mascot/ has no drawing" },
  { slot: "recorderHelperName", file: "electron/build-recorder-helper.mjs", count: 1, reason: "bundle name still OpenMausBot Recorder.app" },
  { slot: "speechHelperName", file: "electron/build-speech-helper.mjs", count: 1, reason: "bundle name still OpenMausBot Speech.app" },
  { slot: "composioBrokerUrl", file: "electron/main.mjs", count: 1, reason: "packaged Composio fallback is still milind" },
  { slot: "recorderHelperName", file: "electron/resources/recorder-helper-Info.plist", count: 4, reason: "helper identity still names OpenMausBot" },
  { slot: "recorderHelperName", file: "electron/resources/recorder-helper.swift", count: 1, reason: "Accessibility prompt still names OpenMausBot Recorder" },
  { slot: "speechHelperName", file: "electron/resources/speech-helper-Info.plist", count: 4, reason: "helper identity still names OpenMausBot" },
  { slot: "recorderHelperName", file: "electron/skill-recorder.mjs", count: 1, reason: "packaged bundle name still OpenMausBot Recorder.app" },
  { slot: "speechHelperName", file: "electron/speech.mjs", count: 1, reason: "packaged bundle name still OpenMausBot Speech.app" },
  { slot: "companionName", file: "ios/App/AgentProfileView.swift", count: 1, reason: "iOS copy still names the upstream product" },
  { slot: "companionName", file: "ios/App/PairingScanner.swift", count: 1, reason: "iOS pairing scanner still names the upstream product" },
  { slot: "companionName", file: "ios/App/PairingView.swift", count: 4, reason: "iOS pairing copy still names the upstream product" },
  { slot: "companionName", file: "ios/App/SettingsView.swift", count: 2, reason: "iOS settings copy still names OpenMausMobile / OpenMausBot" },
  { slot: "companionName", file: "ios/App/SpeechDictation.swift", count: 2, reason: "iOS dictation copy still names OpenMausMobile" },
  { slot: "companionName", file: "ios/App/TasksRoutinesView.swift", count: 2, reason: "iOS tasks copy still names the upstream product" },
  { slot: "companionName", file: "ios/AppStore/RELEASE.md", count: 3, reason: "App Store release notes still name the upstream product" },
  { slot: "companionName", file: "ios/AppStore/en-US/description.txt", count: 5, reason: "App Store description still names the upstream product" },
  { slot: "companionName", file: "ios/AppStore/en-US/promotional_text.txt", count: 1, reason: "App Store promo still names the upstream product" },
  { slot: "companionName", file: "ios/AppStore/en-US/release_notes.txt", count: 2, reason: "App Store release notes still name OpenMausMobile" },
  { slot: "companionName", file: "ios/AppStore/privacy-answers.md", count: 2, reason: "privacy answers still name the upstream product" },
  { slot: "companionName", file: "ios/AppStore/review-notes.md", count: 4, reason: "review notes still name the upstream product" },
  { slot: "companionName", file: "ios/README.md", count: 1, reason: "iOS readme still names the upstream product" },
  { slot: "companionName", file: "ios/Sources/CompanionCore/Client.swift", count: 1, reason: "client error copy still names the upstream product" },
  { slot: "companionName", file: "ios/Sources/CompanionCore/Failover.swift", count: 1, reason: "failover copy still names the upstream product" },
  { slot: "companionName", file: "ios/TESTING.md", count: 7, reason: "iOS testing notes still name the upstream product" },
  { slot: "companionName", file: "ios/Widgets/Info.plist", count: 1, reason: "widget display name still OpenMausMobile" },
  { slot: "companionName", file: "ios/project.yml", count: 6, reason: "XcodeGen display names still OpenMausMobile / OpenMausBot" },
  { slot: "homepage", file: "package.json", count: 3, reason: "homepage, repository and author still point at milind-soni" },
  { slot: "httpUserAgent", file: "server/distribution.ts", count: 1, reason: "outbound UA still OpenMausBot-skills" },
  { slot: "appId", file: "server/local-computer.ts", count: 1, reason: "macOS Application Support fallback still lists OpenMausBot" },
];

const UNSET_SLOTS = [
  "companionName",
  "appId",
  "dataDirectoryName",
  "protocolDisplayName",
  "protocolScheme",
  "executableName",
  "speechHelperName",
  "recorderHelperName",
  "httpUserAgent",
  "homepage",
  "authorName",
  "authorEmail",
  "docsBaseUrl",
  "composioBrokerUrl",
];

export function evaluateBrand(cwd, { release = false } = {}) {
  const profileSource = readFileSync(join(cwd, "brand/profile.ts"), "utf8");
  const profile = parseBrandProfile(profileSource);
  const overlaySource = readFileSync(join(cwd, "brand/electron-builder.yml"), "utf8");
  const overlay = parseYaml(overlaySource);
  const failures = [];

  if (overlay.extends !== "../electron-builder.yml") {
    failures.push("brand/electron-builder.yml must extend ../electron-builder.yml");
  }
  if (overlay.productName !== profile.productName) {
    failures.push(
      `overlay productName ${JSON.stringify(overlay.productName)} !== profile ${JSON.stringify(profile.productName)}`,
    );
  }
  const baked = overlay.extraMetadata?.distribution?.productName;
  if (baked !== profile.productName) {
    failures.push(
      `overlay extraMetadata.distribution.productName ${JSON.stringify(baked)} !== profile ${JSON.stringify(profile.productName)}`,
    );
  }
  if (overlay.extraMetadata?.distribution?.teamLibrary !== profile.teamLibrary) {
    failures.push(
      `overlay extraMetadata.distribution.teamLibrary ${JSON.stringify(overlay.extraMetadata?.distribution?.teamLibrary)} !== profile ${JSON.stringify(profile.teamLibrary)}`,
    );
  }
  if (overlay.publish != null && !(Array.isArray(overlay.publish) && overlay.publish.length === 0)) {
    failures.push("overlay publish must be null (or []) until 004 plugs our repo");
  }
  if (overlaySource.includes("openmausbot-releases") || overlaySource.includes("milind-soni")) {
    failures.push("overlay still names upstream's publish feed");
  }
  if (overlay.appId && profile.appId === UNSET) {
    failures.push("overlay must not set appId while the slot is unset");
  }
  const bakedDistribution = overlay.extraMetadata?.distribution ?? {};
  for (const [key, value] of Object.entries(bakedDistribution)) {
    if (value === UNSET || value === "unset") {
      failures.push(`overlay extraMetadata.distribution.${key} must not bake the unset sentinel`);
    }
  }
  if (overlay.afterPack) {
    failures.push("overlay must not override afterPack — it must resolve from the project directory");
  }
  if (overlay.directories?.buildResources) {
    failures.push("overlay must not override directories.buildResources while icons are empty");
  }
  if (!existsSync(join(cwd, "scripts/after-pack.mjs"))) {
    failures.push("scripts/after-pack.mjs missing from the project directory");
  }
  if (!existsSync(join(cwd, "build"))) {
    failures.push("build/ missing from the project directory (parent directories.buildResources)");
  }

  const found = scan(cwd, profile);
  const unlisted = [];
  const drifted = [];
  for (const [file, hits] of [...found].sort()) {
    const entry = INCOMPLETE.find((candidate) => candidate.file === file && candidate.count > 0);
    if (!entry) {
      unlisted.push(`  ${file}\n${hits.map((h) => `      ${file}:${h.line} — ${h.what}`).join("\n")}`);
    } else if (entry.count !== hits.length) {
      drifted.push(`  ${file} — accepted ${entry.count}, found ${hits.length}`);
    }
  }
  const resolved = INCOMPLETE.filter((entry) => entry.count > 0 && !found.has(entry.file));

  const emptyIcons = assetCount(join(cwd, profile.iconsDir || "brand/icons")) === 0;
  const emptyMascot = assetCount(join(cwd, profile.mascotDir || "brand/mascot")) === 0;
  const missingSlots = [];
  for (const slot of UNSET_SLOTS) {
    if (profile[slot] === UNSET && !INCOMPLETE.some((entry) => entry.slot === slot)) {
      missingSlots.push(slot);
    }
  }
  if (profile.publish === null && !INCOMPLETE.some((entry) => entry.slot === "publish")) {
    missingSlots.push("publish");
  }
  if (emptyIcons && !INCOMPLETE.some((entry) => entry.slot === "icons")) missingSlots.push("icons");
  if (emptyMascot && !INCOMPLETE.some((entry) => entry.slot === "mascot")) missingSlots.push("mascot");

  if (unlisted.length > 0) {
    failures.push(
      `${unlisted.length} file(s) still name the upstream product and are not in INCOMPLETE:\n${unlisted.join("\n")}`,
    );
  }
  if (drifted.length > 0) {
    failures.push(`${drifted.length} INCOMPLETE file(s) gained or lost references:\n${drifted.join("\n")}`);
  }
  if (resolved.length > 0) {
    failures.push(
      `${resolved.length} INCOMPLETE file(s) no longer match anything:\n${resolved.map((e) => `  ${e.file}`).join("\n")}`,
    );
  }
  if (missingSlots.length > 0) {
    failures.push(`empty slots not listed in INCOMPLETE: ${missingSlots.join(", ")}`);
  }

  if (release && INCOMPLETE.length > 0) {
    failures.push(
      `${INCOMPLETE.length} brand slot(s) remain incomplete, and this is a release build:\n` +
        `${INCOMPLETE.map((entry) => `  ${entry.slot} — ${entry.reason}`).join("\n")}`,
    );
  }

  return { profile, found, failures, incomplete: INCOMPLETE };
}

function main() {
  const release = process.argv.includes("--release");
  const result = evaluateBrand(process.cwd(), { release });
  const total = [...result.found.values()].reduce((sum, hits) => sum + hits.length, 0);
  console.log(
    `Scanned ${SHIPPED.join(", ")} — ${total} remaining brand leak(s) in ${result.found.size} file(s); ${INCOMPLETE.length} INCOMPLETE slot(s).\n`,
  );
  for (const entry of INCOMPLETE) {
    console.log(`  ${entry.slot}${entry.file ? ` (${entry.file})` : ""}\n      ${entry.reason}`);
  }
  if (result.failures.length === 0) {
    console.log(release ? "\nBrand pack is complete. OK to ship." : "\nNo unlisted brand leaks. OK.");
    return;
  }
  console.error(`\n${result.failures.join("\n\n")}`);
  process.exit(1);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
