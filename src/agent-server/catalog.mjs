import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getProjectSessionsDir } from "../zyra-sdk.mjs";
import { CanonicalChatIndex } from "./chat-index.mjs";
import { getAgentServerPaths } from "./paths.mjs";

const CATALOG_VERSION = 1;
const MAX_KNOWN_PROJECTS = 256;
const MAX_ALIASES = 4096;

export class CanonicalChatCatalog {
  constructor(options = {}) {
    this.paths = getAgentServerPaths(options);
    this.loadSessionManager = options.loadSessionManager || null;
    this.index = options.index || new CanonicalChatIndex(options);
    this.record = readCatalog(this.paths.catalogFile);
  }

  registerProject(projectValue) {
    const project = normalizeProject(projectValue);
    const key = pathKey(project);
    const existing = this.record.projects.find((entry) => pathKey(entry.path) === key);
    if (existing) {
      existing.lastSeenAt = new Date().toISOString();
    } else {
      this.record.projects.push({ path: project, registeredAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() });
      this.record.projects = this.record.projects.slice(-MAX_KNOWN_PROJECTS);
    }
    this.persist();
    return project;
  }

  recordAttachment(input = {}) {
    const canonicalChatId = String(input.canonicalChatId || "").trim();
    if (!canonicalChatId) return;
    if (input.project) this.registerProject(input.project);
    const aliases = [input.localThreadId, ...(Array.isArray(input.aliases) ? input.aliases : [])]
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    for (const alias of aliases) {
      this.record.aliases[alias] = canonicalChatId;
    }
    const surfaces = this.record.surfaces[canonicalChatId] || [];
    if (input.surface) surfaces.push(String(input.surface).slice(0, 64));
    this.record.surfaces[canonicalChatId] = [...new Set(surfaces)].slice(-8);
    trimRecord(this.record);
    this.persist();
  }

  resolveAlias(value) {
    const normalized = String(value || "").trim();
    return this.record.aliases[normalized] || normalized;
  }

  async list(options = {}) {
    const requestedProject = options.project ? this.registerProject(options.project) : null;
    const knownProjects = this.record.projects.map((entry) => entry.path);
    const projects = requestedProject && options.allProjects !== true
      ? [requestedProject]
      : [...new Set([...(requestedProject ? [requestedProject] : []), ...knownProjects])];
    const indexed = this.loadSessionManager
      ? await this.listInjectedSessions(projects)
      : await this.index.listProjects(projects);
    const byId = new Map();
    for (const indexedChat of indexed) {
      const chat = applyMetadata(indexedChat, this.record.metadata[indexedChat.canonicalChatId], this.record);
      const current = byId.get(chat.canonicalChatId);
      if (!current || Date.parse(chat.modifiedAt) > Date.parse(current.modifiedAt)) byId.set(chat.canonicalChatId, chat);
    }
    let chats = [...byId.values()].sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt));
    const query = String(options.query || "").trim().toLowerCase();
    if (query) {
      chats = chats.filter((chat) => `${chat.title} ${chat.project} ${chat.cwd} ${chat.canonicalChatId}`.toLowerCase().includes(query));
    }
    const limit = Math.max(1, Math.min(2000, Number(options.limit) || 500));
    return chats.slice(0, limit);
  }

  async history(selector, options = {}) {
    const chat = await this.find(selector, { project: options.project, allProjects: true });
    if (!chat) return null;
    if (this.loadSessionManager) {
      const SessionManager = await this.loadSessionManager();
      const manager = SessionManager.open(chat.sessionPath, getProjectSessionsDir(chat.storageProject || chat.project));
      const entries = typeof manager.getEntries === "function" ? manager.getEntries() : [];
      const limit = Math.max(1, Math.min(2000, Number(options.limit) || 500));
      const end = options.before == null ? entries.length : Math.max(0, Math.min(entries.length, Number(options.before) || 0));
      const start = Math.max(0, end - limit);
      return {
        chat,
        entries: cloneJson(entries.slice(start, end)),
        pageInfo: {
          startCursor: String(start),
          endCursor: String(end),
          oldestCursor: start > 0 ? String(start) : null,
          hasOlder: start > 0,
          totalEntries: entries.length
        }
      };
    }
    const history = this.index.history(chat.canonicalChatId, options);
    return history ? { ...history, chat: applyMetadata(history.chat, this.record.metadata[chat.canonicalChatId], this.record) } : null;
  }

  async listInjectedSessions(projects) {
    const SessionManager = await this.loadSessionManager();
    const groups = await Promise.all(projects.map(async (project) => {
      try {
        const sessions = await SessionManager.list(project, getProjectSessionsDir(project));
        return sessions.map((session) => projectInjectedSession(project, session));
      } catch {
        return [];
      }
    }));
    return groups.flat();
  }

  async find(selector, options = {}) {
    const normalized = this.resolveAlias(selector);
    const direct = this.loadSessionManager
      ? null
      : this.index.get(normalized) || (path.isAbsolute(normalized) ? this.index.findByPath(normalized) : null);
    if (direct) return applyMetadata(direct, this.record.metadata[direct.canonicalChatId], this.record);
    const chats = await this.list({
      ...options,
      allProjects: options.allProjects === true || path.isAbsolute(normalized),
      limit: 2000
    });
    return chats.find((chat) => chat.canonicalChatId === normalized || pathKey(chat.sessionPath) === pathKey(normalized))
      || chats.find((chat) => chat.canonicalChatId.startsWith(normalized))
      || null;
  }

  async updateChat(selector, patch = {}) {
    const canonicalChatId = this.resolveAlias(selector);
    const chat = await this.find(canonicalChatId, { allProjects: true });
    if (patch.project !== undefined) this.registerProject(patch.project);
    const existing = this.record.metadata[canonicalChatId] || {};
    const next = {
      ...existing,
      ...(patch.title !== undefined ? { title: normalizeTitle(patch.title) } : {}),
      ...(patch.project !== undefined ? { project: normalizeProject(patch.project) } : {}),
      ...(patch.cwd !== undefined ? { cwd: normalizeProject(patch.cwd) } : {}),
      updatedAt: new Date().toISOString()
    };
    this.record.metadata[canonicalChatId] = next;
    this.index.update(canonicalChatId, next);
    this.persist();
    return applyMetadata(chat || this.index.get(canonicalChatId) || { canonicalChatId }, next, this.record);
  }

  snapshot() {
    return structuredClone(this.record);
  }

  persist() {
    trimRecord(this.record);
    writeCatalog(this.paths.catalogFile, this.record);
  }
}

