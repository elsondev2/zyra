import assert from "node:assert/strict";
import {
  AGENT_SURFACE_CONTRACT_VERSION,
  isAgentSurfaceDescriptor,
  normalizeAgentSurfaceLifecycle,
  normalizeAgentSurfacePhase,
  normalizeAgentSurfaceTool,
} from "../src/agent-surface.mjs";

const command = normalizeAgentSurfaceTool({
  type: "tool_execution_start",
  toolName: "bash",
  args: { command: "npm test" },
});
assert.equal(command.version, AGENT_SURFACE_CONTRACT_VERSION);
assert.equal(command.kind, "command");
assert.equal(command.lifecycle, "running");
assert.equal(command.phase, "start");
assert.equal(command.primaryText, "npm test");
assert.equal(command.summary, "Running command");
assert.equal(isAgentSurfaceDescriptor(command), true);

const edit = normalizeAgentSurfaceTool({
  type: "tool_execution_end",
  toolName: "edit",
  args: { path: "src/app.ts", oldString: "old", newString: "new" },
  result: { details: { status: "completed" } },
});
assert.equal(edit.kind, "file-change");
assert.equal(edit.lifecycle, "completed");
assert.equal(edit.phase, "end");
assert.deepEqual(edit.paths, ["src/app.ts"]);
assert.equal(edit.summary, "Edited file");

const read = normalizeAgentSurfaceTool({
  type: "tool_execution_end",
  toolName: "read",
  args: { path: "README.md" },
});
assert.equal(read.kind, "file-read");
assert.equal(read.summary, "Read file");

const search = normalizeAgentSurfaceTool({
  type: "tool_execution_start",
  toolName: "web_search",
  args: { query: "Pi SDK" },
});
assert.equal(search.kind, "search");
assert.equal(search.query, "Pi SDK");

assert.equal(normalizeAgentSurfaceLifecycle({ isError: true, state: "done" }), "failed");
assert.equal(normalizeAgentSurfaceLifecycle({ result: { details: { status: "stopped" } } }), "stopped");
assert.equal(normalizeAgentSurfaceLifecycle({ state: "done", result: { details: { status: "running" } } }), "running");
assert.equal(normalizeAgentSurfaceLifecycle({ type: "tool_execution_end" }), "completed");
assert.equal(normalizeAgentSurfacePhase({ type: "tool_execution_update" }), "update");
assert.equal(isAgentSurfaceDescriptor({ ...command, phase: "finished" }), false);
assert.equal(isAgentSurfaceDescriptor({ ...command, version: 2 }), false);
assert.equal("className" in command, false, "the middle contract must not contain renderer styling");
assert.equal("color" in command, false, "the middle contract must remain theme-agnostic");

console.log("Agent surface contract: ok");
