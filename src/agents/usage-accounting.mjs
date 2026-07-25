import { addUsage, normalizeUsage } from "./contracts.mjs";

export class FleetUsageAccounting {
  constructor(budget = {}) {
    this.budget = {
      maxTokens: positive(budget.maxTokens, 1_500_000),
      maxRequests: positive(budget.maxRequests, 1000),
      maxCostUsd: positive(budget.maxCostUsd, 1000),
    };
    this.byRun = new Map();
  }

  record(runId, usage, options = {}) {
    const current = this.byRun.get(runId) ?? normalizeUsage();
    const next = options.incremental === false ? normalizeUsage(usage) : addUsage(current, usage);
    this.byRun.set(runId, next);
    return next;
  }

  total() {
    return [...this.byRun.values()].reduce((sum, usage) => addUsage(sum, usage), normalizeUsage());
  }

  remaining() {
    const total = this.total();
    return {
      tokens: Math.max(0, this.budget.maxTokens - total.totalTokens),
      requests: Math.max(0, this.budget.maxRequests - total.requests),
      costUsd: Math.max(0, this.budget.maxCostUsd - total.cost),
    };
  }

  canSchedule(estimate = {}) {
    const remaining = this.remaining();
    return remaining.tokens >= Number(estimate.totalTokens ?? estimate.tokens ?? 0)
      && remaining.requests >= Number(estimate.requests ?? 1)
      && remaining.costUsd >= Number(estimate.costUsd ?? estimate.cost ?? 0);
  }
}

export function usageFromAssistantMessage(message = {}) {
  const usage = message?.usage ?? {};
  return normalizeUsage({
    input: usage.input,
    output: usage.output,
    cacheRead: usage.cacheRead,
    cacheWrite: usage.cacheWrite,
    reasoning: usage.reasoning ?? usage.reasoningTokens ?? usage.outputDetails?.reasoningTokens,
    total: usage.totalTokens ?? usage.total,
    requests: message?.role === "assistant" ? 1 : 0,
    cost: typeof usage.cost === "object" ? usage.cost?.total : usage.cost,
  });
}

function positive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}
