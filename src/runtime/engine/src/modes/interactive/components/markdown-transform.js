// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function createMarkdownTransform(messageType, isStreaming, transformers) {
  return (markdown, availableWidth) => applyMarkdownTransformers(markdown, { messageType, isStreaming, availableWidth }, transformers);
}
function applyMarkdownTransformers(markdown, context, transformers) {
  let transformedMarkdown = markdown;
  for (const transformer of transformers) {
    try {
      const transformed = transformer(transformedMarkdown, context);
      if (typeof transformed === "string") {
        transformedMarkdown = transformed;
      }
    } catch {
    }
  }
  return transformedMarkdown;
}
export {
  createMarkdownTransform
};
