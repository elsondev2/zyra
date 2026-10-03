// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { estimateContextTokens } from "../utils/estimate.js";
const CONTEXT_SAFETY_TOKENS = 4096;
const MIN_MAX_TOKENS = 1;
function clampMaxTokensToContext(model, context, maxTokens) {
  if (model.contextWindow <= 0) return Math.max(MIN_MAX_TOKENS, maxTokens);
  const available = model.contextWindow - estimateContextTokens(context).tokens - CONTEXT_SAFETY_TOKENS;
  return Math.min(maxTokens, Math.max(MIN_MAX_TOKENS, available));
}
function buildBaseOptions(model, context, options, apiKey) {
  const samplingParams = model.samplingParams || options?.samplingParams ? { ...model.samplingParams, ...options?.samplingParams } : void 0;
  return {
    temperature: options?.temperature,
    samplingParams,
    maxTokens: clampMaxTokensToContext(model, context, options?.maxTokens ?? model.maxTokens),
    signal: options?.signal,
    telemetryContext: options?.telemetryContext,
    apiKey: apiKey || options?.apiKey,
    fetch: options?.fetch,
    transport: options?.transport,
    cacheRetention: options?.cacheRetention,
    sessionId: options?.sessionId,
    headers: options?.headers,
    onPayload: options?.onPayload,
    onResponse: options?.onResponse,
    timeoutMs: options?.timeoutMs,
    websocketConnectTimeoutMs: options?.websocketConnectTimeoutMs,
    maxRetries: options?.maxRetries,
    maxRetryDelayMs: options?.maxRetryDelayMs,
    metadata: options?.metadata,
    env: options?.env
  };
}
const MIN_ANSWER_TOKENS = 1024;
const DEFAULT_THINKING_BUDGETS = {
  minimal: 1024,
  low: 2048,
  medium: 8192,
  high: 16384
};
function clampReasoning(effort) {
  return effort === "xhigh" || effort === "max" ? "high" : effort;
}
function thinkingBudgetForLevel(reasoningLevel, customBudgets) {
  const budgets = { ...DEFAULT_THINKING_BUDGETS, ...customBudgets };
  const level = clampReasoning(reasoningLevel);
  return budgets[level];
}
function clampThinkingBudgetToAnswerRoom(thinkingBudget, ceiling) {
  return Math.min(thinkingBudget, Math.max(0, ceiling - MIN_ANSWER_TOKENS));
}
function adjustMaxTokensForThinking(baseMaxTokens, modelMaxTokens, reasoningLevel, customBudgets) {
  let thinkingBudget = thinkingBudgetForLevel(reasoningLevel, customBudgets);
  const maxTokens = baseMaxTokens === void 0 ? modelMaxTokens : Math.min(baseMaxTokens + thinkingBudget, modelMaxTokens);
  if (maxTokens <= thinkingBudget) {
    thinkingBudget = clampThinkingBudgetToAnswerRoom(thinkingBudget, maxTokens);
  }
  return { maxTokens, thinkingBudget };
}
export {
  DEFAULT_THINKING_BUDGETS,
  MIN_ANSWER_TOKENS,
  adjustMaxTokensForThinking,
  buildBaseOptions,
  clampMaxTokensToContext,
  clampReasoning,
  clampThinkingBudgetToAnswerRoom,
  thinkingBudgetForLevel
};
