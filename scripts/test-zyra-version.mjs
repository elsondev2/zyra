#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageVersion = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")).version;
const expected = `zyra ${packageVersion}`;
const project = mkdtempSync(path.join(os.tmpdir(), "zyra-version-"));

try {
  for (const argument of ["--version", "-v", "version"]) {
    const result = spawnSync(process.execPath, [path.join(root, "bin", "zyra.mjs"), argument], {
      cwd: project,
      env: { ...process.env, ZYRA_CALLER_CWD: project },
      encoding: "utf8",
      timeout: 5000,
    });

    assert.notEqual(result.error?.code, "ETIMEDOUT", `${argument} must return without starting an agent turn`);
    assert.equal(result.status, 0, `${argument} should exit successfully: ${result.stderr}`);
    assert.equal(result.stdout.trim(), expected, `${argument} should print the package-backed Zyra version`);
    assert.equal(result.stderr, "", `${argument} should not emit an error`);
    assert.equal(existsSync(path.join(project, ".zyra")), false, `${argument} must not create project state`);
  }

  const direct = spawnSync(process.execPath, [path.join(root, "src", "zyra.mjs"), "--version"], {
    cwd: project,
    env: { ...process.env, ZYRA_CALLER_CWD: project },
    encoding: "utf8",
    timeout: 5000,
  });
  assert.notEqual(direct.error?.code, "ETIMEDOUT", "direct source version must return without starting an agent turn");
  assert.equal(direct.status, 0, direct.stderr);
  assert.equal(direct.stdout.trim(), expected);
  assert.equal(direct.stderr, "");
  assert.equal(existsSync(path.join(project, ".zyra")), false, "direct source version must not create project state");
} finally {
  rmSync(project, { recursive: true, force: true });
}

console.log("zyra version command: ok");
