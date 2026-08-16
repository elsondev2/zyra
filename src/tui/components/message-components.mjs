import { isAgentSurfaceDescriptor, normalizeAgentSurfaceTool } from "../../agent-surface.mjs";
import { renderMarkdown } from "../../pi-markdown.mjs";
import { buildTerminalTheme } from "../../terminal-theme.mjs";
import {
  bold,
  normalIntensity,
  padToVisibleWidth,
  reset,
  splitDisplayLines,
  trimOuterBlankLines,
  truncatePlain,
  visibleWidth,
  wrapPlain,
} from "../render-utils.mjs";

const fallbackTheme = buildTerminalTheme();
const assistantPadding = "  ";
const maxToolOutputLineLength = 180;
const commandOutputPreviewRows = 3;

export class UserMessageComponent {
  constructor(key, text, theme = fallbackTheme, options = {}) {
    this.key = key;
    const legacy = extractLegacyImageMarkers(text);
    this.text = legacy.text;
    this.theme = theme;
    const structured = Array.isArray(options.imageAttachments) ? options.imageAttachments.filter(Boolean) : [];
    this.imageAttachments = structured.length > 0 ? structured : legacy.imageAttachments;
  }

  setHost(host) {
    this.host = host;
  }

  render(width) {
    const contentWidth = Math.max(1, width);
    const rows = this.text ? renderUserMessageRows(this.text, contentWidth) : [];
    if (this.imageAttachments.length > 0) {
      const count = this.imageAttachments.length;
      const label = count === 1 ? "▣ Image attached" : `▣ ${count} images attached`;
      rows.push(...renderUserMessageRows(label, contentWidth, rows.length > 0 ? "  " : "> "));
    }
    if (rows.length === 0) return [];
    const bgLine = (content = "") => `${this.theme.userBg}${this.theme.userFg}${content.padEnd(contentWidth)}${reset}`;
    return ["", bgLine(), ...rows.map((row) => bgLine(row)), bgLine()];
  }
}

function renderUserMessageRows(value, width, firstPrefix = "> ") {
  const continuationPrefix = "  ";
  const prefixWidth = Math.max(visibleWidth(firstPrefix), visibleWidth(continuationPrefix));
  const bodyWidth = Math.max(1, width - prefixWidth);
  return wrapPlain(value, bodyWidth).map((row, index) => `${index === 0 ? firstPrefix : continuationPrefix}${row}`);
}

function extractLegacyImageMarkers(value) {
  const imageAttachments = [];
  const text = String(value ?? "").replace(
    /\[(?:Pasted Image(?:\s+(\d+)[x×](\d+))?|Image\s+(\d+)(?:\s+·\s+(?:loading|(\d+)[x×](\d+)))?)\]/gi,
    (_marker, pastedWidth, pastedHeight, imageIndex, imageWidth, imageHeight) => {
      imageAttachments.push({
        index: Number(imageIndex) || imageAttachments.length + 1,
        width: Number(pastedWidth ?? imageWidth) || undefined,
        height: Number(pastedHeight ?? imageHeight) || undefined,
      });
      return " ";
    },
  ).replace(/\s+/g, " ").trim();
  return { text, imageAttachments };
}

export class AssistantMessageComponent {
  constructor(key, content = { text: "" }, theme = fallbackTheme) {
    this.key = key;
    this.content = content;
    this.theme = theme;
    this.final = false;
  }

  setHost(host) {
    this.host = host;
  }

  setContent(content, options = {}) {
    this.content = content;
    this.final = Boolean(options.final ?? this.final);
    this.host?.invalidate();
  }

  render(width) {
    const text = String(this.content?.text ?? "").trim();
    if (!text) return [];
    const contentWidth = Math.max(24, width - assistantPadding.length);
    const rendered = trimOuterBlankLines(renderMarkdown(text, contentWidth, this.theme));
    return ["", ...rendered.map((line) => line.trim() ? `${assistantPadding}${line}` : "")];
  }
}

export class ToolMessageComponent {
  constructor(key, toolState = {}, theme = fallbackTheme) {
    this.key = key;
    this.toolState = toolState;
    this.theme = theme;
    this.spacingKind = "tool";
  }

