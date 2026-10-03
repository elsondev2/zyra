// Generated from the maintained TypeScript in ../source by scripts/build-owned-runtime.mjs.
function isJsonValue(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  if (typeof value !== "object" || Object.getPrototypeOf(value) !== Object.prototype) return false;
  return Object.values(value).every(isJsonValue);
}
function parsePartialToolInput(value) {
  try {
    const parsed = JSON.parse(value);
    if (isJsonValue(parsed)) return parsed;
  } catch {
  }
  return value;
}
function createTranscriptState(snapshot) {
  return {
    snapshot: structuredClone(snapshot),
    progressItems: /* @__PURE__ */ new Map(),
    progressOrder: [],
    toolCallBuffers: /* @__PURE__ */ new Map()
  };
}
function applyTranscriptSnapshot(state, snapshot) {
  if (state.snapshot.id === snapshot.id && snapshot.revision < state.snapshot.revision) return state;
  return createTranscriptState(snapshot);
}
function applyTranscriptProgress(state, progress) {
  if (progress.type === "item_started" || progress.type === "item_updated") {
    return setProgressItem(state, progress.item);
  }
  if (progress.type === "item_finished") {
    const toolCallBuffers2 = new Map(state.toolCallBuffers);
    for (const key of toolCallBuffers2.keys()) {
      if (key.startsWith(`${progress.item.id}:`)) toolCallBuffers2.delete(key);
    }
    return setProgressItem({ ...state, toolCallBuffers: toolCallBuffers2 }, progress.item);
  }
  const item = state.progressItems.get(progress.messageId) ?? state.snapshot.transcript.find(({ id }) => id === progress.messageId);
  if (!item || item.role !== "assistant") return state;
  let toolCallBuffers = state.toolCallBuffers;
  const content = item.content.map((part, index) => {
    if (index !== progress.contentIndex) return structuredClone(part);
    if (progress.kind === "text" && part.type === "text") return { ...part, text: part.text + progress.delta };
    if (progress.kind === "thinking" && part.type === "thinking") {
      return { ...part, thinking: part.thinking + progress.delta };
    }
    if (progress.kind === "toolCall" && part.type === "toolCall") {
      const key = `${progress.messageId}:${progress.contentIndex}`;
      const existing = state.toolCallBuffers.get(key) ?? (typeof part.input === "string" ? part.input : "");
      const buffer = existing + progress.delta;
      toolCallBuffers = new Map(state.toolCallBuffers).set(key, buffer);
      return { ...part, input: parsePartialToolInput(buffer) };
    }
    return structuredClone(part);
  });
  return setProgressItem({ ...state, toolCallBuffers }, { ...item, content });
}
function selectTranscript(state) {
  const transcript = state.snapshot.transcript.map((item) => state.progressItems.get(item.id) ?? item);
  const ids = new Set(transcript.map((item) => item.id));
  for (const id of state.progressOrder) {
    if (ids.has(id)) continue;
    const item = state.progressItems.get(id);
    if (item) {
      transcript.push(item);
      ids.add(id);
    }
  }
  for (const item of state.snapshot.queuedSteer) {
    if (ids.has(item.id)) continue;
    transcript.push(item);
    ids.add(item.id);
  }
  return transcript;
}
function setProgressItem(state, item) {
  const progressItems = new Map(state.progressItems);
  const progressOrder = progressItems.has(item.id) ? state.progressOrder : [...state.progressOrder, item.id];
  progressItems.set(item.id, structuredClone(item));
  return { ...state, progressItems, progressOrder };
}
export {
  applyTranscriptProgress,
  applyTranscriptSnapshot,
  createTranscriptState,
  selectTranscript
};
