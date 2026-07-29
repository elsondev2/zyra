#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { formatZyraVersion, isZyraVersionRequest } from "../src/version.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(root, "src", "zyra.mjs");
const args = process.argv.slice(2);

if (isZyraVersionRequest(args)) {
  process.stdout.write(`${formatZyraVersion()}\n`);
  process.exit(0);
}

const result = spawnSync(process.execPath, [cli, ...args], {
  stdio: "inherit",
  cwd: root,
  env: {
    ...process.env,
    ZYRA_CALLER_CWD: process.env.ZYRA_CALLER_CWD ?? process.cwd(),
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
