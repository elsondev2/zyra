// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import chalk from "chalk";
const emittedDeprecationWarnings = /* @__PURE__ */ new Set();
function warnDeprecation(message) {
  if (emittedDeprecationWarnings.has(message)) return;
  emittedDeprecationWarnings.add(message);
  console.warn(chalk.yellow(`Deprecation warning: ${message}`));
}
function clearDeprecationWarningsForTests() {
  emittedDeprecationWarnings.clear();
}
export {
  clearDeprecationWarningsForTests,
  warnDeprecation
};
