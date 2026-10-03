// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const CACHE_TTL_MS = 5 * 60 * 1e3;
const NOISE_FLOOR_TOKENS = 1024;
function detectMiss(prev, message, models) {
  const usage = message.usage;
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  if (!prev || promptTokens <= 0 || usage.cacheRead + usage.cacheWrite === 0 && !prev.reportedCache) {
    return void 0;
  }
  const missedTokens = Math.min(prev.promptTokens, promptTokens) - usage.cacheRead;
  if (missedTokens <= NOISE_FLOOR_TOKENS) return void 0;
  const paidTokens = usage.input + usage.cacheWrite;
  const paidPerToken = paidTokens > 0 ? (usage.cost.input + usage.cost.cacheWrite) / paidTokens : 0;
  const readPerToken = usage.cacheRead > 0 ? usage.cost.cacheRead / usage.cacheRead : (models.getModel(message.provider, message.model)?.cost.cacheRead ?? 0) / 1e6;
  return {
    missedTokens,
    missedCost: missedTokens * Math.max(0, paidPerToken - readPerToken),
    idleMs: Math.max(0, message.timestamp - prev.timestamp),
    modelChanged: `${message.provider}/${message.model}` !== prev.modelKey
  };
}
function asPreviousRequest(message, reportedCache) {
  const usage = message.usage;
  const promptTokens = usage.input + usage.cacheRead + usage.cacheWrite;
  if (promptTokens <= 0) return void 0;
  return {
    promptTokens,
    modelKey: `${message.provider}/${message.model}`,
    timestamp: message.timestamp,
    reportedCache: reportedCache || usage.cacheRead + usage.cacheWrite > 0
  };
}
function scan(entries, models) {
  let prev;
  const totals = { missedTokens: 0, missedCost: 0, missCount: 0 };
  const misses = /* @__PURE__ */ new Map();
  for (const entry of entries) {
    if (entry.type === "compaction" || entry.type === "branch_summary") {
      prev = void 0;
      continue;
    }
    if (entry.type === "message" && entry.message.role === "assistant") {
      const miss = detectMiss(prev, entry.message, models);
      if (miss) {
        totals.missedTokens += miss.missedTokens;
        totals.missedCost += miss.missedCost;
        totals.missCount += 1;
        misses.set(entry.message, miss);
      }
      prev = asPreviousRequest(entry.message, prev?.reportedCache ?? false) ?? prev;
    }
  }
  return { prev, totals, misses };
}
function computeCacheWaste(entries, models) {
  return scan(entries, models).totals;
}
function collectCacheMisses(entries, models) {
  return scan(entries, models).misses;
}
function detectCacheMiss(entries, message, models) {
  return detectMiss(scan(entries, models).prev, message, models);
}
export {
  CACHE_TTL_MS,
  collectCacheMisses,
  computeCacheWaste,
  detectCacheMiss
};
