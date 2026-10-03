// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { getOrThrow } from "../types.js";
const states = /* @__PURE__ */ new WeakMap();
function getState(env) {
  let state = states.get(env);
  if (!state) {
    state = { queues: /* @__PURE__ */ new Map(), registration: Promise.resolve() };
    states.set(env, state);
  }
  return state;
}
async function getMutationQueueKey(env, path) {
  const absolutePath = getOrThrow(await env.absolutePath(path));
  const canonicalPath = await env.canonicalPath(absolutePath);
  if (canonicalPath.ok) return canonicalPath.value;
  if (canonicalPath.error.code === "not_found" || canonicalPath.error.code === "not_supported") return absolutePath;
  throw canonicalPath.error;
}
async function withFileMutationQueue(env, path, fn) {
  const state = getState(env);
  const registration = state.registration.then(async () => {
    const key2 = await getMutationQueueKey(env, path);
    const currentQueue2 = state.queues.get(key2) ?? Promise.resolve();
    let releaseNext2 = () => {
    };
    const nextQueue = new Promise((resolve) => {
      releaseNext2 = resolve;
    });
    const chainedQueue2 = currentQueue2.then(() => nextQueue);
    state.queues.set(key2, chainedQueue2);
    return { key: key2, currentQueue: currentQueue2, chainedQueue: chainedQueue2, releaseNext: releaseNext2 };
  });
  state.registration = registration.then(
    () => void 0,
    () => void 0
  );
  const { key, currentQueue, chainedQueue, releaseNext } = await registration;
  await currentQueue;
  try {
    return await fn();
  } finally {
    releaseNext();
    if (state.queues.get(key) === chainedQueue) state.queues.delete(key);
  }
}
export {
  withFileMutationQueue
};
