// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function createSourceInfo(path, metadata) {
  return {
    path,
    source: metadata.source,
    scope: metadata.scope,
    origin: metadata.origin,
    baseDir: metadata.baseDir
  };
}
function createSyntheticSourceInfo(path, options) {
  return {
    path,
    source: options.source,
    scope: options.scope ?? "temporary",
    origin: options.origin ?? "top-level",
    baseDir: options.baseDir
  };
}
export {
  createSourceInfo,
  createSyntheticSourceInfo
};
