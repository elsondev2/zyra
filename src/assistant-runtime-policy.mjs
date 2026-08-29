export const DEFAULT_ASSISTANT_REASONING_SUMMARY = "detailed";
export const DEFAULT_ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_TOKENS = 256_000;
export const MIN_ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_TOKENS = 64_000;
export const MAX_ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_TOKENS = 372_000;
export const ASSISTANT_CONTEXT_COMPACTION_OUTPUT_RESERVE_TOKENS = 16_000;
export const ASSISTANT_CONTEXT_COMPACTION_PROMPT_HEADROOM_TOKENS = 16_000;
export const MIN_ASSISTANT_AUTOMATIC_COMPACTION_CONTEXT_TOKENS = 32_000;

export function normalizeAssistantReasoningSummary(value) {
  return value === "auto" || value === "concise" || value === "detailed"
    ? value
    : DEFAULT_ASSISTANT_REASONING_SUMMARY;
}

export function normalizeAssistantContextCompactionThreshold(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_TOKENS;
  return Math.max(
    MIN_ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_TOKENS,
    Math.min(MAX_ASSISTANT_CONTEXT_COMPACTION_THRESHOLD_TOKENS, Math.round(parsed)),
  );
}

export function applyAssistantReasoningSummary(payload, mode) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;
  if (!payload.reasoning || typeof payload.reasoning !== "object" || Array.isArray(payload.reasoning)) return undefined;
  if (!Array.isArray(payload.include) || !payload.include.includes("reasoning.encrypted_content")) return undefined;
  return {
    ...payload,
    reasoning: {
      ...payload.reasoning,
      summary: normalizeAssistantReasoningSummary(mode),
    },
  };
}

export function resolveAssistantContextCompactionThreshold(contextWindow, configuredThreshold) {
  const threshold = normalizeAssistantContextCompactionThreshold(configuredThreshold);
  const windowTokens = Number(contextWindow);
  if (!Number.isFinite(windowTokens) || windowTokens <= 0) return threshold;
  return Math.min(
    threshold,
    Math.max(1, Math.floor(windowTokens) - ASSISTANT_CONTEXT_COMPACTION_OUTPUT_RESERVE_TOKENS),
  );
}

export function shouldCompactAssistantContext({
  contextTokens,
  contextWindow,
  configuredThreshold,
  promptTokens = 0,
  additionalContextTokens = 0,
  imageCount = 0,
}) {
  const tokens = Number(contextTokens);
  if (!Number.isFinite(tokens) || tokens < MIN_ASSISTANT_AUTOMATIC_COMPACTION_CONTEXT_TOKENS) return false;
  const threshold = resolveAssistantContextCompactionThreshold(contextWindow, configuredThreshold);
  const projectedTokens = tokens
    + Math.max(0, Number(promptTokens) || 0)
    + Math.max(0, Number(additionalContextTokens) || 0)
    + Math.max(0, Number(imageCount) || 0) * 8_192
    + ASSISTANT_CONTEXT_COMPACTION_PROMPT_HEADROOM_TOKENS;
  return projectedTokens >= threshold;
}
