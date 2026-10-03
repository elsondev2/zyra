// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function decodeCodePoint(codePoint) {
  if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 1114111) {
    return void 0;
  }
  return String.fromCodePoint(codePoint);
}
function decodeHtmlEntity(entity) {
  switch (entity) {
    case "amp":
      return "&";
    case "lt":
      return "<";
    case "gt":
      return ">";
    case "quot":
      return '"';
    case "apos":
      return "'";
  }
  if (entity.startsWith("#x") || entity.startsWith("#X")) {
    return decodeCodePoint(Number.parseInt(entity.slice(2), 16));
  }
  if (entity.startsWith("#")) {
    return decodeCodePoint(Number.parseInt(entity.slice(1), 10));
  }
  return void 0;
}
function decodeHtmlEntityAt(html, index) {
  const semicolonIndex = html.indexOf(";", index + 1);
  if (semicolonIndex === -1 || semicolonIndex - index > 16) {
    return void 0;
  }
  const entity = html.slice(index + 1, semicolonIndex);
  const decoded = decodeHtmlEntity(entity);
  if (decoded === void 0) {
    return void 0;
  }
  return { text: decoded, length: semicolonIndex - index + 1 };
}
export {
  decodeHtmlEntity,
  decodeHtmlEntityAt
};
