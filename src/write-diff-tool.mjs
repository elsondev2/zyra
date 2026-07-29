import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ZYRA_WRITE_SNAPSHOT_MAX_BYTES = 512 * 1024;
export const ZYRA_WRITE_SNAPSHOT_MAX_LINES = 12_000;

const UNICODE_SPACES = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

function normalizePiPath(input, options = {}) {
  let normalized = String(input);
  if (options.normalizeUnicodeSpaces) normalized = normalized.replace(UNICODE_SPACES, " ");
  if (options.stripAtPrefix && normalized.startsWith("@")) normalized = normalized.slice(1);

  const home = options.homeDir ?? homedir();
  if (normalized === "~") normalized = home;
  else if (normalized.startsWith("~/") || (process.platform === "win32" && normalized.startsWith("~\\"))) {
    normalized = path.join(home, normalized.slice(2));
  }

  if (/^file:\/\//.test(normalized)) return fileURLToPath(normalized);
  return normalized;
}

export function resolveZyraWritePath(cwd, targetPath, options = {}) {
  const normalized = normalizePiPath(targetPath, {
    homeDir: options.homeDir,
    normalizeUnicodeSpaces: true,
    stripAtPrefix: true,
  });
  const normalizedCwd = normalizePiPath(cwd, { homeDir: options.homeDir });
  return path.isAbsolute(normalized) ? path.resolve(normalized) : path.resolve(normalizedCwd, normalized);
}

function detectLineEnding(text) {
  return text.includes("\r\n") ? "crlf" : "lf";
}

function isBinary(buffer) {
  return buffer.includes(0);
}

function lineCount(text) {
  return text ? text.replace(/\r\n/g, "\n").split("\n").length : 0;
}

async function captureSnapshot(absolutePath) {
  try {
    await access(absolutePath, fsConstants.F_OK);
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return { exists: false, text: "", lineEnding: "lf" };
    }
    return { exists: undefined, unavailableReason: "snapshot-failed" };
  }

  try {
    const buffer = await readFile(absolutePath);
    if (buffer.byteLength > ZYRA_WRITE_SNAPSHOT_MAX_BYTES) {
      return { exists: true, unavailableReason: "too-large", size: buffer.byteLength };
    }
    if (isBinary(buffer)) {
      return { exists: true, unavailableReason: "binary", size: buffer.byteLength };
    }
    const text = buffer.toString("utf8");
    if (lineCount(text) > ZYRA_WRITE_SNAPSHOT_MAX_LINES) {
      return { exists: true, unavailableReason: "too-large", size: buffer.byteLength };
    }
    return {
      exists: true,
      text,
      lineEnding: detectLineEnding(text),
      size: buffer.byteLength,
    };
  } catch {
    return { exists: true, unavailableReason: "snapshot-failed" };
  }
}

function fallbackAddHunk(content) {
  const text = String(content);
  if (!text) return "";
  const hasTrailingNewline = text.endsWith("\n");
  const lines = text.split("\n");
  if (hasTrailingNewline) lines.pop();
  const range = lines.length === 1 ? "+1" : `+1,${lines.length}`;
  const additions = lines.map((line) => `+${line}\n`).join("");
  return `@@ -0,0 ${range} @@\n${additions}${hasTrailingNewline ? "" : "\\ No newline at end of file\n"}`;
}