function cloneJson(value) {
  try { return JSON.parse(JSON.stringify(value)); }
  catch { return []; }
}

function projectInjectedSession(project, session) {
  const canonicalChatId = String(session.id || "");
  return {
    version: 1,
    canonicalChatId,
    sessionPath: path.resolve(session.path),
    storageProject: normalizeProject(project),
    project: normalizeProject(project),
    cwd: normalizeProject(session.cwd || project),
    title: normalizeTitle(session.name || session.firstMessage),
    createdAt: toIso(session.created),
    modifiedAt: toIso(session.modified),
    messageCount: Math.max(0, Number(session.messageCount) || 0),
    displayMessageCount: Math.max(0, Number(session.messageCount) || 0),
    toolCallCount: 0,
    errorCount: 0,
    imageCount: 0,
    entryCount: Math.max(0, Number(session.messageCount) || 0),
    parentSessionPath: session.parentSessionPath ? path.resolve(session.parentSessionPath) : null
  };
}

function applyMetadata(chat, metadata = {}, record = {}) {
  const canonicalChatId = String(chat.canonicalChatId || "");
  return {
    ...chat,
    title: metadata.title || chat.title || "New chat",
    project: metadata.project || chat.project || chat.storageProject || chat.cwd,
    cwd: metadata.cwd || metadata.project || chat.cwd || chat.project,
    aliases: Object.entries(record.aliases || {}).filter(([, id]) => id === canonicalChatId).map(([alias]) => alias).slice(0, 32),
    surfaces: [...new Set(record.surfaces?.[canonicalChatId] || [])]
  };
}

function normalizeTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 240) || "New chat";
}

function normalizeProject(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("Chat project path is required.");
  return path.resolve(raw);
}

function pathKey(value) {
  const normalized = path.resolve(value);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function toIso(value) {
  const date = value instanceof Date ? value : new Date(value || 0);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function emptyCatalog() {
  return { version: CATALOG_VERSION, projects: [], aliases: {}, surfaces: {}, metadata: {}, updatedAt: new Date().toISOString() };
}

function readCatalog(file) {
  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));
    if (parsed?.version !== CATALOG_VERSION) return emptyCatalog();
    return {
      version: CATALOG_VERSION,
      projects: Array.isArray(parsed.projects) ? parsed.projects.filter((entry) => entry?.path).slice(-MAX_KNOWN_PROJECTS) : [],
      aliases: parsed.aliases && typeof parsed.aliases === "object" ? parsed.aliases : {},
      surfaces: parsed.surfaces && typeof parsed.surfaces === "object" ? parsed.surfaces : {},
      metadata: parsed.metadata && typeof parsed.metadata === "object" ? parsed.metadata : {},
      updatedAt: String(parsed.updatedAt || new Date().toISOString())
    };
  } catch {
    return emptyCatalog();
  }
}

function trimRecord(record) {
  record.projects = record.projects.slice(-MAX_KNOWN_PROJECTS);
  const aliases = Object.entries(record.aliases).slice(-MAX_ALIASES);
  record.aliases = Object.fromEntries(aliases);
  record.surfaces = Object.fromEntries(Object.entries(record.surfaces).slice(-MAX_ALIASES));
  record.metadata = Object.fromEntries(Object.entries(record.metadata || {}).slice(-MAX_ALIASES));
  record.updatedAt = new Date().toISOString();
}

function writeCatalog(file, record) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, JSON.stringify(record, null, 2), { encoding: "utf8", mode: 0o600 });
  renameSync(temporary, file);
}
