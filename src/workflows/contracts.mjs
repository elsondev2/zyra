import { createHash, randomUUID } from "node:crypto";
import { normalizeBudget } from "../agents/contracts.mjs";

export const WORKFLOW_SCHEMA_VERSION = 1;
export const MAX_WORKFLOW_SOURCE_BYTES = 256 * 1024;
export const MAX_WORKFLOW_CALLS = 1000;
export const WORKFLOW_WARNING_CALLS = 25;
export const WORKFLOW_WARNING_TOKENS = 1_500_000;

export function normalizeWorkflowDefinition(input = {}) {
  const source = String(input.source ?? "");
  if (!source.trim()) throw new Error("Workflow source is required.");
  if (Buffer.byteLength(source, "utf8") > MAX_WORKFLOW_SOURCE_BYTES) throw new Error(`Workflow source exceeds ${MAX_WORKFLOW_SOURCE_BYTES} bytes.`);
  const name = String(input.name ?? input.meta?.name ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error("Workflow name must use lowercase letters, numbers, and hyphens.");
  return {
    version: WORKFLOW_SCHEMA_VERSION,
    name,
    description: String(input.description ?? input.meta?.description ?? "").trim(),
    phases: strings(input.phases ?? input.meta?.phases),
    budgets: normalizeWorkflowBudget(input.budgets ?? input.meta?.budgets),
    source,
    scriptHash: hashWorkflowSource(source),
    revision: String(input.revision ?? input.meta?.version ?? 1),
    origin: String(input.origin ?? "temporary"),
    file: input.file ?? null,
    trusted: input.trusted !== false,
    temporary: input.temporary === true || input.origin === "temporary",
    validation: input.validation ?? null,
  };
}

export function normalizeWorkflowCall(input = {}) {
  return {
    version: WORKFLOW_SCHEMA_VERSION,
    callId: String(input.callId ?? randomUUID()),
    workflowRunId: String(input.workflowRunId),
    phaseId: input.phaseId ? String(input.phaseId) : null,
    stableKey: String(input.stableKey ?? input.callId ?? "call"),
    fingerprint: String(input.fingerprint),
    status: String(input.status ?? "queued"),
    agentRunId: input.agentRunId ? String(input.agentRunId) : null,
    promptHash: input.promptHash ? String(input.promptHash) : null,
    selectedModel: input.selectedModel ? String(input.selectedModel) : null,
    requestedModel: input.requestedModel ? String(input.requestedModel) : null,
    attempt: Math.max(1, Number(input.attempt) || 1),
    cached: Boolean(input.cached),
    escalated: Boolean(input.escalated),
    createdAt: input.createdAt ?? new Date().toISOString(),
    completedAt: input.completedAt ?? null,
    error: input.error ?? null,
  };
}

export function normalizeWorkflowBudget(input = {}) {
  const budget = normalizeBudget(input);
  return {
    ...budget,
    maxCalls: Math.min(MAX_WORKFLOW_CALLS, budget.maxCalls),
  };
}

export function hashWorkflowSource(source) {
  return createHash("sha256").update(String(source).replace(/\r\n/g, "\n")).digest("hex");
}

export function stableJson(value) {
  return JSON.stringify(sortValue(value));
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortValue(value[key])]));
  return value;
}

function strings(value) {
  const list = Array.isArray(value) ? value : value ? [value] : [];
  return [...new Set(list.map((entry) => String(entry ?? "").trim()).filter(Boolean))];
}
