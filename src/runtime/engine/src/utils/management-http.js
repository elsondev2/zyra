// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const RETRYABLE_STATUS_CODES = /* @__PURE__ */ new Set([408, 425, 429, 500, 502, 503, 504]);
async function fetchWithRetry(input, init = void 0, options = {}) {
  const maxRetries = options.maxRetries === void 0 || !Number.isFinite(options.maxRetries) ? 2 : Math.max(0, Math.floor(options.maxRetries));
  const retryOnStatus = options.retryOnStatus ?? true;
  const parentSignal = init?.signal ?? void 0;
  const timeoutSignal = options.timeoutMs !== void 0 && options.timeoutMs > 0 ? AbortSignal.timeout(options.timeoutMs) : void 0;
  const attemptTimeoutMs = options.attemptTimeoutMs !== void 0 && options.attemptTimeoutMs > 0 ? options.attemptTimeoutMs : void 0;
  for (let attempt = 0; ; attempt++) {
    parentSignal?.throwIfAborted();
    timeoutSignal?.throwIfAborted();
    const attemptTimeoutSignal = attemptTimeoutMs ? AbortSignal.timeout(attemptTimeoutMs) : void 0;
    const signals = [parentSignal, timeoutSignal, attemptTimeoutSignal].filter(
      (signal2) => signal2 !== void 0
    );
    const signal = signals.length > 1 ? AbortSignal.any(signals) : signals[0];
    try {
      const response = await fetch(input, signal ? { ...init, signal } : init);
      const shouldRetry = retryOnStatus && RETRYABLE_STATUS_CODES.has(response.status) && attempt < maxRetries;
      if (!shouldRetry) return response;
      try {
        await response.body?.cancel();
      } catch {
      }
    } catch (error) {
      const attemptTimedOut = attemptTimeoutSignal?.aborted === true && !parentSignal?.aborted && !timeoutSignal?.aborted;
      if (parentSignal?.aborted || timeoutSignal?.aborted || error instanceof Error && error.name === "AbortError" && !attemptTimedOut && timeoutSignal === void 0 || attempt >= maxRetries) {
        throw error;
      }
    }
  }
}
export {
  fetchWithRetry
};
