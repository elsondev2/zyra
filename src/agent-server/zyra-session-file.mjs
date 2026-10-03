import { randomUUID } from "node:crypto";
import { closeSync, existsSync, fsyncSync, openSync, readFileSync, realpathSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

export class ZyraSessionFileManager {
  constructor(sessionFile, sessionDirectory, header, entries, hasHeaderOnDisk, revision) {
    this.sessionFile = path.resolve(sessionFile);
    this.sessionDirectory = path.resolve(sessionDirectory);
    this.header = header;
    this.entries = entries;
    this.hasHeaderOnDisk = hasHeaderOnDisk;
    this.revision = revision;
    this.leafId = entries.at(-1)?.id ?? null;
    this.flushed = true;
  }

  static open(sessionFileValue, sessionDirectoryValue, options = {}) {
    const sessionFile = path.resolve(String(sessionFileValue || ""));
    const sessionDirectory = path.resolve(String(sessionDirectoryValue || ""));
    if (!sessionFile || !sessionDirectory || !existsSync(sessionFile)) throw new Error("Zyra session file was not found.");
    assertSessionFileWithinDirectory(sessionFile, sessionDirectory);
    const revision = getFileRevision(sessionFile);
    const content = readFileSync(sessionFile, "utf8");
    if (!content.trim()) {
      const id = String(options.sessionId || "").trim();
      const cwd = String(options.cwd || "").trim();
      if (!id || !cwd) throw new Error("An empty Zyra session file needs its session ID and working folder.");
      return new ZyraSessionFileManager(sessionFile, sessionDirectory, {
        type: "session",
        version: 3,
        id,
        timestamp: new Date().toISOString(),
        cwd: path.resolve(cwd),
      }, [], false, revision);
    }
    const { header, entries } = parseSessionFile(content);
    return new ZyraSessionFileManager(sessionFile, sessionDirectory, header, entries, true, revision);
  }

  static create(sessionFileValue, sessionDirectoryValue, header) {
    const sessionFile = resolveSessionFileWithinDirectory(sessionFileValue, sessionDirectoryValue);
    if (existsSync(sessionFile)) throw new Error("Zyra session file already exists.");
    if (!header || header.type !== "session" || typeof header.id !== "string" || !header.id) {
      throw new Error("Zyra session file header is invalid.");
    }
    return new ZyraSessionFileManager(sessionFile, sessionDirectoryValue, header, [], false, null);
  }

  getHeader() {
    return this.header;
  }

  getEntries() {
    this.refreshFromDisk();
    return [...this.entries];
  }

  getSessionFile() {
    return this.sessionFile;
  }

  getSessionDir() {
    return this.sessionDirectory;
  }

  getSessionId() {
    return this.header.id;
  }

  getCwd() {
    return this.header.cwd;
  }

  isPersisted() {
    return true;
  }

  appendMessage(message) {
    this.refreshFromDisk();
    const entry = {
      type: "message",
      id: `zyra_${randomUUID()}`,
      parentId: this.leafId,
      timestamp: new Date().toISOString(),
      message,
    };
    return this.appendEntry(entry);
  }

  appendEntry(entry) {
    this.refreshFromDisk();
    if (!entry || typeof entry !== "object" || typeof entry.id !== "string" || !entry.id) {
      throw new TypeError("A Zyra session entry with an ID is required.");
    }
    if (this.entries.some((existing) => existing.id === entry.id)) {
      throw new Error(`Zyra session entry ${entry.id} already exists.`);
    }
    const serialized = `${JSON.stringify(entry)}\n`;
    const sessionFile = resolveSessionFileWithinDirectory(this.sessionFile, this.sessionDirectory);
    if (existsSync(sessionFile) && this.hasHeaderOnDisk) {
      const existing = readFileSync(sessionFile, "utf8");
      const descriptor = openSync(sessionFile, "a");
      try {
        writeFileSync(descriptor, `${existing && !existing.endsWith("\n") ? "\n" : ""}${serialized}`, "utf8");
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
    } else {
      const descriptor = openSync(sessionFile, existsSync(sessionFile) ? "w" : "wx", 0o600);
      try {
        writeFileSync(descriptor, `${JSON.stringify(this.header)}\n${serialized}`, "utf8");
        fsyncSync(descriptor);
      } finally {
        closeSync(descriptor);
      }
      this.hasHeaderOnDisk = true;
    }
    this.entries.push(entry);
    this.leafId = entry.id;
    this.revision = getFileRevision(this.sessionFile);
    this.flushed = true;
    return entry.id;
  }

  rewrite(header, entries) {
    const sessionFile = resolveSessionFileWithinDirectory(this.sessionFile, this.sessionDirectory);
    const temporaryFile = `${sessionFile}.${randomUUID()}.tmp`;
    const descriptor = openSync(temporaryFile, "wx", 0o600);
    try {
      writeFileSync(descriptor, `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
      fsyncSync(descriptor);
    } catch (error) {
      closeSync(descriptor);
      try { unlinkSync(temporaryFile); } catch {}
      throw error;
    }
    closeSync(descriptor);
    try {
      renameSync(temporaryFile, sessionFile);
    } catch (error) {
      try { unlinkSync(temporaryFile); } catch {}
      throw error;
    }
    this.header = header;
    this.entries = [...entries];
    this.leafId = this.entries.at(-1)?.id ?? null;
    this.hasHeaderOnDisk = true;
    this.revision = getFileRevision(sessionFile);
    this.flushed = true;
  }

  refreshFromDisk() {
    const sessionFile = resolveSessionFileWithinDirectory(this.sessionFile, this.sessionDirectory);
    if (!existsSync(sessionFile)) {
      if (this.hasHeaderOnDisk) throw new Error("Zyra session file was removed while open.");
      this.revision = null;
      return false;
    }
    const revision = getFileRevision(sessionFile);
    if (revision === this.revision) return false;
    const content = readFileSync(sessionFile, "utf8");
    if (!content.trim()) {
      if (this.hasHeaderOnDisk) throw new Error("Zyra session file was cleared while open.");
      this.revision = revision;
      return false;
    }
    const parsed = parseSessionFile(content);
    if (parsed.header.id !== this.header.id) throw new Error("Zyra session file identity changed while open.");
    this.header = parsed.header;
    this.entries = parsed.entries;
    this.leafId = this.entries.at(-1)?.id ?? null;
    this.hasHeaderOnDisk = true;
    this.revision = revision;
    return true;
  }
}

export function ensureSessionManagerDurable(sessionManager) {
  const sessionFileValue = sessionManager?.getSessionFile?.();
  if (!sessionFileValue || sessionManager?.isPersisted?.() === false) return false;
  if (typeof sessionManager.getHeader !== "function"
    || typeof sessionManager.getEntries !== "function"
    || (typeof sessionManager.getSessionFileDirectory !== "function" && typeof sessionManager.getSessionDir !== "function")) {
    throw new Error("Zyra session manager does not expose durable session data.");
  }

  const header = sessionManager.getHeader();
  const entries = sessionManager.getEntries();
  if (!header || header.type !== "session" || typeof header.id !== "string"
    || header.id !== sessionManager.getSessionId?.() || !Array.isArray(entries)) {
    throw new Error("Zyra session manager returned invalid durable session data.");
  }

  const sessionDirectory = sessionManager.getSessionFileDirectory?.() ?? sessionManager.getSessionDir();
  const sessionFile = resolveSessionFileWithinDirectory(sessionFileValue, sessionDirectory);
  const fileExists = existsSync(sessionFile);
  const existingText = fileExists ? readFileSync(sessionFile, "utf8") : "";
  const existing = existingText.trim() ? parseSessionFile(existingText) : null;
  if (existing && JSON.stringify(existing.header) !== JSON.stringify(header)) {
    throw new Error("Zyra session file header changed while the session was open.");
  }

  const persistedEntries = existing?.entries ?? [];
  if (persistedEntries.length > entries.length
    || persistedEntries.some((entry, index) => JSON.stringify(entry) !== JSON.stringify(entries[index]))) {
    throw new Error("Zyra session file changed outside the active session manager.");
  }

  const records = existing ? entries.slice(persistedEntries.length) : [header, ...entries];
  if (records.length === 0) return true;
  const serialized = `${records.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
  const descriptor = openSync(sessionFile, fileExists ? "a" : "wx", 0o600);
  try {
    const prefix = fileExists && existingText && !existingText.endsWith("\n") ? "\n" : "";
    writeFileSync(descriptor, `${prefix}${serialized}`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }

  if (typeof sessionManager.setSessionFile === "function") sessionManager.setSessionFile(sessionFile);
  return true;
}

function parseSessionFile(content) {
  const lines = String(content).split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) throw new Error("Zyra session file has no header.");
  lines[0] = lines[0].replace(/^\uFEFF/, "");
  const records = lines.flatMap((line) => {
    try {
      const value = JSON.parse(line);
      return value && typeof value === "object" && !Array.isArray(value) ? [value] : [];
    } catch {
      return [];
    }
  });
  const [header, ...entries] = records;
  if (header?.type !== "session" || typeof header.id !== "string" || !header.id) {
    throw new Error("Zyra session file header is invalid.");
  }
  return { header, entries };
}

function getFileRevision(file) {
  const stats = statSync(file, { bigint: true });
  if (!stats.isFile()) throw new Error("Zyra session path is not a file.");
  return `${stats.dev}:${stats.ino}:${stats.size}:${stats.mtimeNs}:${stats.ctimeNs}`;
}

function assertSessionFileWithinDirectory(sessionFile, sessionDirectory) {
  const root = realpathSync.native(sessionDirectory);
  const file = realpathSync.native(sessionFile);
  assertPathWithinDirectory(root, file);
}

function resolveSessionFileWithinDirectory(sessionFileValue, sessionDirectoryValue) {
  const sessionDirectory = path.resolve(String(sessionDirectoryValue || ""));
  const sessionFile = path.resolve(String(sessionFileValue || ""));
  const root = realpathSync.native(sessionDirectory);
  if (existsSync(sessionFile)) {
    assertSessionFileWithinDirectory(sessionFile, sessionDirectory);
    return realpathSync.native(sessionFile);
  }
  const parent = realpathSync.native(path.dirname(sessionFile));
  const target = path.join(parent, path.basename(sessionFile));
  assertPathWithinDirectory(root, target);
  return target;
}

function assertPathWithinDirectory(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("Zyra session file must stay inside its project session folder.");
  }
}
