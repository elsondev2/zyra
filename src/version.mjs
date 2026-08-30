import { readFileSync } from "node:fs";

const packageUrl = new URL("../package.json", import.meta.url);
const versionArguments = new Set(["--version", "-v", "version"]);

export function getZyraVersion() {
  const embeddedVersion = String(process.env.ZYRA_VERSION ?? "").trim();
  if (embeddedVersion) return embeddedVersion;
  const pkg = JSON.parse(readFileSync(packageUrl, "utf8"));
  const version = String(pkg.version ?? "").trim();
  if (!version) throw new Error("Zyra package version is missing");
  return version;
}

export function formatZyraVersion() {
  return `zyra ${getZyraVersion()}`;
}

export function isZyraVersionRequest(argv = []) {
  return argv.length === 1 && versionArguments.has(String(argv[0] ?? "").trim().toLowerCase());
}
