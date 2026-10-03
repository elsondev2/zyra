// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function contentText(content, separator = "\n") {
  if (typeof content === "string") return content;
  return content.filter((block) => block.type === "text").map((block) => block.text).join(separator);
}
export {
  contentText
};