  setHost(host) {
    this.host = host;
  }

  update(toolState = {}) {
    this.toolState = { ...this.toolState, ...toolState };
    this.host?.invalidate();
  }

  render(width) {
    return renderToolBlock(this.toolState, this.theme, width);
  }
}

class CommandSummaryComponent {
  constructor(key, commands = [], theme = fallbackTheme, status = "checked") {
    this.key = key;
    this.commands = [...commands];
    this.theme = theme;
    this.status = status;
    this.spacingKind = "tool";
  }

  setHost(host) {
    this.host = host;
  }

  update(commands = []) {
    this.commands = [...commands];
    this.host?.invalidate();
  }

  render(width) {
    if (this.commands.length === 0) return [];
    const stopped = this.status === "stopped";
    const verb = stopped ? "Stopped" : "Checked";
    const label = this.commands.length === 1
      ? `${verb} command — ${sanitizeToolDisplayText(this.commands[0]).replace(/\s+/g, " ").trim()}`
      : `${verb} ${this.commands.length} commands`;
    const text = truncatePlain(label, Math.max(12, Number(width || 100) - 6));
    const marker = stopped ? `${this.theme.warning}■` : `${this.theme.success}✓`;
    return ["", `  ${marker}${reset} ${this.theme.muted}${text}${reset}`];
  }
}

export class CheckedCommandsComponent extends CommandSummaryComponent {
  constructor(key, commands = [], theme = fallbackTheme) {
    super(key, commands, theme, "checked");
  }
}

export class StoppedCommandsComponent extends CommandSummaryComponent {
  constructor(key, commands = [], theme = fallbackTheme) {
    super(key, commands, theme, "stopped");
  }
}

export class ActivityComponent {
  constructor(key, getState, theme = fallbackTheme) {
    this.key = key;
    this.getState = getState;
    this.theme = theme;
  }

  setHost(host) {
    this.host = host;
  }

  render() {
    const state = this.getState?.() ?? {};
    if (!state.active || state.suppress) return [];
    const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    const frame = Number(state.frame ?? 0);
    const label = String(state.label ?? "working").replace(/\s+/g, " ").trim() || "working";
    return [`  ${this.theme.accent}${frames[frame % frames.length]}${reset} ${this.theme.muted}${label}${reset}`];
  }
}

export function renderToolBlock(toolState, theme = fallbackTheme, width = 100) {
  const resolvedTheme = buildTerminalTheme(theme);
  if (toolState.fileChange?.category === "file-change") {
    return renderFileChangeToolBlock(toolState, resolvedTheme, width);
  }
  const agentSurface = isAgentSurfaceDescriptor(toolState.surface)
    ? toolState.surface
    : normalizeAgentSurfaceTool(toolState);
  const isError = agentSurface.lifecycle === "failed";
  const isStopped = agentSurface.lifecycle === "stopped";
  const isDone = agentSurface.lifecycle === "completed";
  if (agentSurface.kind === "file-read" && !isError) {
    return renderCompactFileReadToolBlock(toolState, agentSurface, resolvedTheme, width);
  }
  const stateLabel = isError ? "failed" : isStopped ? "stopped" : isDone ? "succeeded" : "running";
  const state = isError ? "error" : isStopped ? "stopped" : isDone ? "done" : "running";
  const title = agentSurface.toolName ?? toolState.toolName ?? "tool";
  const rawArgs = toolState.args ?? toolState.arguments;
  const command = rawArgs && typeof rawArgs === "object" ? firstStringValue(rawArgs, ["command", "cmd"]) : undefined;
  const terminalWidth = Math.max(24, Number(width) || 100);
  const rows = command
    ? [{ kind: "command", title, state, stateLabel, text: command, rightText: toolCommandStatusText(toolState, { title, state, stateLabel }) }]
    : [{ kind: "title", title, state, stateLabel }];
  let outputText = [];
  const deferredOutput = Boolean(toolState.historyBodyRef);
  if (command) {
    if (!deferredOutput) {
      outputText = summarizeCommandToolResult(toolState.result ?? toolState.partialResult, commandOutputPreviewRows);
      rows.push({ kind: "spacer" });
      for (let index = 0; index < commandOutputPreviewRows; index += 1) {
        rows.push({ kind: "commandOutput", text: outputText[index] ?? "" });
      }
    }
  } else {
    const args = summarizeToolArgs(rawArgs, { toolName: title, state, commandAsTitle: false });
    if (args) rows.push(...normalizeToolSummaryRows(args, "args"));
    outputText = summarizeToolResult(toolState.result ?? toolState.partialResult);
    if (!deferredOutput && outputText.length > 0) {
      rows.push({ kind: "spacer" });
      rows.push(...outputText.flatMap((line) => splitDisplayLines(line)).map((line) => ({ kind: "output", text: line })));
    }
    const footer = toolFooterText(toolState, { title, state, stateLabel, hasOutput: outputText.length > 0 });
    if (footer) {
      rows.push({ kind: "spacer" });
      rows.push({ kind: state === "error" ? "footerError" : "hint", text: footer });
    } else if (state === "running") {
      rows.push({ kind: "hint", text: "status started" });
    }
  }
  if (deferredOutput) {
    rows.push({ kind: "spacer" });
    rows.push({ kind: "hint", text: "stored output — load on demand" });
  }
  const surface = toolSurfaceForState(state, resolvedTheme);
  const innerBlank = renderToolBlankRow(terminalWidth, surface);
  return [
    "",
    innerBlank,
    ...rows.flatMap((row) => renderToolRow(row, resolvedTheme, terminalWidth, surface)),
    innerBlank,
    "",
  ];
}

