import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, normalize } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { expandCmdVars, parseVarCmdShim } from "./cmd-shim-vars.ts";

// The shim shapes upstream's %dp0% match does not reach. This code path spawns
// CLI engines on Windows, so the forms installers actually write are fixtures.
let root = "";

function put(relative: string, contents = ""): string {
  const path = join(root, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
  return path;
}

/** Stand-in for env-path's own nodeExe/parseCmdShim, which are private there. */
const nodeBeside = (near: string) => join(near, "node.exe");
const follow = (next: string, depth: number) => parseVarCmdShim(next, nodeBeside, follow, depth);

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), "omb-shim-"));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("expandCmdVars", () => {
  it("substitutes %~dp0 with the shim's own directory", () => {
    expect(expandCmdVars('"%~dp0node.exe"', "C:\\app\\bin")).toBe('"C:\\app\\bin\\node.exe"');
  });

  it("resolves a target reached through a declared variable", () => {
    const text = 'set "ROOT=%~dp0.."\n"%ROOT%\\lib\\cli-entry.js"';
    expect(expandCmdVars(text, "C:\\app\\bin")).toContain('"C:\\app\\bin\\..\\lib\\cli-entry.js"');
  });

  it("follows one variable defined in terms of another", () => {
    const text = 'set "ROOT=%~dp0.."\nset "LIB=%ROOT%\\lib"\n"%LIB%\\entry.js"';
    expect(expandCmdVars(text, "C:\\app\\bin")).toContain('"C:\\app\\bin\\..\\lib\\entry.js"');
  });

  it("leaves a variable it was never told about alone", () => {
    expect(expandCmdVars('"%APPDATA%\\thing.js"', "C:\\app\\bin")).toBe('"%APPDATA%\\thing.js"');
  });

  // A batch file may define a variable in terms of itself; this is not an
  // interpreter and must not hang trying to be one.
  it("gives up on a self-referential definition instead of looping", () => {
    expect(() => expandCmdVars('set "A=%A%\\x"\n"%A%"', "C:\\bin")).not.toThrow();
  });
});

describe("parseVarCmdShim", () => {
  it("resolves a shim that indirects through a variable, using its bundled node", () => {
    const node = put("qwen/qwen-code/node/node.exe");
    const entry = put("qwen/qwen-code/lib/cli-entry.js");
    const shim = put(
      "qwen/qwen-code/bin/qwen.cmd",
      '@echo off\nsetlocal\nset "ROOT=%~dp0.."\n"%ROOT%\\node\\node.exe" "%ROOT%\\lib\\cli-entry.js" %*\n',
    );
    const resolved = parseVarCmdShim(shim, nodeBeside, follow);
    expect(resolved?.command && normalize(resolved.command)).toBe(normalize(node));
    expect(resolved?.args.map(normalize)).toEqual([normalize(entry)]);
  });

  // Qwen Code's installer puts a stub on PATH and the payload elsewhere.
  it("follows a stub that calls the real shim by absolute path", () => {
    const node = put("chain/inner/node/node.exe");
    const entry = put("chain/inner/lib/cli-entry.js");
    put(
      "chain/inner/bin/qwen.cmd",
      '@echo off\nset "ROOT=%~dp0.."\n"%ROOT%\\node\\node.exe" "%ROOT%\\lib\\cli-entry.js" %*\n',
    );
    const outer = put("chain/bin/qwen.cmd", `@echo off\ncall "${join(root, "chain/inner/bin/qwen.cmd")}" %*\n`);
    const resolved = parseVarCmdShim(outer, nodeBeside, follow);
    expect(resolved?.command && normalize(resolved.command)).toBe(normalize(node));
    expect(resolved?.args.map(normalize)).toEqual([normalize(entry)]);
  });

  it("does not chase a stub that calls itself", () => {
    const self = join(root, "loop/bin/self.cmd");
    put("loop/bin/self.cmd", `@echo off\ncall "${self}" %*\n`);
    expect(parseVarCmdShim(self, nodeBeside, follow)).toBeNull();
  });

  it("returns null for a shim naming nothing that exists", () => {
    const shim = put("empty/thing.cmd", '@echo off\n"%~dp0\\missing.js" %*\n');
    expect(parseVarCmdShim(shim, nodeBeside, follow)).toBeNull();
  });
});
