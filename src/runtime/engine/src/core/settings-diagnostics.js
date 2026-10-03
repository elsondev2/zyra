// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function collectSettingsDiagnostics(settingsManager) {
  return settingsManager.drainErrors().map(({ scope, path, error }) => ({
    type: "warning",
    message: path ? `Invalid settings file ${path}: ${error.message}` : `Invalid ${scope} settings: ${error.message}`
  }));
}
function deduplicateDiagnostics(diagnostics) {
  const seen = /* @__PURE__ */ new Set();
  return diagnostics.filter((diagnostic) => {
    const key = `${diagnostic.type}\0${diagnostic.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export {
  collectSettingsDiagnostics,
  deduplicateDiagnostics
};
