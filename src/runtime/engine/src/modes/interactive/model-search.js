// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function getModelSearchText(item) {
  const { id, provider } = item;
  const name = item.name ? ` ${item.name}` : "";
  return `${id} ${provider} ${provider}/${id} ${provider} ${id}${name}`;
}
function getModelSelectorSearchText(item) {
  const { id, provider } = item;
  const name = item.name ? ` ${item.name}` : "";
  return `${provider} ${provider}/${id} ${provider} ${id}${name}`;
}
export {
  getModelSearchText,
  getModelSelectorSearchText
};
