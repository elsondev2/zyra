// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function isTruthyEnvFlag(value) {
  if (!value) return false;
  return value === "1" || value.toLowerCase() === "true" || value.toLowerCase() === "yes";
}
function isInstallTelemetryEnabled(settingsManager, telemetryEnv = process.env.ZYRA_TELEMETRY) {
  return telemetryEnv !== void 0 ? isTruthyEnvFlag(telemetryEnv) : settingsManager.getEnableInstallTelemetry();
}
export {
  isInstallTelemetryEnabled
};
