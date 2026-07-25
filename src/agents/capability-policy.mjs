const SAFE_READ_TOOLS = new Set(["read", "grep", "find", "ls"]);
const KNOWN_TOOLS = new Set(["read", "grep", "find", "ls", "bash", "edit", "write", "web_search", "web_fetch"]);
const CONTROL_TOOL_RE = /(?:browser|chrome|computer|windows|desktop|agent[_-]?control|pair|click|navigate|screenshot)/i;
const DESTRUCTIVE_GIT_RE = /\bgit\s+(?:reset\s+--hard|clean\s+-[a-z]*f|push\s+--force|rebase|merge|cherry-pick)\b/i;
const SENSITIVE_COMMAND_RE = /\b(?:deploy|publish|release|terraform\s+apply|kubectl\s+(?:apply|delete)|rm\s+-rf|format\s+[a-z]:|drop\s+(?:database|table))\b/i;

export const DEFAULT_CHILD_DENIED_CAPABILITIES = Object.freeze([
  "browser-control", "chrome-control", "windows-control", "computer-use", "agent-control", "spawn-agent", "run-workflow",
]);

export function attenuateAgentCapabilities(definition = {}, request = {}, policy = {}) {
  const permissionMode = String(request.permissionMode ?? definition.permissionMode ?? "read-only").toLowerCase();
  const requestedTools = uniqueStrings(request.tools ?? definition.tools ?? ["read", "grep", "find", "ls"]);
  const disallowed = new Set(uniqueStrings([...(definition.disallowedTools ?? []), ...(request.disallowedTools ?? []), ...(policy.disallowedTools ?? [])]));
  const warnings = [];
  const denied = [];
  const tools = [];

  for (const tool of requestedTools) {
    if (CONTROL_TOOL_RE.test(tool) || ["agent", "workflow"].includes(tool)) {
      denied.push({ tool, reason: "child_control_denied" });
      continue;
    }
    if (!KNOWN_TOOLS.has(tool)) {
      denied.push({ tool, reason: "unknown_tool" });
      continue;
    }
    if (disallowed.has(tool)) {
      denied.push({ tool, reason: "definition_disallowed" });
      continue;
    }
    if (tool === "bash") {
      denied.push({ tool, reason: "shell_cannot_enforce_child_scope" });
      continue;
    }
    if (permissionMode === "read-only" && !SAFE_READ_TOOLS.has(tool)) {
      denied.push({ tool, reason: "read_only" });
      continue;
    }
    tools.push(tool);
  }

  if (requestedTools.includes("bash")) {
    warnings.push("Removed bash because Pi's unrestricted shell cannot enforce a child read/write scope.");
  }
  if (["writer", "full-access"].includes(permissionMode) && !uniqueStrings(request.writeScope ?? definition.writeScope).length) {
    warnings.push("Writer has no declared write scope; execution must remain blocked until scope is declared.");
  }

  const capabilities = uniqueStrings(request.capabilities ?? definition.capabilities).filter((capability) => {
    if (DEFAULT_CHILD_DENIED_CAPABILITIES.includes(capability) || CONTROL_TOOL_RE.test(capability)) {
      denied.push({ capability, reason: "child_control_denied" });
      return false;
    }
    return true;
  });

  return {
    permissionMode,
    tools: [...new Set(tools)],
    capabilities,
    denied,
    warnings,
    writeScope: uniqueStrings(request.writeScope ?? definition.writeScope),
    readScope: uniqueStrings(request.readScope ?? definition.readScope),
    isolation: request.isolation ?? definition.isolation ?? "shared",
    requiresExplicitApproval: uniqueStrings([
      "merge", "deploy", "publish", "destructive-git", "capability-elevation",
      ...(request.requiresExplicitApproval ?? []),
    ]),
  };
}

export function commandRequiresExplicitApproval(command) {
  const text = String(command ?? "");
  if (DESTRUCTIVE_GIT_RE.test(text)) return { required: true, reason: "destructive_git" };
  if (SENSITIVE_COMMAND_RE.test(text)) return { required: true, reason: "irreversible_or_external_action" };
  return { required: false };
}

export function assertNoControlCapabilities(tools = [], capabilities = []) {
  const forbidden = [...tools, ...capabilities].filter((value) => CONTROL_TOOL_RE.test(value) || ["agent", "workflow"].includes(value));
  if (forbidden.length) throw new Error(`Child control capabilities are denied: ${forbidden.join(", ")}.`);
}

function uniqueStrings(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map((entry) => String(entry ?? "").trim()).filter(Boolean))];
}
