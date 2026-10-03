// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function loadNodeOs() {
  if (typeof process === "undefined" || !(process.versions?.node || process.versions?.bun)) {
    return null;
  }
  return process.getBuiltinModule?.("node:os") ?? null;
}
const nodeOs = loadNodeOs();
function getZyraUserAgent() {
  return nodeOs ? `zyra (${nodeOs.platform()} ${nodeOs.release()}; ${nodeOs.arch()})` : "zyra (browser)";
}
export {
  getZyraUserAgent
};
