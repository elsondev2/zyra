// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH = 64;
function clampOpenAIPromptCacheKey(key) {
  if (key === void 0) return void 0;
  const chars = Array.from(key);
  if (chars.length <= OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH) return key;
  return chars.slice(0, OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH).join("");
}
export {
  OPENAI_PROMPT_CACHE_KEY_MAX_LENGTH,
  clampOpenAIPromptCacheKey
};
