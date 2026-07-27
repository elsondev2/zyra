import { defineTool } from "@earendil-works/pi-coding-agent";
import { browserControlSchema, BROWSER_CONTROL_OPERATIONS } from "./tool-contracts.mjs";
import { normalizeControlToolInput, unavailableControlResult } from "./contracts.mjs";

export function createBrowserControlTool(options = {}) {
  return defineTool({
    name: "browser_control",
    label: "Browser control",
    description: "Observe and control only an explicitly granted Zyra Browser or paired Chrome tab through the desktop permission broker.",
    parameters: browserControlSchema,
    execute: async (_toolCallId, input = {}, signal) => {
      const normalized = normalizeControlToolInput(input);
      if (!BROWSER_CONTROL_OPERATIONS.includes(normalized.operation)) {
        return toolResult(`Operation ${normalized.operation} is not available for browser_control.`, { ok: false, code: "CONTROL_UNKNOWN_OPERATION" });
      }
      if (!options.client) {
        const unavailable = unavailableControlResult("Browser control");
        return toolResult(unavailable.error.message, unavailable);
      }
      try {
        const operation = toBridgeOperation(normalized);
        const result = await options.client.request(operation, { signal, timeoutMs: normalized.timeoutMs });
        return toolResult(formatControlResult(normalized.operation, result), result);
      } catch (error) {
        return toolResult(`Browser control failed: ${error instanceof Error ? error.message : String(error)}`, {
          ok: false,
          code: error?.code || "CONTROL_ERROR",
          retryable: Boolean(error?.retryable),
          freshRevision: error?.freshRevision,
        });
      }
    },
  });
}

function toBridgeOperation(input) {
  if (["list_targets", "request_grant", "observe", "release"].includes(input.operation)) return input;
  return {
    operation: "act",
    version: 1,
    requestId: input.requestId || `tool:${Date.now()}`,
    grantId: input.grantId,
    targetId: input.targetId,
    observationRevision: input.observationRevision,
    action: {
      type: input.operation,
      ...(input.elementRef ? { elementRef: input.elementRef } : {}),
      ...(input.x !== undefined ? { x: input.x } : {}),
      ...(input.y !== undefined ? { y: input.y } : {}),
      ...(input.fromX !== undefined ? { fromX: input.fromX } : {}),
      ...(input.fromY !== undefined ? { fromY: input.fromY } : {}),
      ...(input.toX !== undefined ? { toX: input.toX } : {}),
      ...(input.toY !== undefined ? { toY: input.toY } : {}),
      ...(input.durationMs !== undefined ? { durationMs: input.durationMs } : {}),
      ...(input.button ? { button: input.button } : {}),
      ...(input.clickCount !== undefined ? { clickCount: input.clickCount } : {}),
      ...(input.url ? { url: input.url } : {}),
      ...(input.text !== undefined ? { text: input.text } : {}),
      ...(input.replace !== undefined ? { replace: input.replace } : {}),
      ...(input.key ? { key: input.key } : {}),
      ...(input.modifiers ? { modifiers: input.modifiers } : {}),
      ...(input.deltaX !== undefined ? { deltaX: input.deltaX } : {}),
      ...(input.deltaY !== undefined ? { deltaY: input.deltaY } : {}),
      ...(input.values ? { values: input.values } : {}),
      ...(input.condition ? { condition: input.condition } : {}),
      ...(input.timeoutMs !== undefined ? { timeoutMs: input.timeoutMs } : {}),
      ...(input.sideEffect ? { sideEffect: input.sideEffect } : {}),
    },
  };
}

function formatControlResult(operation, result) {
  if (operation === "list_targets") {
    const targets = (Array.isArray(result.targets) ? result.targets : []).slice(0, 32).map((target) => ({
      targetId: target.targetId,
      kind: target.kind,
      tabId: target.tabId,
      title: target.title,
      url: target.url,
      origin: target.origin,
    }));
    const grants = (Array.isArray(result.grants) ? result.grants : []).slice(0, 32).map((grant) => ({
      grantId: grant.grantId,
      targetId: grant.targetId,
      capabilities: grant.capabilities,
      expiresAt: grant.expiresAt,
      remainingActions: Math.max(0, Number(grant.maxActions) - Number(grant.actionCount)),
    }));
    return `Available Browser targets and your active grants:\n${JSON.stringify({ targets, grants }, null, 2)}`;
  }
  if (operation === "request_grant") {
    return result.pending
      ? `Browser access is waiting for explicit user approval in Control Center.\n${JSON.stringify({ requestId: result.request?.requestId, targetId: result.request?.targetId, capabilities: result.request?.capabilities, expiresAt: result.request?.expiresAt }, null, 2)}`
      : "Control grant issued.";
  }
  if (operation === "release") return "Control grant released.";
  if (result.observation) {
    const observation = result.observation;
    return `Browser ${operation} completed.\n${JSON.stringify({ revision: observation.revision, targetId: observation.targetId, url: observation.url, title: observation.title, viewport: observation.viewport, screenshotAttached: Boolean(result.screenshot) }, null, 2)}`;
  }
  return `Browser ${operation} completed.`;
}

function toolResult(text, details) {
  const screenshot = details?.screenshot;
  const content = [{ type: "text", text }];
  if (screenshot?.data && /^image\/(?:jpeg|png|webp)$/.test(String(screenshot.mimeType || ""))) {
    content.push({ type: "image", data: screenshot.data, mimeType: screenshot.mimeType });
  }
  const boundedDetails = screenshot
    ? { ...details, screenshot: { mimeType: screenshot.mimeType, bytes: screenshot.bytes } }
    : details;
  return { content, details: boundedDetails };
}
