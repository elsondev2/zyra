import path from "node:path";
import { existsSync, lstatSync, realpathSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;
const NARROW_NO_BREAK_SPACE = "\u202F";

export function resolvePermissionPath(value, project, toolName) {
  const resolved = resolveZyraPath(value, project);
  return toolName === "read" ? resolveZyraReadPath(resolved) : resolved;
}

function resolveZyraPath(value, baseDirectory) {
  return path.resolve(normalizeZyraPath(baseDirectory), normalizeZyraPath(value));
}

function normalizeZyraPath(value) {
  if (typeof value !== "string") throw new TypeError("Filesystem path must be a string.");
  let normalized = value.replace(UNICODE_SPACES, " ");
  if (normalized.startsWith("@")) normalized = normalized.slice(1);
  if (process.platform === "win32") normalized = normalizeWindowsShellPath(normalized);
  const homeDirectory = os.homedir();
  if (normalized === "~") return homeDirectory;
  if (normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\"))) {
    return path.join(homeDirectory, normalized.slice(2));
  }
  if (/^file:\/\//.test(normalized)) return fileURLToPath(normalized);
  return normalized;
}

function normalizeWindowsShellPath(value) {
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return value;
  const match = value.match(/^\/(?:mnt\/|cygdrive\/)?([a-z])(?:\/(.*))?$/i);
  if (!match) return value;
  const suffix = match[2]?.replaceAll("/", "\\");
  return `${match[1].toUpperCase()}:\\${suffix ?? ""}`;
}

function resolveZyraReadPath(resolved) {
  if (existsSync(resolved)) return resolved;
  const nfd = resolved.normalize("NFD");
  const variants = [
    resolved.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`),
    nfd,
    resolved.replace(/'/g, "\u2019"),
    nfd.replace(/'/g, "\u2019"),
  ];
  return variants.find((candidate) => candidate !== resolved && existsSync(candidate)) ?? resolved;
}

export function canonicalPermissionPath(value) {
  let ancestor = path.resolve(value);
  const suffix = [];
  for (;;) {
    try {
      return path.join(realpathSync.native(ancestor), ...suffix);
    } catch (error) {
      if (error.code !== "ENOENT") return null;
      // A dangling link is not a new path component. Never authorize it by
      // falling back to its lexical parent. Fail closed on inaccessible paths.
      try {
        lstatSync(ancestor);
        return null;
      } catch (statError) {
        if (statError.code !== "ENOENT") return null;
      }
      const parent = path.dirname(ancestor);
      if (parent === ancestor) return null;
      suffix.unshift(path.basename(ancestor));
      ancestor = parent;
    }
  }
}
