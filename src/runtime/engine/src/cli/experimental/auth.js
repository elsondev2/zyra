// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function parseAuthInput(options) {
  if (options.authToken !== void 0 && options.authTokenFile !== void 0) {
    return { errors: ["--auth-token and --auth-token-file are mutually exclusive"] };
  }
  if (options.authToken !== void 0) {
    return { auth: { type: "token", token: options.authToken }, errors: [] };
  }
  if (options.authTokenFile !== void 0) {
    return { auth: { type: "file", path: options.authTokenFile }, errors: [] };
  }
  return { errors: [] };
}
export {
  parseAuthInput
};
