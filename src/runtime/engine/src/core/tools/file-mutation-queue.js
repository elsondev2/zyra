// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { realpath } from "node:fs/promises";
import { resolve } from "node:path";
const fileMutationQueues = /* @__PURE__ */ new Map();
let registrationQueue = Promise.resolve();
function isMissingPathError(error) {
  return typeof error === "object" && error !== null && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR");
}
async function getMutationQueueKey(filePath) {
  const resolvedPath = resolve(filePath);
  try {
    return await realpath(resolvedPath);
  } catch (error) {
    if (isMissingPathError(error)) {
      return resolvedPath;
    }
    throw error;
  }
}
async function withFileMutationQueue(filePath, fn) {
  const registration = registrationQueue.then(async () => {
    const key2 = await getMutationQueueKey(filePath);
    const currentQueue2 = fileMutationQueues.get(key2) ?? Promise.resolve();
    let releaseNext2;
    const nextQueue = new Promise((resolveQueue) => {
      releaseNext2 = resolveQueue;
    });
    const chainedQueue2 = currentQueue2.then(() => nextQueue);
    fileMutationQueues.set(key2, chainedQueue2);
    return { key: key2, currentQueue: currentQueue2, chainedQueue: chainedQueue2, releaseNext: releaseNext2 };
  });
  registrationQueue = registration.then(
    () => void 0,
    () => void 0
  );
  const { key, currentQueue, chainedQueue, releaseNext } = await registration;
  await currentQueue;
  try {
    return await fn();
  } finally {
    releaseNext();
    if (fileMutationQueues.get(key) === chainedQueue) {
      fileMutationQueues.delete(key);
    }
  }
}
export {
  withFileMutationQueue
};
