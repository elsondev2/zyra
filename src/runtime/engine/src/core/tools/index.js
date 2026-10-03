// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import {
  createBashTool,
  createBashToolDefinition,
  createLocalBashOperations
} from "./bash.js";
import {
  createEditTool,
  createEditToolDefinition
} from "./edit.js";
import { withFileMutationQueue } from "./file-mutation-queue.js";
import {
  createFindTool,
  createFindToolDefinition
} from "./find.js";
import {
  createGrepTool,
  createGrepToolDefinition
} from "./grep.js";
import {
  createLsTool,
  createLsToolDefinition
} from "./ls.js";
import {
  createLocalPowerShellOperations,
  createPowerShellTool,
  createPowerShellToolDefinition
} from "./powershell.js";
import {
  createReadTool,
  createReadToolDefinition
} from "./read.js";
import {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  formatSize,
  truncateHead,
  truncateLine,
  truncateTail
} from "./truncate.js";
import {
  createWriteTool,
  createWriteToolDefinition
} from "./write.js";
import { createBashTool as createBashTool2, createBashToolDefinition as createBashToolDefinition2 } from "./bash.js";
import { createEditTool as createEditTool2, createEditToolDefinition as createEditToolDefinition2 } from "./edit.js";
import { createFindTool as createFindTool2, createFindToolDefinition as createFindToolDefinition2 } from "./find.js";
import { createGrepTool as createGrepTool2, createGrepToolDefinition as createGrepToolDefinition2 } from "./grep.js";
import { createLsTool as createLsTool2, createLsToolDefinition as createLsToolDefinition2 } from "./ls.js";
import { createPowerShellTool as createPowerShellTool2, createPowerShellToolDefinition as createPowerShellToolDefinition2 } from "./powershell.js";
import { createReadTool as createReadTool2, createReadToolDefinition as createReadToolDefinition2 } from "./read.js";
import { createWriteTool as createWriteTool2, createWriteToolDefinition as createWriteToolDefinition2 } from "./write.js";
const allToolNames = /* @__PURE__ */ new Set([
  "read",
  "bash",
  "powershell",
  "edit",
  "write",
  "grep",
  "find",
  "ls"
]);
function createToolDefinition(toolName, cwd, options) {
  switch (toolName) {
    case "read":
      return createReadToolDefinition2(cwd, options?.read);
    case "bash":
      return createBashToolDefinition2(cwd, options?.bash);
    case "powershell":
      return createPowerShellToolDefinition2(cwd, options?.powershell);
    case "edit":
      return createEditToolDefinition2(cwd, options?.edit);
    case "write":
      return createWriteToolDefinition2(cwd, options?.write);
    case "grep":
      return createGrepToolDefinition2(cwd, options?.grep);
    case "find":
      return createFindToolDefinition2(cwd, options?.find);
    case "ls":
      return createLsToolDefinition2(cwd, options?.ls);
    default:
      throw new Error(`Unknown tool name: ${toolName}`);
  }
}
function createTool(toolName, cwd, options) {
  switch (toolName) {
    case "read":
      return createReadTool2(cwd, options?.read);
    case "bash":
      return createBashTool2(cwd, options?.bash);
    case "powershell":
      return createPowerShellTool2(cwd, options?.powershell);
    case "edit":
      return createEditTool2(cwd, options?.edit);
    case "write":
      return createWriteTool2(cwd, options?.write);
    case "grep":
      return createGrepTool2(cwd, options?.grep);
    case "find":
      return createFindTool2(cwd, options?.find);
    case "ls":
      return createLsTool2(cwd, options?.ls);
    default:
      throw new Error(`Unknown tool name: ${toolName}`);
  }
}
function createCodingToolDefinitions(cwd, options) {
  return [
    createReadToolDefinition2(cwd, options?.read),
    createBashToolDefinition2(cwd, options?.bash),
    createEditToolDefinition2(cwd, options?.edit),
    createWriteToolDefinition2(cwd, options?.write)
  ];
}
function createReadOnlyToolDefinitions(cwd, options) {
  return [
    createReadToolDefinition2(cwd, options?.read),
    createGrepToolDefinition2(cwd, options?.grep),
    createFindToolDefinition2(cwd, options?.find),
    createLsToolDefinition2(cwd, options?.ls)
  ];
}
function createAllToolDefinitions(cwd, options) {
  return {
    read: createReadToolDefinition2(cwd, options?.read),
    bash: createBashToolDefinition2(cwd, options?.bash),
    powershell: createPowerShellToolDefinition2(cwd, options?.powershell),
    edit: createEditToolDefinition2(cwd, options?.edit),
    write: createWriteToolDefinition2(cwd, options?.write),
    grep: createGrepToolDefinition2(cwd, options?.grep),
    find: createFindToolDefinition2(cwd, options?.find),
    ls: createLsToolDefinition2(cwd, options?.ls)
  };
}
function createCodingTools(cwd, options) {
  return [
    createReadTool2(cwd, options?.read),
    createBashTool2(cwd, options?.bash),
    createEditTool2(cwd, options?.edit),
    createWriteTool2(cwd, options?.write)
  ];
}
function createReadOnlyTools(cwd, options) {
  return [
    createReadTool2(cwd, options?.read),
    createGrepTool2(cwd, options?.grep),
    createFindTool2(cwd, options?.find),
    createLsTool2(cwd, options?.ls)
  ];
}
function createAllTools(cwd, options) {
  return {
    read: createReadTool2(cwd, options?.read),
    bash: createBashTool2(cwd, options?.bash),
    powershell: createPowerShellTool2(cwd, options?.powershell),
    edit: createEditTool2(cwd, options?.edit),
    write: createWriteTool2(cwd, options?.write),
    grep: createGrepTool2(cwd, options?.grep),
    find: createFindTool2(cwd, options?.find),
    ls: createLsTool2(cwd, options?.ls)
  };
}
export {
  DEFAULT_MAX_BYTES,
  DEFAULT_MAX_LINES,
  allToolNames,
  createAllToolDefinitions,
  createAllTools,
  createBashTool,
  createBashToolDefinition,
  createCodingToolDefinitions,
  createCodingTools,
  createEditTool,
  createEditToolDefinition,
  createFindTool,
  createFindToolDefinition,
  createGrepTool,
  createGrepToolDefinition,
  createLocalBashOperations,
  createLocalPowerShellOperations,
  createLsTool,
  createLsToolDefinition,
  createPowerShellTool,
  createPowerShellToolDefinition,
  createReadOnlyToolDefinitions,
  createReadOnlyTools,
  createReadTool,
  createReadToolDefinition,
  createTool,
  createToolDefinition,
  createWriteTool,
  createWriteToolDefinition,
  formatSize,
  truncateHead,
  truncateLine,
  truncateTail,
  withFileMutationQueue
};
