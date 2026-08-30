#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { tuiReleaseAssetName } from "./tui-release-contract.mjs";

const root = path.resolve(import.meta.dirname, "..");
const args = parseArgs(process.argv.slice(2));
const platform = normalizePlatform(args.platform);
const version = requireValue(args.version, "--version");
const outputDirectory = path.resolve(requireValue(args.dir, "--dir"));
const markerPath = path.resolve(requireValue(args.marker, "--marker"));
const targets = platform === "windows" ? ["windows-x64"] : ["macos-arm64", "macos-x64"];
const artifacts = await Promise.all(targets.map(async (target) => {
  const name = tuiReleaseAssetName(version, target);
  const file = path.join(outputDirectory, name);
  const details = await stat(file).catch(() => null);
  if (!details?.isFile() || details.size <= 0) throw new Error(`Standalone TUI artifact is missing: ${file}`);
  return { target, name, file };
}));

const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "zyra-tui-signing-"));
try {
  const certificate = await materializeCertificate(temporaryDirectory);
  const evidence = platform === "windows"
    ? await signWindows(artifacts[0], certificate)
    : await signMacos(artifacts, certificate, temporaryDirectory);
  await updateVerificationMarker(markerPath, platform, evidence);
  console.log(`Signed standalone TUI artifacts for ${platform}.`);
} finally {
  await rm(temporaryDirectory, { recursive: true, force: true });
}

async function signWindows(artifact, certificate) {
  const certificatePassword = requireEnvironment("CSC_KEY_PASSWORD");
  const expectedThumbprint = normalizeHex(requireEnvironment("ZYRA_WINDOWS_EXPECTED_THUMBPRINT"));
  if (!/^[A-F0-9]{40}$/.test(expectedThumbprint)) throw new Error("The expected Windows certificate thumbprint is invalid.");
  const powershell = [
    "$ErrorActionPreference = 'Stop'",
    "$kitRoot = Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\\10\\bin'",
    "$signTool = Get-ChildItem -Path (Join-Path $kitRoot '*\\x64\\signtool.exe') -File | Sort-Object FullName | Select-Object -Last 1",
    "if (-not $signTool) { throw 'signtool.exe was not found.' }",
    "$password = ConvertTo-SecureString $env:ZYRA_CERTIFICATE_PASSWORD -AsPlainText -Force",
    "$imported = @(Import-PfxCertificate -FilePath $env:ZYRA_CERTIFICATE_FILE -CertStoreLocation Cert:\\CurrentUser\\My -Password $password -Exportable:$false)",
    "$certificate = $imported | Where-Object { $_.HasPrivateKey } | Select-Object -First 1",
    "if (-not $certificate) { throw 'The PFX did not contain a signing certificate with a private key.' }",
    "try {",
    "  & $signTool.FullName sign /fd SHA256 /td SHA256 /tr 'http://timestamp.digicert.com' /sha1 $certificate.Thumbprint /s My $env:ZYRA_SIGNATURE_TARGET",
    "  if ($LASTEXITCODE -ne 0) { throw \"signtool sign failed with $LASTEXITCODE\" }",
    "  & $signTool.FullName verify /pa /v $env:ZYRA_SIGNATURE_TARGET",
    "  if ($LASTEXITCODE -ne 0) { throw \"signtool verify failed with $LASTEXITCODE\" }",
    "  $signature = Get-AuthenticodeSignature -LiteralPath $env:ZYRA_SIGNATURE_TARGET",
    "  if ($signature.Status -ne 'Valid') { throw \"Authenticode status: $($signature.Status) $($signature.StatusMessage)\" }",
    "  $evidence = [pscustomobject]@{ subject = $signature.SignerCertificate.Subject; thumbprint = $signature.SignerCertificate.Thumbprint } | ConvertTo-Json -Compress",
    "  Write-Output \"ZYRA_SIGNATURE_JSON=$evidence\"",
    "} finally {",
    "  $imported | ForEach-Object { Remove-Item -LiteralPath $_.PSPath -Force -ErrorAction SilentlyContinue }",
    "}",
  ].join("\n");
  const result = await run("powershell.exe", ["-NoLogo", "-NoProfile", "-NonInteractive", "-Command", powershell], {
    env: {
      ZYRA_CERTIFICATE_FILE: certificate,
      ZYRA_CERTIFICATE_PASSWORD: certificatePassword,
      ZYRA_SIGNATURE_TARGET: artifact.file,
    },
  });
  const payloadLine = result.stdout.split(/\r?\n/).find((line) => line.startsWith("ZYRA_SIGNATURE_JSON="));
  if (!payloadLine) throw new Error("Windows signing did not return certificate evidence.");
  const signature = JSON.parse(payloadLine.slice("ZYRA_SIGNATURE_JSON=".length));
  if (normalizeHex(signature.thumbprint) !== expectedThumbprint) throw new Error("The Windows TUI was signed by an unexpected certificate.");
  return {
    schemaVersion: 1,
    version,
    signed: true,
    notarized: false,
    artifacts: [await artifactEvidence(artifact, {
      signatureIdentity: requireValue(signature.subject, "Windows signature subject"),
      signatureThumbprint: expectedThumbprint,
    })],
  };
}