function renderCompactFileReadToolBlock(toolState, surface, theme, width) {
  const args = toolState.args ?? toolState.arguments ?? {};
  const target = surface.paths[0] ?? firstStringValue(args, ["path", "filePath", "file_path"]) ?? "";
  const offset = Number(args.offset);
  const limit = Number(args.limit);
  const hasOffset = Number.isFinite(offset) && offset > 0;
  const hasLimit = Number.isFinite(limit) && limit > 0;
  const start = hasOffset ? Math.trunc(offset) : 1;
  const range = hasOffset || hasLimit
    ? `:${start}${hasLimit ? `-${start + Math.trunc(limit) - 1}` : ""}`
    : "";
  const terminalWidth = Math.max(24, Number(width) || 100);
  const prefix = `${theme.toolTitleFg ?? theme.toolFg ?? ""}${bold}read${normalIntensity}`;
  const available = Math.max(1, terminalWidth - visibleWidth("  read "));
  const path = truncatePlain(`${target}${range}`, available);
  return ["", `  ${prefix} ${theme.toolArgsFg ?? theme.toolDetailFg ?? theme.toolFg ?? ""}${path}${reset}`];
}

function renderFileChangeToolBlock(toolState, theme, width) {
  const change = toolState.fileChange ?? {};
  const state = change.status === "failed" ? "error" : change.status === "completed" ? "done" : "running";
  const stateLabel = state === "error" ? "failed" : state === "done" ? "applied" : "running";
  const paths = Array.isArray(change.paths) ? change.paths.filter(Boolean) : [];
  const title = String(change.toolName ?? toolState.toolName ?? "edit");
  const rows = [{ kind: "title", title, state, stateLabel }];
  for (const path of paths.slice(0, 4)) rows.push({ kind: "args", text: `path ${path}` });
  if (paths.length > 4) rows.push({ kind: "hint", text: `… ${paths.length - 4} more files` });
  const sourceLabel = change.authoritative
    ? change.snapshotBacked ? "applied · snapshot-backed" : "applied · provider result"
    : state === "error"
      ? "failed · preview not applied"
      : change.source === "provider-live"
        ? "live provider preview"
        : "live preview";
  rows.push({ kind: state === "error" ? "footerError" : "diffMeta", text: sourceLabel });
  rows.push({ kind: "diffMeta", text: `+${Number(change.additions) || 0}/-${Number(change.deletions) || 0}${change.truncated ? " · truncated" : ""}` });

  const displayDiff = String(change.displayDiff ?? change.patch ?? change.previewPatch ?? "");
  const diffRows = renderPatchDiff(displayDiff, 12);
  if (diffRows.length > 0) {
    rows.push({ kind: "spacer" });
    rows.push(...diffRows);
    const totalLines = displayDiff.split(/\r?\n/).filter((line) => line.trim()).length;
    if (totalLines > diffRows.length) rows.push({ kind: "hint", text: `… ${totalLines - diffRows.length} more diff lines` });
  } else if (state === "running") {
    rows.push({ kind: "hint", text: "waiting for complete file-change arguments" });
  }

  const terminalWidth = Math.max(24, Number(width) || 100);
  const surface = toolSurfaceForState(state, theme);
  const blank = renderToolBlankRow(terminalWidth, surface);
  return [
    "",
    blank,
    ...rows.flatMap((row) => renderToolRow(row, theme, terminalWidth, surface)),
    blank,
    "",
  ];
}

