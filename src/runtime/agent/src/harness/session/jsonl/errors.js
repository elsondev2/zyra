// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { SessionError } from "../types.js";
class JsonlDecodeError extends Error {
  kind;
  constructor(kind, message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "JsonlDecodeError";
    this.kind = kind;
  }
}
function fileResult(result, message) {
  if (!result.ok) {
    throw new SessionError(
      result.error.code === "not_found" ? "not_found" : "storage",
      `${message}: ${result.error.message}`,
      result.error
    );
  }
  return result.value;
}
function invalidFile(path, line, cause) {
  return new SessionError("invalid_entry", `Invalid JSONL v4 session ${path}: line ${line} ${cause.message}`, cause);
}
export {
  JsonlDecodeError,
  fileResult,
  invalidFile
};