function generateAddPatch(filePath, content, generateUnifiedPatch) {
  const normalizedPath = String(filePath).replace(/\\/g, "/").replace(/^\.\//, "");
  const generated = typeof generateUnifiedPatch === "function"
    ? generateUnifiedPatch(normalizedPath, "", String(content))
    : undefined;
  const hunkStart = generated?.indexOf("@@");
  const hunk = hunkStart >= 0 ? generated.slice(hunkStart) : fallbackAddHunk(content);
  return [
    `diff --git a/${normalizedPath} b/${normalizedPath}`,
    "new file mode 100644",
    "--- /dev/null",
    `+++ b/${normalizedPath}`,
    hunk,
  ].join("\n");
}

function fallbackDisplayDiff(before, after) {
  const beforeLines = String(before).replace(/\r\n/g, "\n").split("\n");
  const afterLines = String(after).replace(/\r\n/g, "\n").split("\n");
  return [
    ...beforeLines.map((line) => `- ${line}`),
    ...afterLines.map((line) => `+ ${line}`),
  ].join("\n");
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("Operation aborted");
}

export function createZyraWriteTool(options) {
  const {
    cwd,
    createWriteTool,
    withFileMutationQueue,
    generateUnifiedPatch,
    generateDiffString,
  } = options;
  if (typeof createWriteTool !== "function" || typeof withFileMutationQueue !== "function") {
    throw new TypeError("Zyra write enrichment requires Pi's public write tool and file mutation queue factories.");
  }
  const original = createWriteTool(cwd);

  return {
    name: "write",
    label: original.label ?? "write",
    description: original.description,
    promptSnippet: original.promptSnippet,
    promptGuidelines: original.promptGuidelines,
    parameters: original.parameters,
    async execute(_toolCallId, params, signal) {
      const targetPath = String(params?.path ?? "");
      const content = typeof params?.content === "string" ? params.content : "";
      const normalizedTargetPath = normalizePiPath(targetPath, {
        normalizeUnicodeSpaces: true,
        stripAtPrefix: true,
      });
      const absolutePath = resolveZyraWritePath(cwd, targetPath);
      return withFileMutationQueue(absolutePath, async () => {
        throwIfAborted(signal);
        const snapshot = await captureSnapshot(absolutePath);
        throwIfAborted(signal);
        await mkdir(path.dirname(absolutePath), { recursive: true });
        throwIfAborted(signal);
        await writeFile(absolutePath, content, "utf8");
        throwIfAborted(signal);

        const afterTooLarge = Buffer.byteLength(content, "utf8") > ZYRA_WRITE_SNAPSHOT_MAX_BYTES
          || lineCount(content) > ZYRA_WRITE_SNAPSHOT_MAX_LINES;
        const afterBinary = content.includes("\0");
        const unavailableReason = snapshot.unavailableReason
          ?? (afterTooLarge ? "too-large" : afterBinary ? "binary" : undefined);
        let patch;
        let diff;
        if (!unavailableReason && snapshot.exists === false) {
          patch = generateAddPatch(normalizedTargetPath, content, generateUnifiedPatch);
          diff = typeof generateDiffString === "function"
            ? generateDiffString("", content)?.diff
            : fallbackDisplayDiff("", content);
        } else if (!unavailableReason && snapshot.exists === true) {
          patch = typeof generateUnifiedPatch === "function"
            ? generateUnifiedPatch(normalizedTargetPath, snapshot.text, content)
            : undefined;
          diff = typeof generateDiffString === "function"
            ? generateDiffString(snapshot.text, content)?.diff
            : fallbackDisplayDiff(snapshot.text, content);
        }

        const kind = snapshot.exists === false ? "add" : "update";
        return {
          content: [{ type: "text", text: `Successfully wrote ${content.length} bytes to ${targetPath}` }],
          details: {
            source: patch ? "synthetic-snapshot" : "args-preview",
            snapshotBacked: Boolean(patch),
            authoritative: Boolean(patch),
            path: normalizedTargetPath,
            paths: [normalizedTargetPath],
            changes: [{ path: normalizedTargetPath, kind, diff: patch, isNew: kind === "add" }],
            patch,
            diff,
            previousSize: snapshot.size,
            size: Buffer.byteLength(content, "utf8"),
            lineEnding: snapshot.lineEnding,
            diffUnavailableReason: unavailableReason,
            truncated: unavailableReason === "too-large" || undefined,
          },
        };
      });
    },
  };
}
