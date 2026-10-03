// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function buildInitialMessage({
  parsed,
  fileText,
  fileImages,
  stdinContent
}) {
  const parts = [];
  if (stdinContent !== void 0) {
    parts.push(stdinContent);
  }
  if (fileText) {
    parts.push(fileText);
  }
  if (parsed.messages.length > 0) {
    parts.push(parsed.messages[0]);
    parsed.messages.shift();
  }
  return {
    initialMessage: parts.length > 0 ? parts.join("") : void 0,
    initialImages: fileImages && fileImages.length > 0 ? fileImages : void 0
  };
}
export {
  buildInitialMessage
};
