// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function ok(value) {
  return { ok: true, value };
}
function err(error) {
  return { ok: false, error };
}
function getOrThrow(result) {
  if (!result.ok) throw result.error;
  return result.value;
}
function getOrUndefined(result) {
  return result.ok ? result.value : void 0;
}
function toError(error) {
  if (error instanceof Error) return error;
  if (typeof error === "string") return new Error(error);
  try {
    return new Error(JSON.stringify(error));
  } catch {
    return new Error(String(error));
  }
}
class FileError extends Error {
  /** Backend-independent error code. */
  code;
  /** Absolute addressed path associated with the failure, when available. */
  path;
  constructor(code, message, path, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "FileError";
    this.code = code;
    this.path = path;
  }
}
class ExecutionError extends Error {
  /** Backend-independent error code. */
  code;
  constructor(code, message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "ExecutionError";
    this.code = code;
  }
}
class CompactionError extends Error {
  /** Backend-independent error code. */
  code;
  constructor(code, message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "CompactionError";
    this.code = code;
  }
}
class BranchSummaryError extends Error {
  /** Backend-independent error code. */
  code;
  constructor(code, message, cause) {
    super(message, cause === void 0 ? void 0 : { cause });
    this.name = "BranchSummaryError";
    this.code = code;
  }
}
export {
  BranchSummaryError,
  CompactionError,
  ExecutionError,
  FileError,
  err,
  getOrThrow,
  getOrUndefined,
  ok,
  toError
};
