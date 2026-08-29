#!/usr/bin/env node
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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

  if (process.platform === "win32") {
    const installSource = readFileSync(path.join(root, "install.ps1"), "utf8");
    assert.match(
      installSource,
      /if not exist .* goto zyra_cli_fallback[\s\S]*--tui %\*[\s\S]*exit \/b %ERRORLEVEL%[\s\S]*:zyra_cli_fallback/,
      "the managed Desktop shim must read ERRORLEVEL after Desktop exits, outside a parenthesized CMD block",
    );
    assert.doesNotMatch(
      installSource,
      /if exist .*\(.*--tui %\*.*%ERRORLEVEL%.*\)/,
      "CMD cannot expand the Desktop exit code before launching Desktop",
    );

    const nsisInstallerSource = readFileSync(path.join(root, "desktop", "build", "installer.nsh"), "utf8");
    assert.match(
      nsisInstallerSource,
      /if not exist .*zyra-node\\node\.exe.*goto zyra_cli_fallback[\s\S]*zyra-node\\node\.exe.*zyra-runtime\\bin\\zyra\.mjs.*%\*[\s\S]*exit \/b %ERRORLEVEL%[\s\S]*:zyra_cli_fallback/,
      "the NSIS-managed launcher must read bundled Node's exit code outside a parenthesized CMD block",
    );
    assert.doesNotMatch(
      nsisInstallerSource,
      /if exist .*zyra-node\\node\.exe.*\(.*zyra-runtime\\bin\\zyra\.mjs.*%ERRORLEVEL%.*\)/,
      "the NSIS-managed launcher cannot expand ERRORLEVEL before bundled Node exits",
    );

    const directDesktopFailure = spawnSync(process.execPath, ["--tui"], { encoding: "utf8" });
    assert.notEqual(directDesktopFailure.status, 0, "the regression fixture needs a failing executable invocation");
    const shimPath = path.join(project, "desktop-exit-code.cmd");
    writeFileSync(shimPath, [
      "@echo off",
      "setlocal",
      `if not exist "${process.execPath}" goto zyra_cli_fallback`,
      `"${process.execPath}" --tui`,
      "exit /b %ERRORLEVEL%",
      ":zyra_cli_fallback",
      "exit /b 97",
      "",
    ].join("\r\n"), "ascii");
    const shimFailure = spawnSync(shimPath, [], { encoding: "utf8", shell: true });
    assert.equal(shimFailure.status, directDesktopFailure.status, "the managed shim must return Desktop's actual TUI exit code");
  }
} finally {
  rmSync(project, { recursive: true, force: true });
}

console.log("zyra version command: ok");