export function summarizeToolArgs(args, context = {}) {
  if (!args || typeof args !== "object") return [];
  const toolName = normalizeToolName(context.toolName);
  const rows = [];
  const targetPath = firstStringValue(args, ["path", "filePath", "file_path", "targetPath", "target_file", "filename"]);
  const command = firstStringValue(args, ["command", "cmd"]);
  const isMutation = isFileMutationTool(toolName, args);
  if (targetPath) rows.push(`path ${targetPath}`);
  if (command && !context.commandAsTitle) rows.push(`${toolName.includes("bash") ? "cmd " : "run "} ${command}`);
  if (isMutation) rows.push(...summarizeMutationArgs(toolName, args));
  if (rows.length > 0) return rows.slice(0, isMutation ? 14 : 7);
  const values = Object.entries(args).filter(([key, value]) => {
    if (context.commandAsTitle && ["command", "cmd"].includes(key)) return false;
    if (context.commandAsTitle && isTimeoutArgKey(key)) return false;
    return value !== undefined && value !== null && value !== "";
  });
  const entries = values.slice(0, 4).map(([key, value]) => `${key}: ${formatToolValue(value)}`);
  if (values.length > entries.length) {
    entries.push(`... ${values.length - entries.length} more arg${values.length - entries.length === 1 ? "" : "s"}`);
  }
  return entries;
}

export function summarizeToolResult(result) {
  if (!result) return [];
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.map((item) => sanitizeToolDisplayText(item?.text)).filter(Boolean).join("\n").trim();
  if (!text) return [];
  const lines = text.split("\n").filter(Boolean);
  const visible = lines.slice(0, 4).map((line) => truncatePlain(line, maxToolOutputLineLength));
  if (lines.length > visible.length) {
    visible.push(`... ${lines.length - visible.length} more output line${lines.length - visible.length === 1 ? "" : "s"}`);
  }
  return visible;
}

function summarizeCommandToolResult(result, maxRows = commandOutputPreviewRows) {
  if (!result) return [];
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.map((item) => sanitizeToolDisplayText(item?.text)).filter(Boolean).join("\n").trim();
  if (!text) return [];
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length <= maxRows) return lines;
  const tailCount = Math.max(1, maxRows - 1);
  const hidden = lines.length - tailCount;
  return [`... ${hidden} earlier output line${hidden === 1 ? "" : "s"}`, ...lines.slice(-tailCount)];
}

function normalizeToolSummaryRows(items = [], fallbackKind = "args") {
  return items.flatMap((item) => {
    if (typeof item === "string") {
      return splitDisplayLines(item).map((line) => ({ kind: fallbackKind, text: line }));
    }
    const kind = item?.kind ?? fallbackKind;
    return splitDisplayLines(item?.text ?? "").map((line) => ({ kind, text: line }));
  });
}

