export const BUILT_IN_WORKFLOW_NAMES = Object.freeze(["review-changes"]);

export function estimateWorkflowProjection(definition, args = {}) {
  const staticCalls = definition?.validation?.projectedCalls ?? (String(definition?.source ?? "").match(/\bagent\s*\(/g) ?? []).length;
  const requested = Number(args.projectedCalls ?? args.maxAgents);
  const calls = Number.isFinite(requested) && requested > 0 ? requested : staticCalls;
  const tokensPerCall = Math.max(0, Number(args.projectedTokensPerCall) || 25_000);
  const costPerCall = Math.max(0, Number(args.projectedCostPerCall) || 0);
  return { calls, totalTokens: calls * tokensPerCall, requests: calls, cost: calls * costPerCall };
}