async function signMacos(artifacts, certificate, temporaryDirectory) {
  const certificatePassword = requireEnvironment("CSC_KEY_PASSWORD");
  const expectedTeamId = requireEnvironment("ZYRA_MACOS_EXPECTED_TEAM_ID").toUpperCase();
  if (!/^[A-Z0-9]{10}$/.test(expectedTeamId)) throw new Error("The expected macOS Team ID is invalid.");
  const entitlements = path.join(root, "desktop", "build", "entitlements.tui.plist");
  const entitlementsBytes = await readFile(entitlements);
  const entitlementsSha256 = createHash("sha256").update(entitlementsBytes).digest("hex");
  const apiKey = requireEnvironment("APPLE_API_KEY");
  const apiKeyId = requireEnvironment("APPLE_API_KEY_ID");
  const apiIssuer = requireEnvironment("APPLE_API_ISSUER");
  const keychain = path.join(temporaryDirectory, "zyra-signing.keychain-db");
  const keychainPassword = randomBytes(24).toString("hex");
  const setupScript = [
    "set -euo pipefail",
    "security create-keychain -p \"$ZYRA_KEYCHAIN_PASSWORD\" \"$ZYRA_KEYCHAIN\"",
    "security set-keychain-settings -lut 21600 \"$ZYRA_KEYCHAIN\"",
    "security unlock-keychain -p \"$ZYRA_KEYCHAIN_PASSWORD\" \"$ZYRA_KEYCHAIN\"",
    "security import \"$ZYRA_CERTIFICATE_FILE\" -k \"$ZYRA_KEYCHAIN\" -P \"$ZYRA_CERTIFICATE_PASSWORD\" -T /usr/bin/codesign",
    "security set-key-partition-list -S apple-tool:,apple: -s -k \"$ZYRA_KEYCHAIN_PASSWORD\" \"$ZYRA_KEYCHAIN\"",
  ].join("\n");
  await run("/bin/bash", ["-c", setupScript], {
    env: {
      ZYRA_CERTIFICATE_FILE: certificate,
      ZYRA_CERTIFICATE_PASSWORD: certificatePassword,
      ZYRA_KEYCHAIN: keychain,
      ZYRA_KEYCHAIN_PASSWORD: keychainPassword,
    },
  });

  try {
    const identities = await run("security", ["find-identity", "-v", "-p", "codesigning", keychain]);
    const identity = [...identities.stdout.matchAll(/\b([A-F0-9]{40})\s+"([^"]+)"/g)]
      .map((match) => ({ hash: match[1], name: match[2] }))
      .find((candidate) => candidate.name.includes("Developer ID Application"));
    if (!identity) throw new Error("A Developer ID Application signing identity was not found.");
    const teamId = identity.name.match(/\(([A-Z0-9]{10})\)$/)?.[1];
    if (teamId !== expectedTeamId) throw new Error("The macOS signing identity has an unexpected Team ID.");

    for (const artifact of artifacts) {
      await run("codesign", [
        "--force",
        "--options", "runtime",
        "--timestamp",
        "--entitlements", entitlements,
        "--keychain", keychain,
        "--sign", identity.hash,
        artifact.file,
      ]);
      await run("codesign", ["--verify", "--strict", "--verbose=2", artifact.file]);
      const entitlementCheck = await run("codesign", ["-d", "--entitlements", ":-", artifact.file]);
      const entitlementOutput = `${entitlementCheck.stdout}\n${entitlementCheck.stderr}`;
      for (const requiredEntitlement of [
        "com.apple.security.cs.allow-jit",
        "com.apple.security.cs.allow-unsigned-executable-memory",
        "com.apple.security.cs.disable-executable-page-protection",
        "com.apple.security.cs.allow-dyld-environment-variables",
        "com.apple.security.cs.disable-library-validation",
      ]) {
        if (!entitlementOutput.includes(requiredEntitlement)) throw new Error(`Signed macOS TUI is missing ${requiredEntitlement}.`);
      }
    }

    const archive = path.join(temporaryDirectory, "Zyra-TUI-macOS-notarization.zip");
    await run("ditto", ["-c", "-k", "--keepParent", outputDirectory, archive]);
    const notarizationResult = await run("xcrun", [
      "notarytool", "submit", archive,
      "--key", apiKey,
      "--key-id", apiKeyId,
      "--issuer", apiIssuer,
      "--wait",
      "--output-format", "json",
    ]);
    const notarization = parseJsonOutput(notarizationResult.stdout);
    if (notarization.status !== "Accepted" || !notarization.id) {
      throw new Error(`Apple notarization was not accepted: ${notarization.status || "unknown"}`);
    }
    for (const artifact of artifacts) {
      await run("spctl", ["--assess", "--type", "execute", "--verbose=2", artifact.file]);
    }

    return {
      schemaVersion: 1,
      version,
      signed: true,
      notarized: true,
      artifacts: await Promise.all(artifacts.map((artifact) => artifactEvidence(artifact, {
        signatureIdentity: identity.name,
        signatureThumbprint: identity.hash,
        teamId,
        entitlementsSha256,
        gatekeeperAssessed: true,
      }))),
      notarization: {
        id: String(notarization.id),
        status: "Accepted",
        ticketStapled: false,
      },
    };
  } finally {
    await run("security", ["delete-keychain", keychain]).catch(() => {});
  }
}

