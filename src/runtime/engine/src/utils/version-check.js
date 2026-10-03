// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { compare, valid } from "semver";
import { fetchWithRetry } from "./management-http.js";
import { getZyraUserAgent } from "./zyra-user-agent.js";
const LATEST_VERSION_URL = process.env.ZYRA_RUNTIME_RELEASE_URL;
const DEFAULT_VERSION_CHECK_TIMEOUT_MS = 1e4;
function formatVersionCheckError(error) {
  const rootMessage = error instanceof Error && error.message ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : void 0;
  const causes = cause instanceof AggregateError ? cause.errors : cause === void 0 ? [] : [cause];
  const codes = causes.map(
    (value) => typeof value === "object" && value !== null && "code" in value && typeof value.code === "string" ? value.code : void 0
  ).filter((code) => code !== void 0);
  if (codes.length > 0) return `${rootMessage} (${[...new Set(codes)].join(", ")})`;
  const causeMessage = causes.find(
    (value) => value instanceof Error && Boolean(value.message)
  )?.message;
  return causeMessage ? `${rootMessage} (cause: ${causeMessage})` : rootMessage;
}
function comparePackageVersions(leftVersion, rightVersion) {
  const left = valid(leftVersion.trim());
  const right = valid(rightVersion.trim());
  if (!left || !right) {
    return void 0;
  }
  return compare(left, right);
}
function isNewerPackageVersion(candidateVersion, currentVersion) {
  const comparison = comparePackageVersions(candidateVersion, currentVersion);
  if (comparison !== void 0) {
    return comparison > 0;
  }
  return candidateVersion.trim() !== currentVersion.trim();
}
async function getLatestZyraRelease(currentVersion, options = {}) {
  if (process.env.ZYRA_OFFLINE || !LATEST_VERSION_URL) return void 0;
  const response = await fetchWithRetry(
    LATEST_VERSION_URL,
    {
      headers: {
        "User-Agent": getZyraUserAgent(currentVersion),
        accept: "application/json"
      }
    },
    {
      maxRetries: options.retry ? 2 : 0,
      timeoutMs: options.timeoutMs ?? DEFAULT_VERSION_CHECK_TIMEOUT_MS
    }
  );
  if (!response.ok) return void 0;
  const data = await response.json();
  if (typeof data.version !== "string" || !data.version.trim()) {
    return void 0;
  }
  const packageName = typeof data.packageName === "string" && data.packageName.trim() ? data.packageName.trim() : void 0;
  const note = typeof data.note === "string" && data.note.trim() ? data.note.trim() : void 0;
  return {
    version: data.version.trim(),
    packageName,
    ...note ? { note } : {}
  };
}
async function getLatestZyraVersion(currentVersion, options = {}) {
  return (await getLatestZyraRelease(currentVersion, options))?.version;
}
async function checkForNewZyraVersion(currentVersion) {
  if (process.env.ZYRA_SKIP_VERSION_CHECK) return void 0;
  try {
    const latestRelease = await getLatestZyraRelease(currentVersion);
    if (latestRelease && isNewerPackageVersion(latestRelease.version, currentVersion)) {
      return latestRelease;
    }
    return void 0;
  } catch {
    return void 0;
  }
}
export {
  checkForNewZyraVersion,
  comparePackageVersions,
  formatVersionCheckError,
  getLatestZyraRelease,
  getLatestZyraVersion,
  isNewerPackageVersion
};
