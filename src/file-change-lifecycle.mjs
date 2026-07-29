const MAX_PATCH_BYTES = 512 * 1024;
const MAX_PATCH_LINES = 12_000;

function record(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function stringValue(source, keys) {
  if (!source) return undefined;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return undefined;
}

function normalizeToolName(value) {
  return String(value ?? "tool").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizePath(value) {
  return String(value ?? "").trim().replace(/\\/g, "/").replace(/^\.\//, "");
}

function unique(values) {
  return [...new Set(values.map(normalizePath).filter((value) => value && value !== "/dev/null"))];
}

function pathsFromChanges(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    const change = record(entry);
    const kind = record(change?.kind);
    return [
      stringValue(change, ["path", "filePath", "file_path"]),
      stringValue(change, ["previousPath", "previous_path"]),
      stringValue(kind, ["movePath", "move_path"]),
    ].filter(Boolean);
  });
}

function readPaths(args, result, partialResult) {
  const details = record(result?.details) ?? record(record(partialResult)?.details);
  const values = [
    stringValue(args, ["path", "filePath", "file_path", "targetPath", "target_path"]),
    stringValue(result, ["path", "filePath", "file_path", "targetPath", "target_path"]),
    stringValue(details, ["path", "filePath", "file_path", "targetPath", "target_path"]),
    ...(Array.isArray(args?.paths) ? args.paths : []),
    ...(Array.isArray(result?.paths) ? result.paths : []),
    ...(Array.isArray(details?.paths) ? details.paths : []),
    ...pathsFromChanges(details?.changes),
  ];
  return unique(values);
}

function prefixLines(value, prefix) {
  return String(value ?? "").replace(/\r\n/g, "\n").split("\n").map((line) => `${prefix}${line}`).join("\n");
}

function argumentPreviewPatch(toolName, args) {
  const path = stringValue(args, ["path", "filePath", "file_path", "targetPath", "target_path"]);
  if (!path) return undefined;
  const normalizedPath = normalizePath(path);
  const oldText = stringValue(args, ["oldString", "old_string", "oldText", "old_text", "oldStr", "old_str", "from", "before"]);
  const newText = stringValue(args, ["newString", "new_string", "newText", "new_text", "newStr", "new_str", "to", "after"]);
  if (oldText !== undefined && newText !== undefined) {
    const oldLines = oldText.replace(/\r\n/g, "\n").split("\n").length;
    const newLines = newText.replace(/\r\n/g, "\n").split("\n").length;
    return [
      `--- a/${normalizedPath}`,
      `+++ b/${normalizedPath}`,
      `@@ -1,${oldLines} +1,${newLines} @@`,
      prefixLines(oldText, "-"),
      prefixLines(newText, "+"),
    ].join("\n");
  }
  const explicit = stringValue(args, ["patch", "diff"]);
  if (explicit) return explicit;
  const content = stringValue(args, ["content", "fileContent", "file_content", "text", "body"]);
  if (content === undefined) return undefined;
  const lines = content.replace(/\r\n/g, "\n").split("\n").length;
  return [
    "--- /dev/null",
    `+++ b/${normalizedPath}`,
    `@@ -0,0 +1,${lines} @@`,
    prefixLines(content, "+"),
  ].join("\n");
}

function boundText(value) {
  if (typeof value !== "string" || !value.trim()) return { text: undefined, truncated: false };
  const lines = value.replace(/\r\n/g, "\n").split("\n");
  let text = lines.length > MAX_PATCH_LINES ? lines.slice(0, MAX_PATCH_LINES).join("\n") : value;
  let truncated = lines.length > MAX_PATCH_LINES;
  const encoder = new TextEncoder();
  if (encoder.encode(text).byteLength > MAX_PATCH_BYTES) {
    let low = 0;
    let high = text.length;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (encoder.encode(text.slice(0, middle)).byteLength <= MAX_PATCH_BYTES) low = middle;
      else high = middle - 1;
    }
    text = text.slice(0, low);
    truncated = true;
  }
  if (truncated) text = `${text.replace(/\s+$/, "")}\n… diff truncated by Zyra …`;
  return { text, truncated };
}

