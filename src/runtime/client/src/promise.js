// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function createPromiseResolvers() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}
export {
  createPromiseResolvers
};
