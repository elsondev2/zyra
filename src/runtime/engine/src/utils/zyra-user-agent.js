// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function getZyraUserAgent(version) {
  const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
  return `zyra/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}
export {
  getZyraUserAgent
};
