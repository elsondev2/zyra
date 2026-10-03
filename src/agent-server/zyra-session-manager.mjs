import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZyraSessionFileManager } from "./zyra-session-file.mjs";

export const CURRENT_SESSION_VERSION = 3;

const SESSION_ID_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?$/;

export class ZyraSessionManager {
  constructor(options = {}) {
    this.cwd = path.resolve(options.cwd || process.cwd());
    this.persist = options.persist === true;
    this.sessionDir = options.sessionDir
      ? path.resolve(options.sessionDir)
      : this.persist ? getDefaultSessionDir(this.cwd) : "";
    this.sessionFileManager = options.sessionFileManager ?? null;
    this.header = null;
    this.entries = [];
    this.byId = new Map();
    this.labelsById = new Map();
    this.labelTimestampsById = new Map();
    this.leafId = null;
    this.flushed = false;

    if (this.persist && this.sessionDir) mkdirSync(this.sessionDir, { recursive: true });
    if (this.sessionFileManager) this._loadFromFileManager();
    else this.newSession(options.newSessionOptions);
  }

  static create(cwd, sessionDir, options) {
    const resolvedCwd = path.resolve(cwd || process.cwd());
    const resolvedSessionDir = sessionDir ? path.resolve(sessionDir) : getDefaultSessionDir(resolvedCwd);
    return new ZyraSessionManager({ cwd: resolvedCwd, sessionDir: resolvedSessionDir, persist: true, newSessionOptions: options });
  }

  static open(sessionFile, sessionDir, cwdOverride) {
    const resolvedFile = path.resolve(sessionFile);
    const resolvedSessionDir = sessionDir ? path.resolve(sessionDir) : path.dirname(resolvedFile);
    const sessionFileManager = ZyraSessionFileManager.open(resolvedFile, path.dirname(resolvedFile));
    const header = sessionFileManager.getHeader();
    const manager = new ZyraSessionManager({
      cwd: cwdOverride ?? (typeof header.cwd === "string" && header.cwd ? header.cwd : process.cwd()),
      sessionDir: resolvedSessionDir,
      persist: true,
      sessionFileManager,
    });
    if (migrateSessionEntries(manager.header, manager.entries)) {
      sessionFileManager.rewrite(manager.header, manager.entries);
      manager._buildIndex();
    }
    return manager;
  }

  static continueRecent(cwd, sessionDir) {
    const resolvedCwd = path.resolve(cwd || process.cwd());
    const resolvedSessionDir = sessionDir ? path.resolve(sessionDir) : getDefaultSessionDir(resolvedCwd);
    const filterCwd = sessionDir !== undefined && resolvedSessionDir !== getDefaultSessionDirPath(resolvedCwd);
    const recentFile = findMostRecentSession(resolvedSessionDir, filterCwd ? resolvedCwd : undefined);
    return recentFile
      ? ZyraSessionManager.open(recentFile, resolvedSessionDir, resolvedCwd)
      : ZyraSessionManager.create(resolvedCwd, resolvedSessionDir);
  }

  static inMemory(cwd = process.cwd(), options) {
    return new ZyraSessionManager({ cwd, persist: false, newSessionOptions: options });
  }

  static forkFrom(sourceFile, targetCwd, sessionDir, options) {
    const resolvedSourceFile = path.resolve(sourceFile);
    const resolvedTargetCwd = path.resolve(targetCwd);
    const source = ZyraSessionManager.open(resolvedSourceFile, path.dirname(resolvedSourceFile));
    const resolvedSessionDir = sessionDir ? path.resolve(sessionDir) : getDefaultSessionDir(resolvedTargetCwd);
    const manager = ZyraSessionManager.create(resolvedTargetCwd, resolvedSessionDir, {
      ...options,
      parentSession: resolvedSourceFile,
    });
    for (const entry of source.getEntries()) manager._appendEntry(structuredClone(entry));
    return manager;
  }

