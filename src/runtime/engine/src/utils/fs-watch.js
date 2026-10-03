// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { watch } from "node:fs";
const FS_WATCH_RETRY_DELAY_MS = 5e3;
function closeWatcher(watcher) {
  if (!watcher) {
    return;
  }
  try {
    watcher.close();
  } catch {
  }
}
function watchWithErrorHandler(path, listener, onError) {
  try {
    const watcher = watch(path, listener);
    watcher.on("error", onError);
    return watcher;
  } catch {
    onError();
    return null;
  }
}
export {
  FS_WATCH_RETRY_DELAY_MS,
  closeWatcher,
  watchWithErrorHandler
};
