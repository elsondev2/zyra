// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function splitBom(content) {
  return content.startsWith("\uFEFF") ? { bom: "\uFEFF", text: content.slice(1) } : { bom: "", text: content };
}
function stripBom(content) {
  return splitBom(content).text;
}
export {
  splitBom,
  stripBom
};
