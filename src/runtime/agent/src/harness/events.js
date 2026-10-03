// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
class HarnessEventBus {
  listeners = /* @__PURE__ */ new Map();
  watchListeners = /* @__PURE__ */ new Set();
  /**
   * Register a listener for future events of one type and return its unsubscribe function.
   * Earlier events are not replayed, and no snapshot or event buffer is provided.
   */
  on(type, listener) {
    const listeners = this.listeners.get(type) ?? /* @__PURE__ */ new Set();
    this.listeners.set(type, listeners);
    const receive = (event) => {
      if (event.type === type) return listener(event);
    };
    listeners.add(receive);
    return () => {
      listeners.delete(receive);
      if (listeners.size === 0) this.listeners.delete(type);
    };
  }
  /** Publish an event to current event subscriptions and watch subscriptions. */
  emit(event) {
    for (const listener of this.listeners.get(event.type) ?? []) void listener(event);
    for (const listener of this.watchListeners) listener(event);
  }
  watch(captureSnapshot) {
    let listener;
    let buffered = [];
    const receive = (event) => {
      if (listener) void listener(event);
      else buffered.push(event);
    };
    this.watchListeners.add(receive);
    const snapshot = captureSnapshot();
    return {
      snapshot,
      start: (nextListener) => {
        while (buffered.length > 0) {
          const pending = buffered;
          buffered = [];
          for (const event of pending) void nextListener(event);
        }
        listener = nextListener;
      },
      unsubscribe: () => {
        this.watchListeners.delete(receive);
        buffered = [];
      }
    };
  }
}
export {
  HarnessEventBus
};