function summarizeMutationArgs(toolName, args = {}) {
  const rows = [];
  const oldText = firstStringValue(args, ["oldString", "old_string", "oldStr", "old_str", "from", "before"]);
  const newText = firstStringValue(args, ["newString", "new_string", "newStr", "new_str", "to", "after"]);
  const content = firstStringValue(args, ["content", "fileContent", "file_content", "text", "body"]);
  const patch = firstStringValue(args, ["patch", "diff"]);
  const edits = Array.isArray(args.edits) ? args.edits : Array.isArray(args.replacements) ? args.replacements : [];

  if (oldText !== undefined || newText !== undefined) {
    rows.push({ kind: "diffMeta", text: `edit replace ${formatTextSize(oldText)} -> ${formatTextSize(newText)}` });
    rows.push(...renderBeforeAfterDiff(oldText, newText));
    return rows;
  }

  if (content !== undefined) {
    const verb = toolName.includes("append") ? "append" : toolName.includes("edit") ? "edit" : "write";
    rows.push({ kind: "diffMeta", text: `${verb} ${formatTextSize(content)}` });
    rows.push(...renderAddedTextDiff(content));
    return rows;
  }

  if (patch !== undefined) {
    rows.push({ kind: "diffMeta", text: `patch ${formatPatchSize(patch)}` });
    rows.push(...renderPatchDiff(patch));
    return rows;
  }

  if (edits.length > 0) {
    rows.push({ kind: "diffMeta", text: `edit ${edits.length} replacement${edits.length === 1 ? "" : "s"}` });
    for (const edit of edits.slice(0, 2)) {
      const editPath = firstStringValue(edit, ["path", "filePath", "file_path"]);
      const editOld = firstStringValue(edit, ["oldString", "old_string", "oldStr", "old_str", "from", "before"]);
      const editNew = firstStringValue(edit, ["newString", "new_string", "newStr", "new_str", "to", "after"]);
      if (editPath) rows.push({ kind: "diffMeta", text: truncatePlain(editPath, 96) });
      if (editOld !== undefined || editNew !== undefined) {
        rows.push({ kind: "diffMeta", text: `replace ${formatTextSize(editOld)} -> ${formatTextSize(editNew)}` });
        rows.push(...renderBeforeAfterDiff(editOld, editNew, 2));
      }
    }
    if (edits.length > 2) rows.push({ kind: "hint", text: `... ${edits.length - 2} more replacement${edits.length - 2 === 1 ? "" : "s"}` });
  }

  return rows;
}

function renderBeforeAfterDiff(oldText = "", newText = "", maxLines = 3) {
  const rows = [];
  const before = previewLines(oldText, maxLines);
  const after = previewLines(newText, maxLines);
  if (before.length > 0) {
    rows.push({ kind: "diffMeta", text: "--- before" });
    rows.push(...before.map((line) => ({ kind: "diffRemove", text: line })));
  }
  if (after.length > 0) {
    rows.push({ kind: "diffMeta", text: "+++ after" });
    rows.push(...after.map((line) => ({ kind: "diffAdd", text: line })));
  }
  return rows;
}

function renderAddedTextDiff(text = "", maxLines = 5) {
  const lines = previewLines(text, maxLines);
  if (lines.length === 0) return [];
  return [
    { kind: "diffMeta", text: "+++ content" },
    ...lines.map((line) => ({ kind: "diffAdd", text: line })),
  ];
}

function renderPatchDiff(patch = "", maxLines = 8) {
  const lines = String(patch ?? "").split(/\r?\n/).filter((line) => line.trim().length > 0).slice(0, maxLines);
  return lines.map((line) => {
    if (line.startsWith("@@") || line.startsWith("+++") || line.startsWith("---")) return { kind: "diffMeta", text: line };
    if (line.startsWith("+")) return { kind: "diffAdd", text: line.slice(1) };
    if (line.startsWith("-")) return { kind: "diffRemove", text: line.slice(1) };
    return { kind: "diffContext", text: line.trimStart() };
  });
}

function previewLines(value = "", maxLines = 4) {
  return String(value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim().length > 0)
    .slice(0, maxLines)
    .map((line) => truncatePlain(line, 96));
}

function isFileMutationTool(toolName, args = {}) {
  if (/(edit|write|patch|replace|append|create)/i.test(toolName)) return true;
  return Boolean(
    firstStringValue(args, ["oldString", "old_string", "oldStr", "old_str", "newString", "new_string", "newStr", "new_str"])
    || firstStringValue(args, ["content", "fileContent", "file_content", "patch", "diff"]),
  );
}

