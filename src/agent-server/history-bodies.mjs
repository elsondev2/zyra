import { createHash } from "node:crypto";
import { closeSync, existsSync, openSync, readSync } from "node:fs";
import { open as openFile } from "node:fs/promises";

export const HISTORY_TOOL_RESULT_BODY_POLICY = "lazy-v1";
export const EAGER_HISTORY_TOOL_RESULTS = 15;

export function normalizeHistoryBodyOptions(options = {}) {
  return { deferToolResults: options.toolResultBodies === HISTORY_TOOL_RESULT_BODY_POLICY };
}

export function inspectToolResultEntry(entry, entryIndex, byteLength, identity = {}) {
  const message = entry?.type === "message" && entry.message && typeof entry.message === "object"
    ? entry.message
    : null;
  if (message?.role !== "toolResult") return null;
  const toolName = stringValue(message.toolName) || "tool";
  const entryId = stringValue(entry.id);
  const toolCallId = stringValue(message.toolCallId) || stringValue(message.tool_call_id);
  const canonicalChatId = stringValue(identity.canonicalChatId);
  return {
    entryIndex,
    entryId,
    toolCallId,
    toolName,
    canonicalChatId,
    entrySha256: sha256(identity.rawLine ?? JSON.stringify(entry)),
    bodyBytes: Math.max(0, Number(byteLength) || 0),
    contentTypes: contentTypes(message.content),
    imageCount: imageCount(message.content),
    envelope: createEnvelope(entry, message)
  };
}

export async function searchIndexedToolResults(file, records, offsets, query, limit = 100, signal) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle || !existsSync(file)) return [];
  const matchLimit = Math.max(1, Math.min(200, Number(limit) || 100));
  const matches = [];
  const handle = await openFile(file, "r");
  try {
    for (let index = records.length - 1; index >= 0 && matches.length < matchLimit; index -= 1) {
      if (signal?.aborted) break;
      const record = records[index];
      if (record.imageCount > 0 && record.bodyBytes > 1024 * 1024) continue;
      const pair = offsets[record.entryIndex];
      const offset = Number(pair?.[0]);
      const length = Number(pair?.[1]);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length <= 0) continue;
      const buffer = Buffer.allocUnsafe(length);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead !== length || signal?.aborted) continue;
      let entry;
      try { entry = JSON.parse(buffer.toString("utf8")); }
      catch { continue; }
      if (!toolResultMatches(entry, needle)) continue;
      matches.push({
        entryIndex: record.entryIndex,
        entryId: record.entryId,
        toolCallId: record.toolCallId,
        toolName: record.toolName
      });
    }
  } finally {
    await handle.close();
  }
  return matches;
}

export function readIndexedHistoryRecord(file, offset) {
  if (!existsSync(file)) return null;
  const start = Number(offset?.[0]);
  const length = Number(offset?.[1]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(length) || length <= 0) return null;
  const fd = openSync(file, "r");
  try {
    const buffer = Buffer.allocUnsafe(length);
    if (readSync(fd, buffer, 0, length, start) !== length) return null;
    const rawLine = buffer.toString("utf8");
    return { entry: JSON.parse(rawLine), entrySha256: sha256(rawLine) };
  } catch {
    return null;
  } finally {
    closeSync(fd);
  }
}

export function projectIndexedHistoryEntries(input = {}) {
  const options = normalizeHistoryBodyOptions(input.options);
  if (!options.deferToolResults) return readSelectedEntries(input.file, input.selected);
  const eagerIndexes = eagerToolResultIndexSet(input.toolResultEntryIndexes);
  const deferredRecords = input.deferredToolResults || [];
  return readSelectedEntries(input.file, input.selected, (selection) => {
    if (eagerIndexes.has(selection.entryIndex)) return null;
    const record = findRecordByEntryIndex(deferredRecords, selection.entryIndex);
    return record ? createDeferredEntry(record) : null;
  });
}

export function projectLoadedHistoryEntries(entries, startIndex, options = {}) {
  const normalized = normalizeHistoryBodyOptions(options);
  if (!normalized.deferToolResults) return cloneJson(entries);
  const records = entries.map((entry, localIndex) => {
    const rawLine = JSON.stringify(entry);
    return inspectToolResultEntry(entry, startIndex + localIndex, Buffer.byteLength(rawLine, "utf8"), {
      canonicalChatId: options.canonicalChatId,
      rawLine
    });
  });
  const toolResultIndexes = Array.isArray(options.toolResultEntryIndexes)
    ? options.toolResultEntryIndexes
    : records.filter(Boolean).map((record) => record.entryIndex);
  const eagerIndexes = eagerToolResultIndexSet(toolResultIndexes);
  return entries.map((entry, localIndex) => {
    const record = records[localIndex];
    return isDeferrableHistoryRecord(record) && !eagerIndexes.has(record.entryIndex)
      ? createDeferredEntry(record)
      : cloneJson(entry);
  });
}

