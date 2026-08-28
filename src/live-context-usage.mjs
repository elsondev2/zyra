function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function estimateLiveMessageTokens(message) {
  if (!message || typeof message !== "object") return 0;
  try {
    return Math.max(0, Math.ceil(JSON.stringify(message).length / 4));
  } catch {
    return 0;
  }
}

export function resolveLiveContextUsage({ reported, baselineTokens, activeMessage, contextWindow }) {
  const reportedTokens = finiteNumber(reported?.tokens) ?? 0;
  const baseline = finiteNumber(baselineTokens);
  const liveMessageTokens = baseline === undefined ? 0 : estimateLiveMessageTokens(activeMessage);
  const tokens = Math.max(reportedTokens, baseline === undefined ? 0 : baseline + liveMessageTokens);
  const resolvedContextWindow = finiteNumber(reported?.contextWindow)
    ?? finiteNumber(contextWindow)
    ?? 0;
  if (tokens <= 0 || resolvedContextWindow <= 0) return reported;
  return {
    ...(reported || {}),
    tokens,
    contextWindow: resolvedContextWindow,
    percent: (tokens / resolvedContextWindow) * 100,
    estimated: true,
  };
}