  static async list(cwd, sessionDir, onProgress) {
    const resolvedCwd = path.resolve(cwd || process.cwd());
    const resolvedSessionDir = sessionDir ? path.resolve(sessionDir) : getDefaultSessionDir(resolvedCwd);
    const filterCwd = sessionDir !== undefined && resolvedSessionDir !== getDefaultSessionDirPath(resolvedCwd);
    const sessions = await listSessionsFromDirectory(resolvedSessionDir, onProgress);
    return sessions
      .filter((session) => !filterCwd || sessionCwdMatches(session.cwd, resolvedCwd))
      .sort((left, right) => right.modified.getTime() - left.modified.getTime());
  }

  static async listAll(sessionDirectoryOrProgress, onProgress) {
    const explicitDirectory = typeof sessionDirectoryOrProgress === "string"
      ? path.resolve(sessionDirectoryOrProgress)
      : null;
    const progress = typeof sessionDirectoryOrProgress === "function" ? sessionDirectoryOrProgress : onProgress;
    if (explicitDirectory) {
      const sessions = await listSessionsFromDirectory(explicitDirectory, progress);
      return sessions.sort((left, right) => right.modified.getTime() - left.modified.getTime());
    }

    const sessionsRoot = path.join(resolveZyraStateDirectory(), "sessions");
    if (!existsSync(sessionsRoot)) return [];
    const directories = [sessionsRoot, ...readdirSync(sessionsRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(sessionsRoot, entry.name))];
    const groups = await Promise.all(directories.map((directory) => listSessionsFromDirectory(directory, progress)));
    return groups.flat().sort((left, right) => right.modified.getTime() - left.modified.getTime());
  }

  setSessionFile(sessionFile) {
    this.sessionFileManager = ZyraSessionFileManager.open(sessionFile, path.dirname(path.resolve(sessionFile)));
    this._loadFromFileManager();
  }

