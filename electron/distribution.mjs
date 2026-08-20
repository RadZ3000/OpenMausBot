// The build-time half of the distribution profile that the window cannot carry.
//
// `src/lib/distribution.ts` covers everything read in the renderer, where Vite
// inlines VITE_* values at build time. The harness server has no such channel:
// it is a forked process that reads process.env, and a packaged app launched
// from the Dock or the Start menu inherits nothing. So a knob like "this build
// prefers its own local engine" worked in development and was dead in the
// artifact we would actually hand a customer.
//
// electron-builder closes that gap. `extraMetadata` is merged into the
// package.json staged inside the asar, which `files` already ships, so a build
// can carry configuration without a patched source tree:
//
//   electron-builder --win -c.extraMetadata.distribution.defaultEngine=hermesAgent
//
// or, for a customer build with several settings, a config file that extends
// electron-builder.yml with:
//
//   extraMetadata:
//     distribution:
//       defaultEngine: hermesAgent
//       defaultModel: "ollama::qwen3:4b"
//
// The real environment still wins, matching how the server treats its own
// config: a baked default is a default, and one has to remain overridable to
// debug a packaged build in the field.
import fs from "node:fs";
import path from "node:path";

/** The `distribution` block of the packaged package.json, or an empty one.
 *
 * Never throws. This runs on the startup path before any window exists, and a
 * build whose metadata is missing or malformed should start with defaults
 * rather than fail to launch with nowhere to report why. */
export function readDistributionMetadata(appPath) {
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(appPath, "package.json"), "utf8"));
    return manifest.distribution ?? {};
  } catch {
    return {};
  }
}

const chosen = (fromEnv, fromMetadata) => String(fromEnv ?? "").trim() || String(fromMetadata ?? "").trim();

/** Environment the harness server needs to honour this build's preferences.
 *
 * Absent settings are left out entirely rather than passed as empty strings, so
 * the server sees the same "unset" it would see in development. */
export function distributionEnv(metadata, env) {
  const result = {};
  const engine = chosen(env.OMB_DEFAULT_ENGINE, metadata?.defaultEngine);
  if (engine) result.OMB_DEFAULT_ENGINE = engine;
  const model = chosen(env.OMB_DEFAULT_MODEL, metadata?.defaultModel);
  if (model) result.OMB_DEFAULT_MODEL = model;
  return result;
}
