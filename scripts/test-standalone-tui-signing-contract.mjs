#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { tuiReleaseAssetName } from "./tui-release-contract.mjs";

const version = "0.6.0";
const windowsThumbprint = "A".repeat(40);
const macosTeamId = "ABCDE12345";
const directory = await mkdtemp(path.join(os.tmpdir(), "zyra-tui-signing-contract-"));
const markerDirectory = path.join(directory, "markers");
const assetsDirectory = path.join(directory, "assets");
const validator = path.resolve(import.meta.dirname, "..", "desktop", "scripts", "release", "validate-signature-markers.mjs");

try {
  await mkdir(markerDirectory, { recursive: true });
  await mkdir(assetsDirectory, { recursive: true });
  await writeMarkers();
  const valid = validate();
  assert.equal(valid.status, 0, `${valid.stdout}\n${valid.stderr}`);

  const windowsName = tuiReleaseAssetName(version, "windows-x64");
  await writeFile(path.join(assetsDirectory, windowsName), "tampered bytes", "utf8");
  const tampered = validate();
  assert.notEqual(tampered.status, 0, "tagged publication must reject bytes changed after signing");
  assert.match(tampered.stderr, /does not match released bytes/);

  await writeMarkers();
  const macos = await marker("macos");
  macos.standaloneTui.artifacts.pop();
  await writeFile(path.join(markerDirectory, "macos.json"), `${JSON.stringify(macos)}\n`, "utf8");
  const incomplete = validate();
  assert.notEqual(incomplete.status, 0, "tagged publication must reject missing macOS x64 signing evidence");
  assert.match(incomplete.stderr, /signature targets do not match/);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log("Standalone TUI signing evidence contract: ok");

async function writeMarkers() {
  await rm(assetsDirectory, { recursive: true, force: true });
  await mkdir(assetsDirectory, { recursive: true });
  for (const platform of ["windows", "macos", "linux"]) {
    await writeFile(path.join(markerDirectory, `${platform}.json`), `${JSON.stringify(await marker(platform))}\n`, "utf8");
  }
}

async function marker(platform) {
  if (platform === "windows") {
    return {
      schemaVersion: 1,
      platform,
      signed: true,
      notarized: false,
      checks: [{ name: "widevine-vmp" }, { name: "authenticode" }],
      standaloneTui: await standaloneEvidence(["windows-x64"], false),
    };
  }
  if (platform === "macos") {
    return {
      schemaVersion: 1,
      platform,
      signed: true,
      notarized: true,
      checks: ["widevine-vmp", "codesign", "gatekeeper", "notarization-staple"].map((name) => ({ name })),
      standaloneTui: await standaloneEvidence(["macos-arm64", "macos-x64"], true),
    };
  }
  return { schemaVersion: 1, platform, signed: false, notarized: false, checks: [] };
}

async function standaloneEvidence(targets, notarized) {
  const artifacts = [];
  for (const target of targets) {
    const name = tuiReleaseAssetName(version, target);
    const content = Buffer.from(`signed fixture:${target}\n`, "utf8");
    await writeFile(path.join(assetsDirectory, name), content);
    artifacts.push({
      target,
      name,
      size: content.length,
      sha256: createHash("sha256").update(content).digest("hex"),
      signatureIdentity: "fixture identity",
      signatureThumbprint: target === "windows-x64" ? windowsThumbprint : "B".repeat(40),
      ...(target.startsWith("macos-") ? {
        teamId: macosTeamId,
        entitlementsSha256: "c".repeat(64),
        gatekeeperAssessed: true,
      } : {}),
    });
  }
  return {
    schemaVersion: 1,
    version,
    signed: true,
    notarized,
    artifacts,
    ...(notarized ? {
      notarization: {
        id: "123e4567-e89b-42d3-a456-426614174000",
        status: "Accepted",
        ticketStapled: false,
      },
    } : {}),
  };
}

function validate() {
  return spawnSync(process.execPath, [
    validator,
    `--dir=${markerDirectory}`,
    `--assets-dir=${assetsDirectory}`,
    `--version=${version}`,
    `--windows-thumbprint=${windowsThumbprint}`,
    `--macos-team-id=${macosTeamId}`,
    "--require-signing=true",
  ], {
    encoding: "utf8",
    windowsHide: true,
  });
}
