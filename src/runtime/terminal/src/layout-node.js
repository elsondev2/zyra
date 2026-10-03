// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
const LAYOUT_NODE = Symbol.for("./layout-node.js");
function getLayoutNode(component) {
  const candidate = component;
  return typeof candidate[LAYOUT_NODE] === "function" ? candidate[LAYOUT_NODE]() : void 0;
}
export {
  LAYOUT_NODE,
  getLayoutNode
};
