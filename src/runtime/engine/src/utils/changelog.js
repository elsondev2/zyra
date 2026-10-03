// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import path from "node:path";
import { existsSync, readFileSync } from "fs";
const GITHUB_REPO = "earendil-works/pi";
const CHANGELOG_LINK_BASE_PATH = "packages/coding-agent";
const LEGACY_REPO_RE = /^https:\/\/github\.com\/(?:badlogic|earendil-works)\/pi-mono(?=\/|$)/;
const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i;
const INLINE_MARKDOWN_LINK_RE = /(!?\[[^\]\n]+\]\()([^\s)]+)((?:\s+[^)]*)?\))/g;
function entryVersion(entry) {
  return `${entry.major}.${entry.minor}.${entry.patch}`;
}
function normalizeTag(version) {
  const versionString = typeof version === "string" ? version : entryVersion(version);
  return versionString.startsWith("v") ? versionString : `v${versionString}`;
}
function splitLocalTarget(target) {
  const hashIndex = target.indexOf("#");
  const beforeHash = hashIndex === -1 ? target : target.slice(0, hashIndex);
  const fragment = hashIndex === -1 ? "" : target.slice(hashIndex);
  const queryIndex = beforeHash.indexOf("?");
  if (queryIndex === -1) {
    return { fragment, pathPart: beforeHash, query: "" };
  }
  return {
    fragment,
    pathPart: beforeHash.slice(0, queryIndex),
    query: beforeHash.slice(queryIndex)
  };
}
function normalizePathPart(value) {
  return value.replaceAll("\\", "/");
}
function resolveRepositoryPath(targetPath) {
  const normalizedTarget = normalizePathPart(targetPath);
  const joined = normalizedTarget.startsWith("/") ? path.posix.normalize(normalizedTarget.replace(/^\/+/, "")) : path.posix.normalize(path.posix.join(CHANGELOG_LINK_BASE_PATH, normalizedTarget));
  if (joined === "." || joined.startsWith("../") || joined === "..") {
    return void 0;
  }
  return joined;
}
function isDirectoryTarget(originalPath, repositoryPath) {
  if (originalPath.endsWith("/")) {
    return true;
  }
  const basename = path.posix.basename(repositoryPath);
  return !basename.includes(".");
}
function normalizeChangelogLinkTarget(target, tag) {
  let canonicalTarget = target.replace(LEGACY_REPO_RE, `https://github.com/${GITHUB_REPO}`);
  const repoUrl = `https://github.com/${GITHUB_REPO}`;
  for (const route2 of ["blob", "tree"]) {
    for (const branch of ["main", "master"]) {
      const floatingRefPrefix = `${repoUrl}/${route2}/${branch}/`;
      if (canonicalTarget.startsWith(floatingRefPrefix)) {
        canonicalTarget = `${repoUrl}/${route2}/${tag}/${canonicalTarget.slice(floatingRefPrefix.length)}`;
      }
    }
  }
  if (canonicalTarget.startsWith("#") || canonicalTarget.startsWith("//") || URL_SCHEME_RE.test(canonicalTarget)) {
    return canonicalTarget;
  }
  const { fragment, pathPart, query } = splitLocalTarget(canonicalTarget);
  if (!pathPart) {
    return canonicalTarget;
  }
  const repositoryPath = resolveRepositoryPath(pathPart);
  if (!repositoryPath) {
    return canonicalTarget;
  }
  const route = isDirectoryTarget(pathPart, repositoryPath) ? "tree" : "blob";
  return `https://github.com/${GITHUB_REPO}/${route}/${tag}/${encodeURI(repositoryPath)}${query}${fragment}`;
}
function normalizeChangelogLinks(markdown, version) {
  const tag = normalizeTag(version);
  return markdown.replace(INLINE_MARKDOWN_LINK_RE, (_match, prefix, target, suffix) => {
    return `${prefix}${normalizeChangelogLinkTarget(target, tag)}${suffix}`;
  });
}
function parseChangelog(changelogPath) {
  if (!existsSync(changelogPath)) {
    return [];
  }
  try {
    const content = readFileSync(changelogPath, "utf-8");
    const lines = content.split("\n");
    const entries = [];
    let currentLines = [];
    let currentVersion = null;
    for (const line of lines) {
      if (line.startsWith("## ")) {
        if (currentVersion && currentLines.length > 0) {
          entries.push({
            ...currentVersion,
            content: currentLines.join("\n").trim()
          });
        }
        const versionMatch = line.match(/##\s+\[?(\d+)\.(\d+)\.(\d+)\]?/);
        if (versionMatch) {
          currentVersion = {
            major: Number.parseInt(versionMatch[1], 10),
            minor: Number.parseInt(versionMatch[2], 10),
            patch: Number.parseInt(versionMatch[3], 10)
          };
          currentLines = [line];
        } else {
          currentVersion = null;
          currentLines = [];
        }
      } else if (currentVersion) {
        currentLines.push(line);
      }
    }
    if (currentVersion && currentLines.length > 0) {
      entries.push({
        ...currentVersion,
        content: currentLines.join("\n").trim()
      });
    }
    return entries;
  } catch (error) {
    console.error(`Warning: Could not parse changelog: ${error}`);
    return [];
  }
}
function compareVersions(v1, v2) {
  if (v1.major !== v2.major) return v1.major - v2.major;
  if (v1.minor !== v2.minor) return v1.minor - v2.minor;
  return v1.patch - v2.patch;
}
function getNewEntries(entries, lastVersion) {
  const parts = lastVersion.split(".").map(Number);
  const last = {
    major: parts[0] || 0,
    minor: parts[1] || 0,
    patch: parts[2] || 0,
    content: ""
  };
  return entries.filter((entry) => compareVersions(entry, last) > 0);
}
import { getChangelogPath } from "../config.js";
export {
  compareVersions,
  getChangelogPath,
  getNewEntries,
  normalizeChangelogLinks,
  parseChangelog
};