function firstStringValue(source = {}, keys = []) {
  for (const key of keys) {
    const value = source?.[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function isTimeoutArgKey(key) {
  return ["timeout", "timeoutMs", "timeout_ms", "timeoutSeconds", "timeout_seconds"].includes(key);
}

function normalizeToolName(value) {
  return String(value ?? "tool").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}

function formatTextSize(value = "") {
  const text = String(value ?? "");
  const lineCount = text.length ? text.split(/\r?\n/).length : 0;
  const byteCount = Buffer.byteLength(text, "utf8");
  if (lineCount > 1) return `${lineCount} lines/${formatBytes(byteCount)}`;
  return `${byteCount}b`;
}

function formatPatchSize(value = "") {
  const lines = String(value ?? "").split(/\r?\n/);
  const added = lines.filter((line) => line.startsWith("+") && !line.startsWith("+++")).length;
  const removed = lines.filter((line) => line.startsWith("-") && !line.startsWith("---")).length;
  if (added || removed) return `+${added}/-${removed}`;
  return formatTextSize(value);
}

function formatBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value}b`;
  return `${(value / 1024).toFixed(value < 10 * 1024 ? 1 : 0)}kb`;
}

function formatToolValue(value) {
  if (typeof value === "string") return truncatePlain(value, 80);
  try {
    return truncatePlain(JSON.stringify(value), 80);
  } catch {
    return String(value);
  }
}

function toolFooterText(toolState = {}, context = {}) {
  const timing = formatToolElapsed(toolState);
  if (timing && context.state === "running") {
    return `${String(context.title ?? "tool").replace(/\s+/g, " ").trim() || "tool"} running ${timing}`;
  }
  if (timing) return `${timing} ${context.stateLabel ?? context.state ?? ""}`.trim();
  if (context.state === "running" && !context.hasOutput) return "status started";
  return "";
}

function toolCommandStatusText(toolState = {}, context = {}) {
  const elapsed = formatToolElapsed(toolState, { running: context.state === "running" });
  const timeout = formatToolTimeout(toolState);
  const pieces = [];
  if (context.state === "running") {
    pieces.push(`${String(context.title ?? "tool").replace(/\s+/g, " ").trim() || "tool"} running${elapsed ? ` ${elapsed}` : ""}`);
  } else {
    pieces.push(`${elapsed ? `${elapsed} ` : ""}${context.stateLabel ?? context.state ?? ""}`.trim());
  }
  if (timeout) pieces.push(`(${timeout})`);
  return pieces.filter(Boolean).join(" ");
}

function formatToolElapsed(toolState = {}, options = {}) {
  const durationMs = numericMilliseconds(toolState.durationMs)
    ?? numericMilliseconds(toolState.elapsedMs)
    ?? numericMilliseconds(toolState.executionTimeMs)
    ?? numericMilliseconds(toolState.result?.durationMs)
    ?? numericMilliseconds(toolState.result?.elapsedMs)
    ?? numericSeconds(toolState.durationSeconds)
    ?? numericSeconds(toolState.elapsedSeconds)
    ?? durationBetween(toolState.startedAt, toolState.endedAt ?? toolState.completedAt)
    ?? (options.running ? durationBetween(toolState.startedAt, Date.now()) : undefined);
  if (durationMs === undefined) return "";
  return formatDuration(durationMs);
}

function formatToolTimeout(toolState = {}) {
  const args = toolState.args ?? toolState.arguments ?? {};
  const timeoutMs = numericMilliseconds(toolState.timeoutMs)
    ?? numericMilliseconds(args.timeoutMs)
    ?? numericMilliseconds(args.timeout_ms)
    ?? numericSeconds(toolState.timeoutSeconds)
    ?? numericSeconds(args.timeoutSeconds)
    ?? numericSeconds(args.timeout_seconds)
    ?? flexibleDuration(toolState.timeout)
    ?? flexibleDuration(args.timeout);
  if (timeoutMs === undefined) return "";
  return `timeout ${formatDuration(timeoutMs)}`;
}

function numericMilliseconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return number;
}

function numericSeconds(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return number * 1000;
}

function flexibleDuration(value) {
  if (typeof value === "string") {
    const text = value.trim().toLowerCase();
    const match = text.match(/^([0-9]+(?:\.[0-9]+)?)\s*(ms|s|sec|secs|second|seconds)?$/);
    if (!match) return undefined;
    const number = Number(match[1]);
    if (!Number.isFinite(number) || number < 0) return undefined;
    return match[2] === "ms" ? number : number * 1000;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return undefined;
  return number <= 600 ? number * 1000 : number;
}

function durationBetween(start, end) {
  const started = parseTimestamp(start);
  const ended = parseTimestamp(end);
  if (!Number.isFinite(started) || !Number.isFinite(ended) || ended < started) return undefined;
  return ended - started;
}

function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatDuration(ms) {
  const seconds = ms / 1000;
  if (seconds < 10) return `${seconds.toFixed(1)}s`;
  if (seconds < 60) return `${Number.isInteger(seconds) ? seconds.toFixed(0) : seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  const remainder = Math.round(seconds % 60);
  return `${minutes}m ${remainder}s`;
}

function toolRowColor(kind, theme = fallbackTheme) {
  if (kind === "command") return theme.toolTitleFg ?? theme.toolFg ?? `${bold}\x1b[97m`;
  if (kind === "title") return theme.toolTitleFg ?? theme.toolFg ?? `${bold}\x1b[97m`;
  if (kind === "args") return theme.toolArgsFg ?? theme.toolDetailFg ?? theme.toolFg ?? "\x1b[97m";
  if (kind === "output" || kind === "commandOutput") return theme.toolOutputFg ?? theme.toolDetailFg ?? theme.toolFg ?? "\x1b[97m";
  if (kind === "diffAdd") return theme.toolDiffAddFg ?? theme.success ?? theme.toolFg ?? "\x1b[92m";
  if (kind === "diffRemove") return theme.toolDiffRemoveFg ?? theme.error ?? theme.toolFg ?? "\x1b[91m";
  if (kind === "diffMeta") return theme.toolDiffMetaFg ?? theme.toolDimFg ?? theme.toolHintFg ?? "\x1b[38;5;245m";
  if (kind === "diffContext") return theme.toolDiffContextFg ?? theme.toolDetailFg ?? theme.toolFg ?? "\x1b[97m";
  if (kind === "footerError") return theme.toolStateErrorFg ?? theme.error ?? theme.toolHintFg ?? "\x1b[38;5;245m";
  if (kind === "hint") return theme.toolHintFg ?? theme.toolFg ?? "\x1b[38;5;245m";
  return theme.toolDetailFg ?? theme.toolFg ?? "\x1b[97m";
}

function renderToolBlankRow(width = 100, surface = "") {
  return `${surface}${" ".repeat(width)}${reset}`;
}

function renderToolRow(row, theme = fallbackTheme, width = 100, surface = theme.toolBg) {
  if (row.kind === "spacer") return renderToolBlankRow(width, surface);
  const safeRowText = sanitizeToolDisplayText(row.text);
  const marker = toolRowMarker(row);
  const markerColor = toolMarkerColor(row, theme);
  const prefix = toolRowPrefix(row, marker, markerColor);
  const contentWidth = Math.max(1, width - visibleWidth(prefix));
  if (row.kind === "command") {
    const rightText = sanitizeToolDisplayText(row.rightText).replace(/\s+/g, " ").trim();
    const maxRightWidth = Math.max(8, Math.floor(contentWidth * 0.48));
    const visibleRight = rightText ? truncatePlain(rightText, maxRightWidth) : "";
    const right = visibleRight ? `${toolStatusColor(row.state, theme)}${visibleRight}` : "";
    const gap = right ? 2 : 0;
    const leftWidth = Math.max(1, contentWidth - visibleWidth(right) - gap);
    const color = toolRowColor(row.kind, theme);
    const commandText = truncatePlain(compactToolCommand(safeRowText), leftWidth);
    const firstLeft = `${prefix}${color}${commandText}`;
    const spaces = right ? " ".repeat(Math.max(1, width - visibleWidth(firstLeft) - visibleWidth(right))) : "";
    return [`${surface}${padToVisibleWidth(`${firstLeft}${spaces}${right}`, width)}${reset}`];
  }
  if (row.kind === "title") {
    const rowContent = `${prefix}${renderToolTitle(row, theme, contentWidth)}`;
    return `${surface}${padToVisibleWidth(rowContent, width)}${reset}`;
  }
  if (row.kind === "commandOutput") {
    const color = toolRowColor(row.kind, theme);
    const text = truncatePlain(safeRowText.replace(/\s*\n\s*/g, " "), Math.max(1, width - 2));
    return `${surface}${padToVisibleWidth(`  ${color}${text}`, width)}${reset}`;
  }

  const color = toolRowColor(row.kind, theme);
  const wrapped = shouldWordWrapToolRow(row.kind)
    ? wrapPlain(safeRowText, contentWidth)
    : wrapCodeRow(safeRowText, contentWidth);
  const lines = [];
  for (const [index, line] of wrapped.entries()) {
    const linePrefix = index === 0 ? prefix : "  ";
    const content = `${linePrefix}${color}${line}`;
    lines.push(`${surface}${padToVisibleWidth(content, width)}${reset}`);
  }
  return lines;
}

function wrapCodeRow(text, width = 80) {
  const max = Math.max(1, Number(width) || 1);
  const lines = String(text ?? "").split(/\r?\n/);
  const rows = [];
  for (const line of lines) {
    if (!line) {
      rows.push("");
      continue;
    }
    for (let index = 0; index < line.length; index += max) {
      rows.push(line.slice(index, index + max));
    }
  }
  return rows.length ? rows : [""];
}

function compactToolCommand(value) {
  return sanitizeToolDisplayText(value).replace(/\s+/g, " ").trim();
}

function sanitizeToolDisplayText(value) {
  return String(value ?? "")
    .replace(/\x1b\][\s\S]*?(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b[P^_][\s\S]*?\x1b\\/g, "")
    .replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[@-_]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\t/g, "  ")
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, "");
}

