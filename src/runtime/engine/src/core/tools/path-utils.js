// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { accessSync, constants } from "node:fs";
import { access } from "node:fs/promises";
import { normalizePath, resolvePath } from "../../utils/paths.js";
const NARROW_NO_BREAK_SPACE = "\u202F";
function tryMacOSScreenshotPath(filePath) {
  return filePath.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`);
}
function tryNFDVariant(filePath) {
  return filePath.normalize("NFD");
}
function tryCurlyQuoteVariant(filePath) {
  return filePath.replace(/'/g, "\u2019");
}
function fileExists(filePath) {
  try {
    accessSync(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
async function pathExists(filePath) {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}
function expandPath(filePath) {
  return normalizePath(filePath, { normalizeUnicodeSpaces: true, stripAtPrefix: true });
}
function resolveToCwd(filePath, cwd) {
  return resolvePath(filePath, cwd, { normalizeUnicodeSpaces: true, stripAtPrefix: true });
}
function resolveReadPath(filePath, cwd) {
  const resolved = resolveToCwd(filePath, cwd);
  if (fileExists(resolved)) {
    return resolved;
  }
  const amPmVariant = tryMacOSScreenshotPath(resolved);
  if (amPmVariant !== resolved && fileExists(amPmVariant)) {
    return amPmVariant;
  }
  const nfdVariant = tryNFDVariant(resolved);
  if (nfdVariant !== resolved && fileExists(nfdVariant)) {
    return nfdVariant;
  }
  const curlyVariant = tryCurlyQuoteVariant(resolved);
  if (curlyVariant !== resolved && fileExists(curlyVariant)) {
    return curlyVariant;
  }
  const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
  if (nfdCurlyVariant !== resolved && fileExists(nfdCurlyVariant)) {
    return nfdCurlyVariant;
  }
  return resolved;
}
async function resolveReadPathAsync(filePath, cwd) {
  const resolved = resolveToCwd(filePath, cwd);
  if (await pathExists(resolved)) {
    return resolved;
  }
  const amPmVariant = tryMacOSScreenshotPath(resolved);
  if (amPmVariant !== resolved && await pathExists(amPmVariant)) {
    return amPmVariant;
  }
  const nfdVariant = tryNFDVariant(resolved);
  if (nfdVariant !== resolved && await pathExists(nfdVariant)) {
    return nfdVariant;
  }
  const curlyVariant = tryCurlyQuoteVariant(resolved);
  if (curlyVariant !== resolved && await pathExists(curlyVariant)) {
    return curlyVariant;
  }
  const nfdCurlyVariant = tryCurlyQuoteVariant(nfdVariant);
  if (nfdCurlyVariant !== resolved && await pathExists(nfdCurlyVariant)) {
    return nfdCurlyVariant;
  }
  return resolved;
}
export {
  expandPath,
  pathExists,
  resolveReadPath,
  resolveReadPathAsync,
  resolveToCwd
};
