// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
import { toError } from "./errors.js";
class ClientState {
  #sessionSnapshots = /* @__PURE__ */ new Map();
  #attachedSessionIds = /* @__PURE__ */ new Set();
  #snapshotListeners = /* @__PURE__ */ new Set();
  #eventListeners = /* @__PURE__ */ new Set();
  #sessionSnapshotListeners = /* @__PURE__ */ new Map();
  #sessionEventListeners = /* @__PURE__ */ new Map();
  #onListenerError;
  #snapshot;
  constructor(onListenerError) {
    this.#onListenerError = onListenerError;
  }
  get snapshot() {
    return this.#snapshot;
  }
  reset() {
    this.#snapshot = void 0;
    this.#sessionSnapshots.clear();
    this.#attachedSessionIds.clear();
  }
  clearAttachments() {
    this.#attachedSessionIds.clear();
  }
  dispose() {
    this.reset();
    this.#snapshotListeners.clear();
    this.#eventListeners.clear();
    this.#sessionSnapshotListeners.clear();
    this.#sessionEventListeners.clear();
  }
  getSessionSnapshot(sessionId) {
    return this.#sessionSnapshots.get(sessionId);
  }
  isSessionAttached(sessionId) {
    return this.#attachedSessionIds.has(sessionId);
  }
  forgetSessionSnapshot(sessionId) {
    const previous = this.#sessionSnapshots.get(sessionId);
    this.#sessionSnapshots.delete(sessionId);
    return previous;
  }
  restoreSessionSnapshot(snapshot) {
    if (!this.#sessionSnapshots.has(snapshot.id)) this.#sessionSnapshots.set(snapshot.id, snapshot);
  }
  subscribe(listener) {
    this.#snapshotListeners.add(listener);
    return () => this.#snapshotListeners.delete(listener);
  }
  onEvent(listener) {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }
  subscribeSession(sessionId, listener) {
    return addMappedListener(this.#sessionSnapshotListeners, sessionId, listener);
  }
  onSessionEvent(sessionId, listener) {
    return addMappedListener(this.#sessionEventListeners, sessionId, listener);
  }
  applyResult(result) {
    if (result.command === "list") return;
    if (result.command === "detach") {
      this.#attachedSessionIds.delete(result.sessionId);
      const snapshot = this.#sessionSnapshots.get(result.sessionId);
      if (snapshot) this.#applySessionSnapshot({ ...snapshot, attached: false }, true);
      return;
    }
    this.#applySessionSnapshot(result.session);
  }
  applyEvent(event) {
    if (event.type === "server_snapshot") this.applyServerSnapshot(event.snapshot);
    if (event.type === "session_snapshot") this.#applySessionSnapshot(event.snapshot);
    if (event.type === "session_removed") {
      this.#sessionSnapshots.delete(event.sessionId);
      this.#attachedSessionIds.delete(event.sessionId);
    }
    this.#notify(this.#eventListeners, event);
    const sessionId = getEventSessionId(event);
    if (sessionId) this.#notify(this.#sessionEventListeners.get(sessionId), event);
  }
  applyServerSnapshot(snapshot) {
    if (this.#snapshot && snapshot.revision < this.#snapshot.revision) return;
    this.#snapshot = snapshot;
    this.#notify(this.#snapshotListeners, snapshot);
  }
  #applySessionSnapshot(snapshot, force = false) {
    const current = this.#sessionSnapshots.get(snapshot.id);
    if (!force && current && snapshot.revision < current.revision) return;
    this.#sessionSnapshots.set(snapshot.id, snapshot);
    if (snapshot.attached) this.#attachedSessionIds.add(snapshot.id);
    else this.#attachedSessionIds.delete(snapshot.id);
    this.#notify(this.#sessionSnapshotListeners.get(snapshot.id), snapshot);
  }
  #notify(listeners, value) {
    for (const listener of listeners ?? []) {
      try {
        listener(value);
      } catch (error) {
        this.#reportListenerError(error);
      }
    }
  }
  #reportListenerError(error) {
    if (!this.#onListenerError) return;
    try {
      this.#onListenerError(toError(error));
    } catch {
    }
  }
}
function addMappedListener(listenersById, id, listener) {
  let listeners = listenersById.get(id);
  if (!listeners) {
    listeners = /* @__PURE__ */ new Set();
    listenersById.set(id, listeners);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) listenersById.delete(id);
  };
}
function getEventSessionId(event) {
  if (event.type === "session_snapshot") return event.snapshot.id;
  if (event.type === "session_progress" || event.type === "session_removed") return event.sessionId;
  return void 0;
}
export {
  ClientState
};