function shouldWordWrapToolRow(kind) {
  return ["args", "diffMeta", "footerError", "hint", "output"].includes(kind);
}

function toolRowMarker(row) {
  if (row.kind === "title" && row.state === "error") return "!";
  if (row.kind === "title") return ">";
  if (row.kind === "command") return "$";
  if (row.kind === "diffAdd") return "+";
  if (row.kind === "diffRemove") return "-";
  if (row.kind === "diffContext") return " ";
  if (row.kind === "diffMeta" || row.kind === "args") return "";
  return "";
}

function toolMarkerColor(row, theme = fallbackTheme) {
  if (row.kind === "diffAdd") return theme.toolDiffAddFg ?? theme.success ?? theme.toolRailFg;
  if (row.kind === "diffRemove") return theme.toolDiffRemoveFg ?? theme.error ?? theme.toolRailFg;
  if (row.kind === "title" || row.kind === "command") return theme.toolMarkerFg;
  return theme.toolRailFg;
}

function toolStatusColor(state, theme = fallbackTheme) {
  if (state === "error") return theme.toolStateErrorFg ?? theme.error ?? theme.toolHintFg;
  if (state === "done") return theme.toolStateSuccessFg ?? theme.success ?? theme.toolHintFg;
  return theme.toolStateRunningFg ?? theme.warning ?? theme.toolHintFg;
}