export function isDeferrableHistoryRecord(record) {
  return Boolean(record?.entryId && record?.toolCallId && record?.canonicalChatId);
}

export function validateHistoryBodyRef(record, ref = {}) {
  if (!isDeferrableHistoryRecord(record)) throw new Error("Historical tool output is not available through this reference.");
  if (Number(ref.entryIndex) !== record.entryIndex) throw new Error("Historical tool output reference is stale.");
  if (stringValue(ref.entryId) !== record.entryId) throw new Error("Historical tool output reference does not match its entry.");
  if (stringValue(ref.canonicalChatId) !== record.canonicalChatId) throw new Error("Historical tool output reference belongs to another chat.");
  if (stringValue(ref.entrySha256) !== record.entrySha256) throw new Error("Historical tool output reference is stale.");
  if (ref.toolCallId && stringValue(ref.toolCallId) !== record.toolCallId) {
    throw new Error("Historical tool output reference does not match its tool call.");
  }
}

export function createHistoryBodyRef(record) {
  return {
    version: 1,
    canonicalChatId: record.canonicalChatId,
    entryIndex: record.entryIndex,
    entryId: record.entryId,
    entrySha256: record.entrySha256,
    toolCallId: record.toolCallId,
    toolName: record.toolName,
    bodyBytes: record.bodyBytes,
    contentTypes: [...record.contentTypes],
    imageCount: record.imageCount
  };
}

function eagerToolResultIndexSet(indexes = []) {
  return new Set(indexes.slice(-EAGER_HISTORY_TOOL_RESULTS));
}

export function findRecordByEntryIndex(records, entryIndex) {
  let low = 0;
  let high = records.length - 1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = records[middle];
    if (candidate.entryIndex === entryIndex) return candidate;
    if (candidate.entryIndex < entryIndex) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

function createDeferredEntry(record) {
  return {
    ...cloneJson(record.envelope),
    historyBodyRef: createHistoryBodyRef(record)
  };
}

function createEnvelope(entry, message) {
  const {
    content: _content,
    details: _details,
    result: _result,
    output: _output,
    rawResult: _rawResult,
    ...messageMetadata
  } = message;
  const { message: _message, historyBodyRef: _historyBodyRef, ...entryMetadata } = entry;
  return {
    ...cloneJson(entryMetadata),
    type: "message",
    message: cloneJson(messageMetadata)
  };
}

function readSelectedEntries(file, selected, replacement) {
  const entries = [];
  if (!Array.isArray(selected) || selected.length === 0 || !existsSync(file)) return entries;
  const fd = openSync(file, "r");
  try {
    for (const selection of selected) {
      const projected = replacement?.(selection);
      if (projected) {
        entries.push(projected);
        continue;
      }
      const offset = Number(selection.offset?.[0]);
      const length = Number(selection.offset?.[1]);
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || length <= 0) continue;
      const buffer = Buffer.allocUnsafe(length);
      if (readSync(fd, buffer, 0, length, offset) !== length) continue;
      try { entries.push(JSON.parse(buffer.toString("utf8"))); }
      catch {}
    }
  } finally {
    closeSync(fd);
  }
  return entries;
}

export function toolResultMatches(entry, needle) {
  const message = entry?.type === "message" ? entry.message : null;
  if (message?.role !== "toolResult") return false;
  const content = message.content;
  if (typeof content === "string" && content.toLowerCase().includes(needle)) return true;
  if (Array.isArray(content)) {
    for (const part of content) {
      if (part?.type === "text" && String(part.text || "").toLowerCase().includes(needle)) return true;
    }
  }
  return searchableValueMatches(message.details, needle)
    || searchableValueMatches(message.output, needle)
    || searchableValueMatches(message.result, needle)
    || searchableValueMatches(message.rawResult, needle);
}

function searchableValueMatches(value, needle, depth = 0) {
  if (depth > 4 || value == null) return false;
  if (typeof value === "string") return value.toLowerCase().includes(needle);
  if (Array.isArray(value)) return value.some((entry) => searchableValueMatches(entry, needle, depth + 1));
  if (typeof value !== "object") return false;
  return Object.entries(value).some(([key, entry]) => {
    if (/^(?:data|image|base64|bytes)$/i.test(key)) return false;
    return searchableValueMatches(entry, needle, depth + 1);
  });
}

function contentTypes(content) {
  if (typeof content === "string") return ["text"];
  if (!Array.isArray(content)) return [];
  return [...new Set(content.map((part) => stringValue(part?.type)).filter(Boolean))];
}

function imageCount(content) {
  return Array.isArray(content) ? content.filter((part) => part?.type === "image").length : 0;
}

function sha256(value) {
  return createHash("sha256").update(String(value ?? ""), "utf8").digest("hex");
}

function stringValue(value) {
  return typeof value === "string" && value.trim() ? value : null;
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return Array.isArray(value) ? [] : {}; }
}