async function materializeCertificate(temporaryDirectory) {
  const source = requireEnvironment("CSC_LINK");
  const output = path.join(temporaryDirectory, process.platform === "win32" ? "certificate.pfx" : "certificate.p12");
  if (source.startsWith("file:")) {
    await copyFile(fileURLToPath(source), output);
    return output;
  }
  if (existsSync(source)) {
    await copyFile(path.resolve(source), output);
    return output;
  }
  if (/^https?:\/\//i.test(source)) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`Signing certificate download failed with HTTP ${response.status}.`);
    await writeFile(output, Buffer.from(await response.arrayBuffer()), { mode: 0o600 });
    return output;
  }
  const base64 = source
    .replace(/^data:[^,]*;base64,/i, "")
    .replace(/^base64:\/\//i, "")
    .replace(/\s+/g, "");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 128) throw new Error("CSC_LINK is not a valid certificate path, URL, or base64 payload.");
  await writeFile(output, bytes, { mode: 0o600 });
  return output;
}

async function artifactEvidence(artifact, signature) {
  const bytes = await readFile(artifact.file);
  return {
    target: artifact.target,
    name: artifact.name,
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    ...signature,
  };
}

async function updateVerificationMarker(file, platform, evidence) {
  const marker = JSON.parse(await readFile(file, "utf8"));
  if (marker.schemaVersion !== 1 || marker.platform !== platform) {
    throw new Error(`Invalid ${platform} verification marker: ${file}`);
  }
  marker.standaloneTui = evidence;
  const temporary = `${file}.${process.pid}.partial`;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(temporary, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
  await rename(temporary, file);
}

function parseJsonOutput(value) {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Apple notarization returned no JSON evidence.");
  return JSON.parse(value.slice(start, end + 1));
}

function normalizeHex(value) {
  return String(value || "").replace(/[^a-f0-9]/gi, "").toUpperCase();
}

function normalizePlatform(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["windows", "win32"].includes(normalized)) return "windows";
  if (["macos", "darwin"].includes(normalized)) return "macos";
  throw new Error(`Standalone TUI signing is unsupported for platform: ${value || "missing"}`);
}

function parseArgs(values) {
  return Object.fromEntries(values.map((value) => {
    const [key, ...rest] = value.replace(/^--/, "").split("=");
    return [key, rest.length ? rest.join("=") : true];
  }));
}

function requireEnvironment(name) {
  return requireValue(process.env[name], name);
}

function requireValue(value, label) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  return text;
}

function run(executable, commandArgs, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, commandArgs, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() });
      else reject(new Error(`${path.basename(executable)} failed (${code ?? "unknown"}): ${stderr || stdout}`));
    });
  });
}
