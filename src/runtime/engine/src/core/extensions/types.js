// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function defineTool(tool) {
  return tool;
}
function isBashToolResult(e) {
  return e.toolName === "bash";
}
function isPowerShellToolResult(e) {
  return e.toolName === "powershell";
}
function isReadToolResult(e) {
  return e.toolName === "read";
}
function isEditToolResult(e) {
  return e.toolName === "edit";
}
function isWriteToolResult(e) {
  return e.toolName === "write";
}
function isGrepToolResult(e) {
  return e.toolName === "grep";
}
function isFindToolResult(e) {
  return e.toolName === "find";
}
function isLsToolResult(e) {
  return e.toolName === "ls";
}
function isToolCallEventType(toolName, event) {
  return event.toolName === toolName;
}
export {
  defineTool,
  isBashToolResult,
  isEditToolResult,
  isFindToolResult,
  isGrepToolResult,
  isLsToolResult,
  isPowerShellToolResult,
  isReadToolResult,
  isToolCallEventType,
  isWriteToolResult
};