  newSession(options) {
    if (options?.id !== undefined) assertValidSessionId(options.id);
    const sessionId = options?.id ?? `zyra_${randomUUID()}`;
    const timestamp = new Date().toISOString();
    this.header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: sessionId,
      timestamp,
      cwd: this.cwd,
      parentSession: options?.parentSession,
    };
    this.entries = [];
    this.byId.clear();
    this.labelsById.clear();
    this.labelTimestampsById.clear();
    this.leafId = null;
    this.flushed = false;
    if (this.persist) {
      const fileTimestamp = timestamp.replace(/[:.]/g, "-");
      const sessionFile = path.join(this.sessionDir, `${fileTimestamp}_${sessionId}.jsonl`);
      this.sessionFileManager = ZyraSessionFileManager.create(sessionFile, this.sessionDir, this.header);
    } else {
      this.sessionFileManager = null;
    }
    return this.getSessionFile();
  }

  isPersisted() {
    return this.persist;
  }

  getCwd() {
    return this.cwd;
  }

  getSessionDir() {
    return this.sessionDir;
  }

  usesDefaultSessionDir() {
    return this.sessionDir === getDefaultSessionDirPath(this.cwd);
  }

  getSessionId() {
    this._refreshFromDisk();
    return this.header?.id ?? "";
  }

  getSessionFile() {
    return this.sessionFileManager?.getSessionFile();
  }

  getSessionFileDirectory() {
    return this.sessionFileManager?.getSessionDir() ?? this.sessionDir;
  }

  getHeader() {
    this._refreshFromDisk();
    return this.header;
  }

  appendMessage(message) {
    this._refreshFromDisk();
    const entry = {
      type: "message",
      id: createEntryId(this.byId),
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      message,
    };
    this._appendEntry(entry);
    return entry.id;
  }

  appendThinkingLevelChange(thinkingLevel) {
    return this._appendEntry({ type: "thinking_level_change", thinkingLevel }).id;
  }

  appendModelChange(provider, modelId) {
    return this._appendEntry({ type: "model_change", provider, modelId }).id;
  }

  appendCompaction(summary, firstKeptEntryId, tokensBefore, details, fromHook, usage) {
    return this._appendEntry({ type: "compaction", summary, firstKeptEntryId, tokensBefore, details, fromHook, usage }).id;
  }

  appendCustomEntry(customType, data) {
    return this._appendEntry({ type: "custom", customType, data }).id;
  }

  appendSessionInfo(name) {
    const sanitizedName = String(name ?? "").replace(/[\r\n]+/g, " ").trim();
    return this._appendEntry({ type: "session_info", name: sanitizedName }).id;
  }

  appendCustomMessageEntry(customType, content, display, details) {
    return this._appendEntry({ type: "custom_message", customType, content, display, details }).id;
  }

  appendLabelChange(targetId, label) {
    this._refreshFromDisk();
    if (!this.byId.has(targetId)) throw new Error(`Entry ${targetId} not found`);
    const entry = this._appendEntry({ type: "label", targetId, label });
    if (label) {
      this.labelsById.set(targetId, label);
      this.labelTimestampsById.set(targetId, entry.timestamp);
    } else {
      this.labelsById.delete(targetId);
      this.labelTimestampsById.delete(targetId);
    }
    return entry.id;
  }

  getSessionName() {
    const entries = this.getEntries();
    for (let index = entries.length - 1; index >= 0; index -= 1) {
      if (entries[index].type === "session_info") return entries[index].name?.trim() || undefined;
    }
    return undefined;
  }

  getLeafId() {
    return this.leafId;
  }

  getLeafEntry() {
    return this.leafId ? this.getEntry(this.leafId) : undefined;
  }

  getEntry(id) {
    this._refreshFromDisk();
    return this.byId.get(id);
  }

  getChildren(parentId) {
    this._refreshFromDisk();
    return [...this.byId.values()].filter((entry) => entry.parentId === parentId);
  }

  getLabel(id) {
    this._refreshFromDisk();
    return this.labelsById.get(id);
  }

  getBranch(fromId) {
    this._refreshFromDisk();
    const startId = fromId ?? this.leafId;
    let current = startId ? this.byId.get(startId) : undefined;
    const branch = [];
    while (current) {
      branch.push(current);
      current = current.parentId ? this.byId.get(current.parentId) : undefined;
    }
    return branch.reverse();
  }

  buildContextEntries() {
    return buildContextEntries(this.getEntries(), this.leafId, this.byId);
  }

  buildSessionContext() {
    return buildSessionContext(this.getEntries(), this.leafId, this.byId);
  }

  getEntries() {
    this._refreshFromDisk();
    return [...this.entries];
  }

  getTree() {
    const entries = this.getEntries();
    const nodeMap = new Map(entries.map((entry) => [entry.id, {
      entry,
      children: [],
      label: this.labelsById.get(entry.id),
      labelTimestamp: this.labelTimestampsById.get(entry.id),
    }]));
    const roots = [];
    for (const entry of entries) {
      const node = nodeMap.get(entry.id);
      if (entry.parentId === null || entry.parentId === entry.id) roots.push(node);
      else {
        const parent = nodeMap.get(entry.parentId);
        if (parent) parent.children.push(node);
        else roots.push(node);
      }
    }
    const stack = [...roots];
    while (stack.length > 0) {
      const node = stack.pop();
      node.children.sort((left, right) => new Date(left.entry.timestamp).getTime() - new Date(right.entry.timestamp).getTime());
      stack.push(...node.children);
    }
    return roots;
  }

  branch(branchFromId) {
    this._refreshFromDisk();
    if (!this.byId.has(branchFromId)) throw new Error(`Entry ${branchFromId} not found`);
    this.leafId = branchFromId;
  }

  resetLeaf() {
    this.leafId = null;
  }

  branchWithSummary(branchFromId, summary, details, fromHook, usage) {
    this._refreshFromDisk();
    if (branchFromId !== null && !this.byId.has(branchFromId)) throw new Error(`Entry ${branchFromId} not found`);
    const fromId = this.leafId ?? "root";
    this.leafId = branchFromId;
    return this._appendEntry({ type: "branch_summary", parentId: branchFromId, fromId, summary, details, fromHook, usage });
  }

  createBranchedSession(leafId) {
    this._refreshFromDisk();
    const previousSessionFile = this.getSessionFile();
    const branch = this.getBranch(leafId);
    if (branch.length === 0) throw new Error(`Entry ${leafId} not found`);

    const branchEntries = [];
    let parentId = null;
    for (const entry of branch) {
      if (entry.type === "label") continue;
      const copiedEntry = { ...entry, parentId };
      branchEntries.push(copiedEntry);
      parentId = copiedEntry.id;
    }

    const timestamp = new Date().toISOString();
    const sessionId = `zyra_${randomUUID()}`;
    const header = {
      type: "session",
      version: CURRENT_SESSION_VERSION,
      id: sessionId,
      timestamp,
      cwd: this.cwd,
      parentSession: this.persist ? previousSessionFile : undefined,
    };
    const pathEntryIds = new Set(branchEntries.map((entry) => entry.id));
    const labelEntries = [];
    const existingIds = new Map(branchEntries.map((entry) => [entry.id, entry]));
    let labelParentId = branchEntries.at(-1)?.id ?? null;
    for (const [targetId, label] of this.labelsById) {
      if (!pathEntryIds.has(targetId)) continue;
      const labelEntry = {
        type: "label",
        id: createEntryId(existingIds),
        parentId: labelParentId,
        timestamp: this.labelTimestampsById.get(targetId) ?? timestamp,
        targetId,
        label,
      };
      existingIds.set(labelEntry.id, labelEntry);
      labelEntries.push(labelEntry);
      labelParentId = labelEntry.id;
    }

    this.header = header;
    this.entries = [...branchEntries, ...labelEntries];
    this.sessionFileManager = null;
    if (this.persist) {
      const fileTimestamp = timestamp.replace(/[:.]/g, "-");
      const sessionFile = path.join(this.sessionDir, `${fileTimestamp}_${sessionId}.jsonl`);
      this.sessionFileManager = ZyraSessionFileManager.create(sessionFile, this.sessionDir, header);
      for (const entry of this.entries) this.sessionFileManager.appendEntry(entry);
      this.flushed = true;
    }
    this._buildIndex();
    return this.getSessionFile();
  }

  _appendEntry(entryValues) {
    this._refreshFromDisk();
    const entry = {
      ...entryValues,
      id: entryValues.id ?? createEntryId(this.byId),
      parentId: entryValues.parentId !== undefined ? entryValues.parentId : this.leafId,
      timestamp: entryValues.timestamp ?? new Date().toISOString(),
    };
    if (this.byId.has(entry.id)) throw new Error(`Zyra session entry ${entry.id} already exists.`);
    this.sessionFileManager?.appendEntry(entry);
    this.entries.push(entry);
    this.byId.set(entry.id, entry);
    this.leafId = entry.id;
    if (entry.type === "label") {
      if (entry.label) {
        this.labelsById.set(entry.targetId, entry.label);
        this.labelTimestampsById.set(entry.targetId, entry.timestamp);
      } else {
        this.labelsById.delete(entry.targetId);
        this.labelTimestampsById.delete(entry.targetId);
      }
    }
    this.flushed = this.persist;
    return entry;
  }

  _loadFromFileManager() {
    this.header = this.sessionFileManager.getHeader();
    this.entries = this.sessionFileManager.getEntries();
    this._buildIndex();
    this.flushed = true;
  }

  _refreshFromDisk() {
    if (!this.sessionFileManager?.refreshFromDisk()) return;
    this.header = this.sessionFileManager.getHeader();
    this.entries = this.sessionFileManager.getEntries();
    this._buildIndex();
  }

  _buildIndex() {
    this.byId = new Map();
    this.labelsById = new Map();
    this.labelTimestampsById = new Map();
    this.leafId = null;
    for (const entry of this.entries) {
      if (entry.id !== undefined) this.byId.set(entry.id, entry);
      this.leafId = entry.id ?? this.leafId;
      if (entry.type === "label") {
        if (entry.label) {
          this.labelsById.set(entry.targetId, entry.label);
          this.labelTimestampsById.set(entry.targetId, entry.timestamp);
        } else {
          this.labelsById.delete(entry.targetId);
          this.labelTimestampsById.delete(entry.targetId);
        }
      }
    }
  }
}

