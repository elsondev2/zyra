// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import "../messages.js";
class SessionError extends Error {
  code;
  constructor(code, message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "SessionError";
    this.code = code;
  }
}
export {
  SessionError
};
