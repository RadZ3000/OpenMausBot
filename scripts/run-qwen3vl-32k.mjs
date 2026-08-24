// Live Qwen3-VL Thinking probe at 32k. Does not change first-run defaults.
// Needs Ollama on 127.0.0.1:11434 with `qwen3-vl:4b` pulled (not Instruct).
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

process.env.OMB_LIVE_QWEN3VL = "1";

const require = createRequire(import.meta.url);
const vitestPkgPath = require.resolve("vitest/package.json");
const vitestPkg = JSON.parse(readFileSync(vitestPkgPath, "utf8"));
const binRel = vitestPkg.bin?.vitest ?? vitestPkg.bin;
const vitestBin = join(dirname(vitestPkgPath), binRel);
const testFile = join(dirname(fileURLToPath(import.meta.url)), "../server/qwen3vl-context.test.ts");

const child = spawn(process.execPath, [vitestBin, "run", testFile], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code) => process.exit(code ?? 1));
child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