export function buildContextEntries(entries, leafId, byId) {
  const branch = buildSessionPath(entries, leafId, byId);
  let latestCompaction = null;
  for (const entry of branch) if (entry.type === "compaction") latestCompaction = entry;
  if (!latestCompaction) return branch;
  const compactionIndex = branch.findIndex((entry) => entry.id === latestCompaction.id);
  if (compactionIndex < 0) return branch;
  const contextEntries = [latestCompaction];
  let firstKeptFound = false;
  for (let index = 0; index < compactionIndex; index += 1) {
    const entry = branch[index];
    if (entry.id === latestCompaction.firstKeptEntryId) firstKeptFound = true;
    if (firstKeptFound) contextEntries.push(entry);
  }
  contextEntries.push(...branch.slice(compactionIndex + 1));
  return contextEntries;
}

export function buildSessionContext(entries, leafId, byId) {
  const branch = buildSessionPath(entries, leafId, byId);
  let thinkingLevel = "off";
  let model = null;
  for (const entry of branch) {
    if (entry.type === "thinking_level_change") thinkingLevel = entry.thinkingLevel;
    else if (entry.type === "model_change") model = { provider: entry.provider, modelId: entry.modelId };
    else if (entry.type === "message" && entry.message?.role === "assistant") {
      model = { provider: entry.message.provider, modelId: entry.message.model };
    }
  }
  const messages = buildContextEntries(entries, leafId, byId).flatMap(sessionEntryToContextMessages);
  return { messages, thinkingLevel, model };
}