function patchStats(value) {
  let additions = 0;
  let deletions = 0;
  for (const line of String(value ?? "").split(/\r?\n/)) {
    if (line.startsWith("+") && !line.startsWith("+++")) additions += 1;
    if (line.startsWith("-") && !line.startsWith("---")) deletions += 1;
  }
  return { additions, deletions };
}

export function isFileChangeToolState(toolState = {}) {
  const args = record(toolState.args ?? toolState.arguments);
  const name = normalizeToolName(toolState.toolName ?? toolState.name);
  if (/\b(edit|write|patch|replace|append|create|delete|move|rename)\b/.test(name) && !/\bthread\b/.test(name)) return true;
  return Boolean(stringValue(args, [
    "oldString", "old_string", "oldText", "old_text", "newString", "new_string", "newText", "new_text",
    "content", "fileContent", "file_content", "patch", "diff",
  ]));
}

export function normalizeToolFileChangeState(toolState = {}) {
  if (!isFileChangeToolState(toolState)) return undefined;
  const args = record(toolState.args ?? toolState.arguments);
  const result = record(toolState.result);
  const partialResult = toolState.partialResult;
  const resultDetails = record(result?.details);
  const partialDetails = record(record(partialResult)?.details);
  const details = resultDetails ?? partialDetails;
  const resultPatch = stringValue(resultDetails, ["patch"]) ?? stringValue(partialDetails, ["patch"]);
  const resultDiff = stringValue(resultDetails, ["diff"]) ?? stringValue(partialDetails, ["diff"]);
  const preview = argumentPreviewPatch(toolState.toolName ?? toolState.name, args);
  const state = toolState.isError || toolState.state === "error"
    ? "failed"
    : toolState.state === "done"
      ? "completed"
      : "running";
  const synthetic = (details?.source === "synthetic-snapshot" || details?.snapshotBacked === true)
    && Boolean(resultPatch || resultDiff);
  const unavailableReason = stringValue(details, ["diffUnavailableReason", "diff_unavailable_reason"]);
  const source = synthetic
    ? "synthetic-snapshot"
    : (resultPatch || resultDiff) && state === "completed"
      ? "provider-result"
      : (resultPatch || resultDiff)
        ? "provider-live"
        : "args-preview";
  const canonical = source === "provider-result" || source === "synthetic-snapshot" || source === "provider-live"
    ? resultPatch ?? resultDiff
    : undefined;
  const display = resultDiff ?? canonical ?? preview;
  const boundedPatch = boundText(canonical);
  const boundedPreview = boundText(preview);
  const boundedDisplay = boundText(display);
  const paths = readPaths(args, result, partialResult);
  const operation = normalizeToolName(toolState.toolName ?? toolState.name);
  const kind = /\b(delete|remove)\b/.test(operation)
    ? "delete"
    : /\b(move|rename)\b/.test(operation)
      ? "move"
      : /\b(write|create)\b/.test(operation)
        ? "add"
        : "update";
  const stats = patchStats(boundedPatch.text ?? boundedPreview.text);
  return {
    category: "file-change",
    provider: "pi",
    status: state,
    source,
    authoritative: state === "completed" && (source === "provider-result" || source === "synthetic-snapshot"),
    toolName: toolState.toolName ?? toolState.name ?? "tool",
    toolCallId: toolState.toolCallId,
    revision: Number(toolState.fileChange?.revision ?? 0) + 1,
    paths,
    changes: Array.isArray(details?.changes)
      ? details.changes
      : paths[0]
        ? [{ path: paths[0], kind, diff: boundedPatch.text ?? boundedPreview.text, isNew: kind === "add" }]
        : [],
    patch: boundedPatch.text,
    previewPatch: boundedPreview.text,
    displayDiff: boundedDisplay.text,
    additions: stats.additions,
    deletions: stats.deletions,
    snapshotBacked: synthetic || undefined,
    truncated: boundedPatch.truncated || boundedPreview.truncated || boundedDisplay.truncated || details?.truncated === true || undefined,
    diffUnavailableReason: boundedPatch.text
      ? undefined
      : unavailableReason ?? (operation.includes("write") ? "preview-only" : undefined),
  };
}
