// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
let defaultStreamFn;
function setDefaultStreamFn(streamFn) {
  defaultStreamFn = streamFn;
}
function getDefaultStreamFn() {
  if (!defaultStreamFn) {
    throw new Error("No default stream function configured. Pass streamFn explicitly or call setDefaultStreamFn().");
  }
  return defaultStreamFn;
}
export {
  getDefaultStreamFn,
  setDefaultStreamFn
};