export function sessionEntryToContextMessages(entry) {
  if (entry.type === "message") {
    const message = entry.message;
    if (message && ["user", "assistant", "toolResult"].includes(message.role) && message.content == null) {
      return [{ ...message, content: [] }];
    }
    return message ? [message] : [];
  }
  if (entry.type === "custom_message") {
    return [{
      role: "custom",
      customType: entry.customType,
      content: entry.content ?? [],
      display: entry.display,
      details: entry.details,
      timestamp: new Date(entry.timestamp).getTime(),
    }];
  }
  if (entry.type === "branch_summary" && entry.summary) {
    return [{ role: "branchSummary", summary: entry.summary, fromId: entry.fromId, timestamp: new Date(entry.timestamp).getTime() }];
  }
  if (entry.type === "compaction") {
    return [{ role: "compactionSummary", summary: entry.summary, tokensBefore: entry.tokensBefore, timestamp: new Date(entry.timestamp).getTime() }];
  }
  return [];
}

export function getDefaultSessionDir(cwd) {
  const sessionDirectory = getDefaultSessionDirPath(cwd);
  mkdirSync(sessionDirectory, { recursive: true });
  return sessionDirectory;
}

export function getDefaultSessionDirPath(cwd) {
  const resolvedCwd = path.resolve(cwd || process.cwd());
  const safePath = `--${resolvedCwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
  return path.join(resolveZyraStateDirectory(), "sessions", safePath);
}

export function findMostRecentSession(sessionDirectory, cwd) {
  const resolvedDirectory = path.resolve(sessionDirectory);
  const resolvedCwd = cwd ? path.resolve(cwd) : undefined;
  try {
    return readdirSync(resolvedDirectory)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => path.join(resolvedDirectory, name))
      .filter((sessionFile) => {
        if (!resolvedCwd) return true;
        try {
          return path.resolve(ZyraSessionFileManager.open(sessionFile, resolvedDirectory).getHeader().cwd || "") === resolvedCwd;
        } catch {
          return false;
        }
      })
      .map((sessionFile) => ({ sessionFile, modifiedAt: statSync(sessionFile).mtime.getTime() }))
      .sort((left, right) => right.modifiedAt - left.modifiedAt)[0]?.sessionFile ?? null;
  } catch {
    return null;
  }
}

export function assertValidSessionId(sessionId) {
  if (typeof sessionId !== "string" || !SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Session id must be non-empty, contain only alphanumeric characters, '-', '_', and '.', and start and end with an alphanumeric character");
  }
}

function migrateSessionEntries(header, entries) {
  const version = Number(header.version ?? 1);
  if (version >= CURRENT_SESSION_VERSION) return false;
  if (version < 2) {
    const ids = new Map();
    let parentId = null;
    for (const entry of entries) {
      entry.id = createEntryId(ids);
      entry.parentId = parentId;
      parentId = entry.id;
      ids.set(entry.id, entry);
      if (entry.type === "compaction" && typeof entry.firstKeptEntryIndex === "number") {
        const keptEntry = entries[entry.firstKeptEntryIndex - 1];
        if (keptEntry) entry.firstKeptEntryId = keptEntry.id;
        delete entry.firstKeptEntryIndex;
      }
    }
  }
  if (version < 3) {
    for (const entry of entries) {
      if (entry.type === "message" && entry.message?.role === "hookMessage") entry.message.role = "custom";
    }
  }
  header.version = CURRENT_SESSION_VERSION;
  return true;
}

function buildSessionPath(entries, leafId, byId) {
  const index = byId ?? new Map(entries.filter((entry) => entry.id !== undefined).map((entry) => [entry.id, entry]));
  if (leafId === null) return [];
  let current = leafId ? index.get(leafId) : undefined;
  current ??= entries.at(-1);
  const branch = [];
  while (current) {
    branch.push(current);
    current = current.parentId ? index.get(current.parentId) : undefined;
  }
  return branch.reverse();
}

function createEntryId(existingEntries) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const entryId = randomUUID().replaceAll("-", "").slice(0, 8);
    if (!existingEntries.has(entryId)) return entryId;
  }
  return randomUUID();
}

function createSessionInfo(sessionFile) {
  try {
    const fileManager = ZyraSessionFileManager.open(sessionFile, path.dirname(sessionFile));
    const header = fileManager.getHeader();
    const entries = fileManager.getEntries();
    const stats = statSync(sessionFile);
    let messageCount = 0;
    let firstMessage = "";
    let name;
    let lastActivityTime;
    const messages = [];
    for (const entry of entries) {
      if (entry.type === "session_info") name = entry.name?.trim() || undefined;
      if (entry.type !== "message") continue;
      messageCount += 1;
      const message = entry.message;
      if (!message || !["user", "assistant"].includes(message.role) || !("content" in message)) continue;
      const messageTime = typeof message.timestamp === "number" ? message.timestamp : Date.parse(entry.timestamp);
      if (Number.isFinite(messageTime)) lastActivityTime = Math.max(lastActivityTime ?? 0, messageTime);
      const text = extractMessageText(message.content);
      if (!text) continue;
      messages.push(text);
      if (!firstMessage && message.role === "user") firstMessage = text;
    }
    const headerTime = Date.parse(header.timestamp);
    const created = Number.isFinite(headerTime) ? new Date(headerTime) : stats.birthtime;
    const modified = typeof lastActivityTime === "number" && lastActivityTime > 0
      ? new Date(lastActivityTime)
      : Number.isFinite(headerTime) ? new Date(headerTime) : stats.mtime;
    return {
      path: sessionFile,
      id: header.id,
      cwd: typeof header.cwd === "string" ? header.cwd : "",
      name,
      parentSessionPath: header.parentSession,
      created,
      modified,
      messageCount,
      firstMessage: firstMessage || "(no messages)",
      allMessagesText: messages.join(" "),
    };
  } catch {
    return null;
  }
}

async function listSessionsFromDirectory(sessionDirectory, onProgress) {
  if (!existsSync(sessionDirectory)) return [];
  let sessionFiles;
  try {
    sessionFiles = readdirSync(sessionDirectory)
      .filter((name) => name.endsWith(".jsonl"))
      .map((name) => path.join(sessionDirectory, name));
  } catch {
    return [];
  }
  let nextIndex = 0;
  let loaded = 0;
  const sessions = new Array(sessionFiles.length).fill(null);
  const workerCount = Math.min(10, sessionFiles.length);
  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < sessionFiles.length) {
      const index = nextIndex++;
      sessions[index] = createSessionInfo(sessionFiles[index]);
      onProgress?.(++loaded, sessionFiles.length);
    }
  }));
  return sessions.filter(Boolean);
}

function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.filter((block) => block?.type === "text").map((block) => String(block.text ?? "")).join(" ");
}

function sessionCwdMatches(cwd, resolvedCwd) {
  return typeof cwd === "string" && cwd !== "" && path.resolve(cwd) === resolvedCwd;
}

function resolveZyraStateDirectory() {
  const stateDirectory = typeof process.env.ZYRA_STATE_DIR === "string" && process.env.ZYRA_STATE_DIR.trim()
    ? process.env.ZYRA_STATE_DIR
    : path.join(os.homedir(), ".zyra");
  return path.resolve(stateDirectory);
}
