// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function sanitizeSurrogates(text) {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "");
}
export {
  sanitizeSurrogates
};
