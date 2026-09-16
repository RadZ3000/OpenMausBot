// Two Windows .cmd shim shapes the `"%~dp0\..."` match in env-path.ts cannot
// reach: a payload named through a variable, and a stub whose only job is to
// call the real shim somewhere else. Qwen Code's installer writes both, and
// without this its .cmd is handed to spawn directly — which Node refuses since
// the CVE-2024-27980 fix, so the engine simply never starts.
//
// This lives outside env-path.ts because that file is upstream's; the hook
// there is one call, tried only after their own forms find nothing.

import { readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, isAbsolute, join, normalize } from "node:path";

import type { ResolvedSpawn } from "./env-path.ts";

function isFile(p: string): boolean {
  try {
    return statSync(p, { throwIfNoEntry: false })?.isFile() ?? false;
  } catch {
    return false;
  }
}

/** The shim text with `%~dp0` and every variable it declares substituted, so a
 * target reached through a variable resolves the same as one written inline.
 *
 * Qwen Code's shim is the case this exists for: `set "ROOT=%~dp0.."` and then
 * `"%ROOT%\lib\cli-entry.js"`. */
export function expandCmdVars(text: string, dir: string): string {
  const withDp0 = text.replace(/%~dp0/gi, `${dir}\\`);
  const vars = new Map<string, string>();
  for (const match of withDp0.matchAll(/^[ \t]*set[ \t]+"([A-Za-z_]\w*)=([^"]*)"/gim)) {
    vars.set(match[1].toUpperCase(), match[2]);
  }
  // depth-limited because a batch file may legitimately define a variable in
  // terms of itself, and we are not writing an interpreter
  const expand = (raw: string, depth: number): string =>
    depth > 4
      ? raw
      : raw.replace(/%([A-Za-z_]\w*)%/g, (whole, name: string) => {
          const found = vars.get(name.toUpperCase());
          return found === undefined ? whole : expand(found, depth + 1);
        });
  return expand(withDp0, 0);
}

/** Every quoted path in the shim that exists on disk, once variables are gone. */
function shimTargets(text: string, dir: string): string[] {
  return [...expandCmdVars(text, dir).matchAll(/"([^"]+)"/g)]
    .map((match) => (isAbsolute(match[1]) ? normalize(match[1]) : join(dir, match[1])))
    .filter(isFile);
}

/** A launcher whose only job is to invoke the real shim: `call "…\x.cmd" %*`.
 * Written by installers that place a stub on PATH and keep the payload
 * elsewhere, and never in the %dp0% form. */
function chainedShim(text: string, dir: string): string | null {
  const call = /^[ \t]*call[ \t]+"([^"]+\.cmd)"/im.exec(text);
  if (!call) return null;
  const target = isAbsolute(call[1]) ? normalize(call[1]) : join(dir, call[1]);
  return isFile(target) ? target : null;
}

/** Tried only after the `%dp0%` forms find nothing, so a shim that resolves
 * today keeps resolving exactly as it did. `follow` re-enters the caller's own
 * parser for a chained stub, so the whole ladder applies to the real shim too. */
export function parseVarCmdShim(
  shim: string,
  nodeExe: (near: string) => string | null,
  follow: (next: string, depth: number) => ResolvedSpawn | null,
  depth = 0,
): ResolvedSpawn | null {
  let text: string;
  try {
    text = readFileSync(shim, "utf8");
  } catch {
    return null;
  }
  const dir = dirname(shim);

  // Unlike the %dp0% form, a bundled node.exe here is the interpreter we want
  // rather than noise to filter out — the shim ships its own runtime precisely
  // so it does not depend on one being installed.
  const expanded = shimTargets(text, dir);
  const script = expanded.find((p) => /\.[cm]?js$/i.test(p));
  if (script) {
    const node = expanded.find((p) => basename(p).toLowerCase() === "node.exe") ?? nodeExe(dir);
    if (node) return { command: node, args: [script] };
  }
  const exe = expanded.find(
    (p) => extname(p).toLowerCase() === ".exe" && basename(p).toLowerCase() !== "node.exe",
  );
  if (exe) return { command: exe, args: [] };

  // A stub that calls the real shim. Depth-limited rather than trusted.
  if (depth < 3) {
    const next = chainedShim(text, dir);
    if (next && next !== shim) return follow(next, depth + 1);
  }
  return null;
}
