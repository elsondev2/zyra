// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function headersToRecord(headers) {
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}
function providerHeadersToRecord(headers) {
  if (!headers) return void 0;
  const result = {};
  for (const [key, value] of Object.entries(headers)) {
    if (value !== null) result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : void 0;
}
export {
  headersToRecord,
  providerHeadersToRecord
};