function toolRowPrefix(row, marker, markerColor) {
  if (!marker) return "  ";
  return `  ${markerColor}${marker} `;
}

function toolSurfaceForState(state, theme = fallbackTheme) {
  if (state === "error") return theme.toolErrorBg || theme.toolBg || "";
  if (state === "done") return theme.toolSuccessBg || theme.toolBg || "";
  return theme.toolBg || "";
}

function renderToolTitle(row, theme = fallbackTheme, width = 80) {
  const title = sanitizeToolDisplayText(row.title ?? "tool").replace(/\s+/g, " ").trim() || "tool";
  const stateLabel = sanitizeToolDisplayText(row.stateLabel ?? "running").replace(/\s+/g, " ").trim();
  const fullTitle = `${title} ${stateLabel}`;
  if (fullTitle.length > width) {
    return `${theme.toolTitleFg}${truncatePlain(fullTitle, width)}${normalIntensity}`;
  }
  return `${theme.toolNameFg}${title}${normalIntensity} ${toolStateColor(row.state, theme)}${stateLabel}`;
}

function toolStateColor(state, theme = fallbackTheme) {
  if (state === "error") return theme.toolStateErrorFg ?? theme.error;
  if (state === "done") return theme.toolStateSuccessFg ?? theme.success;
  return theme.toolStateRunningFg ?? theme.warning;
}
