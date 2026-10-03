// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function abortReason(signal) {
  if (signal.reason !== void 0) return signal.reason;
  const error = new Error("The operation was aborted");
  error.name = "AbortError";
  return error;
}
function operationSignal(signal) {
  return signal ?? new AbortController().signal;
}
function raceWithAbortSignal(operation, signal) {
  if (!signal) return operation;
  if (signal.aborted) {
    void operation.catch(() => {
    });
    return Promise.reject(abortReason(signal));
  }
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => signal.removeEventListener("abort", onAbort);
    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(abortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    void operation.then(
      (value) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(value);
      },
      (error) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(error);
      }
    );
    if (signal.aborted) onAbort();
  });
}
export {
  operationSignal,
  raceWithAbortSignal
};
