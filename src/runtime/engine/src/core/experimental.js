// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const PREFER_STRICT_TOOL_SAMPLING = { type: "json_schema", strict: "prefer" };
function areExperimentalFeaturesEnabled() {
  return process.env.ZYRA_EXPERIMENTAL === "1";
}
function getExperimentalToolSampling() {
  return areExperimentalFeaturesEnabled() ? PREFER_STRICT_TOOL_SAMPLING : void 0;
}
export {
  areExperimentalFeaturesEnabled,
  getExperimentalToolSampling
};
