// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { spawn } from "child_process";
import { readdirSync, statSync } from "fs";
import { homedir } from "os";
import { basename, dirname, join } from "path";
import { fuzzyFilter } from "./fuzzy.js";
const PATH_DELIMITERS = /* @__PURE__ */ new Set([" ", "	", '"', "'", "="]);
function toDisplayPath(value) {
  return value.replace(/\\/g, "/");
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildFdPathQuery(query) {
  const normalized = toDisplayPath(query);
  if (!normalized.includes("/")) {
    return normalized;
  }
  const hasTrailingSeparator = normalized.endsWith("/");
  const trimmed = normalized.replace(/^\/+|\/+$/g, "");
  if (!trimmed) {
    return normalized;
  }
  const separatorPattern = "[\\\\/]";
  const segments = trimmed.split("/").filter(Boolean).map((segment) => escapeRegex(segment));
  if (segments.length === 0) {
    return normalized;
  }
  let pattern = segments.join(separatorPattern);
  if (hasTrailingSeparator) {
    pattern += separatorPattern;
  }
  return pattern;
}
function findLastDelimiter(text) {
  for (let i = text.length - 1; i >= 0; i -= 1) {
    if (PATH_DELIMITERS.has(text[i] ?? "")) {
      return i;
    }
  }
  return -1;
}
function findUnclosedQuoteStart(text) {
  let inQuotes = false;
  let quoteStart = -1;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === '"') {
      inQuotes = !inQuotes;
      if (inQuotes) {
        quoteStart = i;
      }
    }
  }
  return inQuotes ? quoteStart : null;
}
function isTokenStart(text, index) {
  return index === 0 || PATH_DELIMITERS.has(text[index - 1] ?? "");
}
function extractQuotedPrefix(text) {
  const quoteStart = findUnclosedQuoteStart(text);
  if (quoteStart === null) {
    return null;
  }
  if (quoteStart > 0 && text[quoteStart - 1] === "@") {
    if (!isTokenStart(text, quoteStart - 1)) {
      return null;
    }
    return text.slice(quoteStart - 1);
  }
  if (!isTokenStart(text, quoteStart)) {
    return null;
  }
  return text.slice(quoteStart);
}
function parsePathPrefix(prefix) {
  if (prefix.startsWith('@"')) {
    return { rawPrefix: prefix.slice(2), isAtPrefix: true, isQuotedPrefix: true };
  }
  if (prefix.startsWith('"')) {
    return { rawPrefix: prefix.slice(1), isAtPrefix: false, isQuotedPrefix: true };
  }
  if (prefix.startsWith("@")) {
    return { rawPrefix: prefix.slice(1), isAtPrefix: true, isQuotedPrefix: false };
  }
  return { rawPrefix: prefix, isAtPrefix: false, isQuotedPrefix: false };
}
function buildCompletionValue(path, options) {
  const needsQuotes = options.isQuotedPrefix || path.includes(" ");
  const prefix = options.isAtPrefix ? "@" : "";
  if (!needsQuotes) {
    return `${prefix}${path}`;
  }
  const openQuote = `${prefix}"`;
  const closeQuote = '"';
  return `${openQuote}${path}${closeQuote}`;
}
async function walkDirectoryWithFd(baseDir, fdPath, query, maxResults, signal, maxDepth) {
  const args = [
    "--base-directory",
    baseDir,
    "--max-results",
    String(maxResults),
    "--type",
    "f",
    "--type",
    "d",
    "--follow",
    "--hidden",
    "--exclude",
    ".git",
    "--exclude",
    ".git/*",
    "--exclude",
    ".git/**"
  ];
  if (maxDepth !== void 0) {
    args.push("--max-depth", String(maxDepth));
  }
  if (toDisplayPath(query).includes("/")) {
    args.push("--full-path");
  }
  if (query) {
    args.push(buildFdPathQuery(query));
  }
  return await new Promise((resolve) => {
    if (signal.aborted) {
      resolve([]);
      return;
    }
    const child = spawn(fdPath, args, {
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let resolved = false;
    const finish = (results) => {
      if (resolved) return;
      resolved = true;
      signal.removeEventListener("abort", onAbort);
      resolve(results);
    };
    const onAbort = () => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    };
    signal.addEventListener("abort", onAbort, { once: true });
    child.stdout.setEncoding("utf-8");
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("error", () => {
      finish([]);
    });
    child.on("close", (code) => {
      if (signal.aborted || code !== 0 || !stdout) {
        finish([]);
        return;
      }
      const lines = stdout.trim().split("\n").filter(Boolean);
      const results = [];
      for (const line of lines) {
        const displayLine = toDisplayPath(line);
        const hasTrailingSeparator = displayLine.endsWith("/");
        const normalizedPath = hasTrailingSeparator ? displayLine.slice(0, -1) : displayLine;
        if (normalizedPath === ".git" || normalizedPath.startsWith(".git/") || normalizedPath.includes("/.git/")) {
          continue;
        }
        results.push({
          path: displayLine,
          isDirectory: hasTrailingSeparator
        });
      }
      finish(results);
    });
  });
}
class CombinedAutocompleteProvider {
  commands;
  basePath;
  fdPath;
  constructor(commands = [], basePath, fdPath = null) {
    this.commands = commands;
    this.basePath = basePath;
    this.fdPath = fdPath;
  }
  async getSuggestions(lines, cursorLine, cursorCol, options) {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);
    const atPrefix = this.extractAtPrefix(textBeforeCursor);
    if (atPrefix) {
      const { rawPrefix, isQuotedPrefix } = parsePathPrefix(atPrefix);
      const suggestions2 = await this.getFuzzyFileSuggestions(rawPrefix, {
        isQuotedPrefix,
        signal: options.signal
      });
      if (suggestions2.length === 0) return null;
      return {
        items: suggestions2,
        prefix: atPrefix
      };
    }
    if (!options.force && textBeforeCursor.startsWith("/")) {
      const spaceIndex = textBeforeCursor.indexOf(" ");
      if (spaceIndex === -1) {
        const prefix = textBeforeCursor.slice(1);
        const commandItems = this.commands.map((cmd) => {
          const name = "name" in cmd ? cmd.name : cmd.value;
          const hint = "argumentHint" in cmd && cmd.argumentHint ? cmd.argumentHint : void 0;
          const desc = cmd.description ?? "";
          const fullDesc = hint ? desc ? `${hint} \u2014 ${desc}` : hint : desc;
          return {
            name,
            label: name,
            description: fullDesc || void 0
          };
        });
        const filtered = fuzzyFilter(commandItems, prefix, (item) => item.name).map((item) => ({
          value: item.name,
          label: item.label,
          ...item.description && { description: item.description }
        }));
        if (filtered.length === 0) return null;
        return {
          items: filtered,
          prefix: textBeforeCursor
        };
      }
      const commandName = textBeforeCursor.slice(1, spaceIndex);
      const argumentText = textBeforeCursor.slice(spaceIndex + 1);
      const command = this.commands.find((cmd) => {
        const name = "name" in cmd ? cmd.name : cmd.value;
        return name === commandName;
      });
      if (!command || !("getArgumentCompletions" in command) || !command.getArgumentCompletions) {
        return null;
      }
      const argumentSuggestions = await command.getArgumentCompletions(argumentText);
      if (!Array.isArray(argumentSuggestions) || argumentSuggestions.length === 0) {
        return null;
      }
      return {
        items: argumentSuggestions,
        prefix: argumentText
      };
    }
    const pathMatch = this.extractPathPrefix(textBeforeCursor, options.force ?? false);
    if (pathMatch === null) {
      return null;
    }
    const suggestions = this.getFileSuggestions(pathMatch);
    if (suggestions.length === 0) return null;
    return {
      items: suggestions,
      prefix: pathMatch
    };
  }
  applyCompletion(lines, cursorLine, cursorCol, item, prefix) {
    const currentLine = lines[cursorLine] || "";
    const beforePrefix = currentLine.slice(0, cursorCol - prefix.length);
    const afterCursor = currentLine.slice(cursorCol);
    const isQuotedPrefix = prefix.startsWith('"') || prefix.startsWith('@"');
    const hasLeadingQuoteAfterCursor = afterCursor.startsWith('"');
    const hasTrailingQuoteInItem = item.value.endsWith('"');
    const adjustedAfterCursor = isQuotedPrefix && hasTrailingQuoteInItem && hasLeadingQuoteAfterCursor ? afterCursor.slice(1) : afterCursor;
    const isSlashCommand = prefix.startsWith("/") && beforePrefix.trim() === "" && !prefix.slice(1).includes("/");
    if (isSlashCommand) {
      const newLine2 = `${beforePrefix}/${item.value} ${adjustedAfterCursor}`;
      const newLines2 = [...lines];
      newLines2[cursorLine] = newLine2;
      return {
        lines: newLines2,
        cursorLine,
        cursorCol: beforePrefix.length + item.value.length + 2
        // +2 for "/" and space
      };
    }
    if (prefix.startsWith("@")) {
      const isDirectory2 = item.label.endsWith("/");
      const suffix = isDirectory2 ? "" : " ";
      const newLine2 = `${beforePrefix + item.value}${suffix}${adjustedAfterCursor}`;
      const newLines2 = [...lines];
      newLines2[cursorLine] = newLine2;
      const hasTrailingQuote2 = item.value.endsWith('"');
      const cursorOffset2 = isDirectory2 && hasTrailingQuote2 ? item.value.length - 1 : item.value.length;
      return {
        lines: newLines2,
        cursorLine,
        cursorCol: beforePrefix.length + cursorOffset2 + suffix.length
      };
    }
    const textBeforeCursor = currentLine.slice(0, cursorCol);
    if (textBeforeCursor.includes("/") && textBeforeCursor.includes(" ")) {
      const newLine2 = beforePrefix + item.value + adjustedAfterCursor;
      const newLines2 = [...lines];
      newLines2[cursorLine] = newLine2;
      const isDirectory2 = item.label.endsWith("/");
      const hasTrailingQuote2 = item.value.endsWith('"');
      const cursorOffset2 = isDirectory2 && hasTrailingQuote2 ? item.value.length - 1 : item.value.length;
      return {
        lines: newLines2,
        cursorLine,
        cursorCol: beforePrefix.length + cursorOffset2
      };
    }
    const newLine = beforePrefix + item.value + adjustedAfterCursor;
    const newLines = [...lines];
    newLines[cursorLine] = newLine;
    const isDirectory = item.label.endsWith("/");
    const hasTrailingQuote = item.value.endsWith('"');
    const cursorOffset = isDirectory && hasTrailingQuote ? item.value.length - 1 : item.value.length;
    return {
      lines: newLines,
      cursorLine,
      cursorCol: beforePrefix.length + cursorOffset
    };
  }
  // Extract @ prefix for fuzzy file suggestions
  extractAtPrefix(text) {
    const quotedPrefix = extractQuotedPrefix(text);
    if (quotedPrefix?.startsWith('@"')) {
      return quotedPrefix;
    }
    const lastDelimiterIndex = findLastDelimiter(text);
    const tokenStart = lastDelimiterIndex === -1 ? 0 : lastDelimiterIndex + 1;
    if (text[tokenStart] === "@") {
      return text.slice(tokenStart);
    }
    return null;
  }
  // Extract a path-like prefix from the text before cursor
  extractPathPrefix(text, forceExtract = false) {
    const quotedPrefix = extractQuotedPrefix(text);
    if (quotedPrefix) {
      return quotedPrefix;
    }
    const lastDelimiterIndex = findLastDelimiter(text);
    const pathPrefix = lastDelimiterIndex === -1 ? text : text.slice(lastDelimiterIndex + 1);
    if (forceExtract) {
      return pathPrefix;
    }
    if (pathPrefix.includes("/") || pathPrefix.startsWith(".") || pathPrefix.startsWith("~/")) {
      return pathPrefix;
    }
    if (pathPrefix === "" && text.endsWith(" ")) {
      return pathPrefix;
    }
    return null;
  }
  // Expand home directory (~/) to actual home path
  expandHomePath(path) {
    if (path.startsWith("~/")) {
      const expandedPath = join(homedir(), path.slice(2));
      return path.endsWith("/") && !expandedPath.endsWith("/") ? `${expandedPath}/` : expandedPath;
    } else if (path === "~") {
      return homedir();
    }
    return path;
  }
  resolveScopedFuzzyQuery(rawQuery) {
    const normalizedQuery = toDisplayPath(rawQuery);
    const slashIndex = normalizedQuery.lastIndexOf("/");
    if (slashIndex === -1) {
      return null;
    }
    const displayBase = normalizedQuery.slice(0, slashIndex + 1);
    const query = normalizedQuery.slice(slashIndex + 1);
    let baseDir;
    if (displayBase.startsWith("~/")) {
      baseDir = this.expandHomePath(displayBase);
    } else if (displayBase.startsWith("/")) {
      baseDir = displayBase;
    } else {
      baseDir = join(this.basePath, displayBase);
    }
    try {
      if (!statSync(baseDir).isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }
    return { baseDir, query, displayBase };
  }
  scopedPathForDisplay(displayBase, relativePath) {
    const normalizedRelativePath = toDisplayPath(relativePath);
    if (displayBase === "/") {
      return `/${normalizedRelativePath}`;
    }
    return `${toDisplayPath(displayBase)}${normalizedRelativePath}`;
  }
  // Get file/directory suggestions for a given path prefix
  getFileSuggestions(prefix) {
    try {
      let searchDir;
      let searchPrefix;
      const { rawPrefix, isAtPrefix, isQuotedPrefix } = parsePathPrefix(prefix);
      let expandedPrefix = rawPrefix;
      if (expandedPrefix.startsWith("~")) {
        expandedPrefix = this.expandHomePath(expandedPrefix);
      }
      const isRootPrefix = rawPrefix === "" || rawPrefix === "./" || rawPrefix === "../" || rawPrefix === "~" || rawPrefix === "~/" || rawPrefix === "/" || isAtPrefix && rawPrefix === "";
      if (isRootPrefix) {
        if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) {
          searchDir = expandedPrefix;
        } else {
          searchDir = join(this.basePath, expandedPrefix);
        }
        searchPrefix = "";
      } else if (rawPrefix.endsWith("/")) {
        if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) {
          searchDir = expandedPrefix;
        } else {
          searchDir = join(this.basePath, expandedPrefix);
        }
        searchPrefix = "";
      } else {
        const dir = dirname(expandedPrefix);
        const file = basename(expandedPrefix);
        if (rawPrefix.startsWith("~") || expandedPrefix.startsWith("/")) {
          searchDir = dir;
        } else {
          searchDir = join(this.basePath, dir);
        }
        searchPrefix = file;
      }
      const entries = readdirSync(searchDir, { withFileTypes: true });
      const suggestions = [];
      for (const entry of entries) {
        if (!entry.name.toLowerCase().startsWith(searchPrefix.toLowerCase())) {
          continue;
        }
        let isDirectory = entry.isDirectory();
        if (!isDirectory && entry.isSymbolicLink()) {
          try {
            const fullPath = join(searchDir, entry.name);
            isDirectory = statSync(fullPath).isDirectory();
          } catch {
          }
        }
        let relativePath;
        const name = entry.name;
        const displayPrefix = rawPrefix;
        if (displayPrefix.endsWith("/")) {
          relativePath = displayPrefix + name;
        } else if (displayPrefix.includes("/") || displayPrefix.includes("\\")) {
          if (displayPrefix.startsWith("~/")) {
            const homeRelativeDir = displayPrefix.slice(2);
            const dir = dirname(homeRelativeDir);
            relativePath = `~/${dir === "." ? name : join(dir, name)}`;
          } else if (displayPrefix.startsWith("/")) {
            const dir = dirname(displayPrefix);
            if (dir === "/") {
              relativePath = `/${name}`;
            } else {
              relativePath = `${dir}/${name}`;
            }
          } else {
            relativePath = join(dirname(displayPrefix), name);
            if (displayPrefix.startsWith("./") && !relativePath.startsWith("./")) {
              relativePath = `./${relativePath}`;
            }
          }
        } else {
          if (displayPrefix.startsWith("~")) {
            relativePath = `~/${name}`;
          } else {
            relativePath = name;
          }
        }
        relativePath = toDisplayPath(relativePath);
        const pathValue = isDirectory ? `${relativePath}/` : relativePath;
        const value = buildCompletionValue(pathValue, {
          isDirectory,
          isAtPrefix,
          isQuotedPrefix
        });
        suggestions.push({
          value,
          label: name + (isDirectory ? "/" : "")
        });
      }
      suggestions.sort((a, b) => {
        const aIsDir = a.value.endsWith("/");
        const bIsDir = b.value.endsWith("/");
        if (aIsDir && !bIsDir) return -1;
        if (!aIsDir && bIsDir) return 1;
        return a.label.localeCompare(b.label);
      });
      return suggestions;
    } catch (_e) {
      return [];
    }
  }
  // Score an entry against the query (higher = better match)
  // isDirectory adds bonus to prioritize folders
  scoreEntry(filePath, query, isDirectory) {
    const fileName = basename(filePath);
    const lowerFileName = fileName.toLowerCase();
    const lowerQuery = query.toLowerCase();
    let score = 0;
    if (lowerFileName === lowerQuery) score = 100;
    else if (lowerFileName.startsWith(lowerQuery)) score = 80;
    else if (lowerFileName.includes(lowerQuery)) score = 50;
    else if (filePath.toLowerCase().includes(lowerQuery)) score = 30;
    if (isDirectory && score > 0) score += 10;
    return score;
  }
  async getBaseDirSuggestions(baseDir, query, signal) {
    if (!this.fdPath || signal.aborted) {
      return [];
    }
    return await walkDirectoryWithFd(baseDir, this.fdPath, query, 100, signal, 1);
  }
  // Fuzzy file search using fd (fast, respects .gitignore)
  async getFuzzyFileSuggestions(query, options) {
    if (!this.fdPath || options.signal.aborted) {
      return [];
    }
    try {
      const scopedQuery = this.resolveScopedFuzzyQuery(query);
      const fdBaseDir = scopedQuery?.baseDir ?? this.basePath;
      const fdQuery = scopedQuery?.query ?? query;
      const baseDirEntries = await this.getBaseDirSuggestions(fdBaseDir, fdQuery, options.signal);
      const recursiveEntries = await walkDirectoryWithFd(fdBaseDir, this.fdPath, fdQuery, 100, options.signal);
      const seenPaths = new Set(baseDirEntries.map((entry) => entry.path));
      const entries = [
        ...baseDirEntries,
        ...recursiveEntries.filter((entry) => {
          if (seenPaths.has(entry.path)) return false;
          seenPaths.add(entry.path);
          return true;
        })
      ];
      if (options.signal.aborted) {
        return [];
      }
      const scoredEntries = entries.map((entry) => ({
        ...entry,
        score: fdQuery ? this.scoreEntry(entry.path, fdQuery, entry.isDirectory) : 1
      })).filter((entry) => entry.score > 0);
      scoredEntries.sort((a, b) => {
        const scoreDiff = b.score - a.score;
        if (scoreDiff !== 0) return scoreDiff;
        const aDepth = toDisplayPath(a.path).split("/").filter(Boolean).length;
        const bDepth = toDisplayPath(b.path).split("/").filter(Boolean).length;
        const depthDiff = aDepth - bDepth;
        if (depthDiff !== 0) return depthDiff;
        const lengthDiff = a.path.length - b.path.length;
        if (lengthDiff !== 0) return lengthDiff;
        return a.path.localeCompare(b.path);
      });
      const topEntries = scoredEntries.slice(0, 20);
      const suggestions = [];
      for (const { path: entryPath, isDirectory } of topEntries) {
        const pathWithoutSlash = isDirectory ? entryPath.slice(0, -1) : entryPath;
        const displayPath = scopedQuery ? this.scopedPathForDisplay(scopedQuery.displayBase, pathWithoutSlash) : pathWithoutSlash;
        const entryName = basename(pathWithoutSlash);
        const completionPath = isDirectory ? `${displayPath}/` : displayPath;
        const value = buildCompletionValue(completionPath, {
          isDirectory,
          isAtPrefix: true,
          isQuotedPrefix: options.isQuotedPrefix
        });
        suggestions.push({
          value,
          label: entryName + (isDirectory ? "/" : ""),
          description: displayPath
        });
      }
      return suggestions;
    } catch {
      return [];
    }
  }
  // Check if we should trigger file completion (called on Tab key)
  shouldTriggerFileCompletion(lines, cursorLine, cursorCol) {
    const currentLine = lines[cursorLine] || "";
    const textBeforeCursor = currentLine.slice(0, cursorCol);
    if (textBeforeCursor.trim().startsWith("/") && !textBeforeCursor.trim().includes(" ")) {
      return false;
    }
    return true;
  }
}
export {
  CombinedAutocompleteProvider
};
