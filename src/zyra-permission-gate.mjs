import path from "node:path";

const SAFE_TOOL_NAMES = new Set([
  "read",
  "grep",
  "find",
  "ls",
  "web_search",
  "web_fetch",
]);

function asRecord(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeToolName(value) {
  return String(value || "").trim().toLowerCase();
}

function displayToolName(value) {
  const normalized = String(value || "tool").replace(/[._-]+/g, " ").trim();
  return normalized ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase()) : "Tool";
}

function boundedJson(value, limit = 1800) {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > limit ? `${text.slice(0, limit).trimEnd()}…` : text;
  } catch {
    return String(value || "").slice(0, limit);
  }
}

function collectPaths(input) {
  const values = [];
  for (const key of ["path", "filePath", "targetPath", "sourcePath", "destinationPath"]) {
    const value = stringValue(input[key]);
    if (value) values.push(value);
  }
  for (const key of ["paths", "files"]) {
    if (!Array.isArray(input[key])) continue;
    for (const value of input[key]) {
      const pathValue = stringValue(value);
      if (pathValue) values.push(pathValue);
    }
  }
  return [...new Set(values)].slice(0, 20);
}

function isSeparatelySupervisedControlTool(toolName) {
  return /(?:^|[._-])(browser|computer|control|workflow|agent)(?:[._-]|$)/.test(toolName);
}

export function describeZyraToolPermission(event, options = {}) {
  const toolName = normalizeToolName(event?.toolName || event?.name);
  if (!toolName || SAFE_TOOL_NAMES.has(toolName) || isSeparatelySupervisedControlTool(toolName)) return null;

  const input = asRecord(event?.input);
  const project = path.resolve(options.project || process.cwd());
  const paths = collectPaths(input);
  const command = toolName === "bash" || /(?:shell|terminal|exec|command)/.test(toolName)
    ? stringValue(input.command || input.cmd || input.script)
    : "";
  const requestType = toolName === "edit" || toolName === "write" || /(?:write|edit|patch|delete|move|rename|create)/.test(toolName)
    ? "file-change"
    : command
      ? "command"
      : "command";
  const scopeLabel = requestType === "file-change" ? "file changes" : toolName === "bash" ? "shell commands" : toolName;

  return {
    requestType,
    title: `${displayToolName(toolName)} needs approval`,
    detail: command || (paths.length > 0 ? paths.join("\n") : boundedJson(input)),
    ...(command ? { command } : {}),
    ...(paths.length > 0 ? { paths } : {}),
    toolName,
    grantKey: `${requestType}:${toolName}:${project.toLowerCase()}`,
    grantLabel: `Allow ${scopeLabel} for this chat`,
  };
}

export function createZyraPermissionGateExtension(options = {}) {
  const sessionGrants = new Set();
  const requestPermission = typeof options.requestPermission === "function" ? options.requestPermission : null;
  const getPermissionMode = typeof options.getPermissionMode === "function"
    ? options.getPermissionMode
    : () => "approval-required";
  const handleToolCall = async (event) => {
    if (!requestPermission || getPermissionMode() === "full-access") return undefined;
    const request = describeZyraToolPermission(event, options);
    if (!request || sessionGrants.has(request.grantKey)) return undefined;

    const decision = await requestPermission(request);
    if (decision === "acceptForSession") {
      sessionGrants.add(request.grantKey);
      return undefined;
    }
    if (decision === "acceptOnce") return undefined;
    return {
      block: true,
      reason: `The user declined ${request.toolName || "this tool"}.`,
    };
  };

  return {
    path: "<zyra:permission-gate>",
    resolvedPath: "<zyra:permission-gate>",
    sourceInfo: { source: "builtin", scope: "temporary", label: "Zyra permission gate" },
    handlers: new Map([["tool_call", [handleToolCall]]]),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}
