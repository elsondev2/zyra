import { createHash, randomUUID } from "node:crypto";
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";
import os from "node:os";
import { DatabaseSync, backup as sqliteBackup } from "node:sqlite";
import { getAgentServerPaths } from "../src/agent-server/paths.mjs";

const CONFIRMATION = "APPLY_VERIFIED_CHAT_MIGRATION";
const args = parseArgs(process.argv.slice(2));
if (!args.report) throw new Error("Pass --report <dry-run-report.json>.");

const reportPath = path.resolve(args.report);
const report = JSON.parse(readFileSync(reportPath, "utf8"));
if (report?.mode !== "dry-run" || report?.version !== 1) throw new Error("Unsupported migration report.");
const snapshotPath = path.resolve(report.source?.verifiedSnapshot || "");
if (!existsSync(snapshotPath)) throw new Error(`Verified source snapshot is missing: ${snapshotPath}`);
const expectedSnapshotHash = String(report.source?.verifiedSnapshotSha256 || "").trim().toLowerCase();
if (!/^[a-f0-9]{64}$/.test(expectedSnapshotHash)) throw new Error("Migration report does not contain a verified snapshot SHA-256.");
const actualSnapshotHash = sha256File(snapshotPath);
if (actualSnapshotHash !== expectedSnapshotHash) throw new Error(`Verified snapshot hash changed: ${snapshotPath}`);
const liveDbPath = path.resolve(args.liveDb || path.join(os.homedir(), "AppData", "Roaming", "Zyra-dev", "assistant", "assistant-state.sqlite"));
const stateDirectory = path.resolve(args.stateDirectory || path.join(os.homedir(), ".zyra"));
const catalogPath = path.join(stateDirectory, "chat-catalog-v1.json");

if (args.validateRecoveryOnly) {
  const validationId = new Date().toISOString().replace(/[:.]/g, "-");
  const validationDirectory = path.join(path.dirname(snapshotPath), `recovery-validation-${validationId}`);
  mkdirSync(validationDirectory, { recursive: true });
  const sourceDb = new DatabaseSync(snapshotPath, { readOnly: true });
  let staged;
  try {
    staged = stageMissingCanonicalTranscripts(sourceDb, report.orphanDesktopRows || [], validationDirectory, stateDirectory);
  } finally {
    sourceDb.close();
  }
  const validation = {
    mode: "recovery-validation-only",
    reportPath,
    generatedAt: new Date().toISOString(),
    transcripts: staged.map(({ canonicalChatId, stagingPath, sha256, sourceMessageCount, sourceActivityCount }) => ({
      canonicalChatId,
      stagingPath,
      sha256,
      sourceMessageCount,
      sourceActivityCount
    }))
  };
  const validationPath = path.join(validationDirectory, "recovery-validation-manifest.json");
  writeFileSync(validationPath, `${JSON.stringify(validation, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify({ validationPath, transcripts: staged.length }, null, 2)}\n`);
  process.exit(0);
}

if (!args.apply || args.confirm !== CONFIRMATION) {
  throw new Error(`Apply is locked. Re-run only in a coordinated idle window with --apply --confirm ${CONFIRMATION}.`);
}
assertIdleWindow({ liveDbPath, stateDirectory });

const migrationId = new Date().toISOString().replace(/[:.]/g, "-");
const backupDirectory = path.join(path.dirname(snapshotPath), `pre-apply-${migrationId}`);
const stagingDirectory = path.join(backupDirectory, "recovered-transcripts-staging");
mkdirSync(stagingDirectory, { recursive: true });
const manifest = {
  version: 1,
  migrationId,
  reportPath,
  sourceSnapshot: { path: snapshotPath, sha256: actualSnapshotHash },
  liveDatabase: liveDbPath,
  catalogPath,
  createdAt: new Date().toISOString(),
  recoveredTranscripts: [],
  metadataUpdates: [],
  verification: {}
};

const sourceDb = new DatabaseSync(snapshotPath, { readOnly: true });
let stagedTranscripts;
try {
  stagedTranscripts = stageMissingCanonicalTranscripts(sourceDb, report.orphanDesktopRows || [], stagingDirectory, stateDirectory);
} finally {
  sourceDb.close();
}
manifest.recoveredTranscripts = stagedTranscripts.map(({ canonicalChatId, destinationPath, sha256, sourceMessageCount, sourceActivityCount }) => ({
  canonicalChatId,
  destinationPath,
  sha256,
  sourceMessageCount,
  sourceActivityCount
}));

mkdirSync(backupDirectory, { recursive: true });
const databaseBackupPath = path.join(backupDirectory, "assistant-state.sqlite.before-apply");
const liveDbForBackup = new DatabaseSync(liveDbPath, { readOnly: true });
try {
  await sqliteBackup(liveDbForBackup, databaseBackupPath);
} finally {
  liveDbForBackup.close();
}
assertSqliteOk(databaseBackupPath);
if (existsSync(catalogPath)) copyFileSync(catalogPath, path.join(backupDirectory, "chat-catalog-v1.json.before-apply"));

for (const staged of stagedTranscripts) {
  if (existsSync(staged.destinationPath)) throw new Error(`Canonical transcript destination appeared during migration: ${staged.destinationPath}`);
  mkdirSync(path.dirname(staged.destinationPath), { recursive: true });
  copyFileSync(staged.stagingPath, staged.destinationPath, constants.COPYFILE_EXCL);
  if (sha256File(staged.destinationPath) !== staged.sha256) throw new Error(`Recovered transcript verification failed: ${staged.destinationPath}`);
}

const reportMetadata = [...(report.recommendations || []), ...(report.orphanDesktopRows || [])]
  .filter((entry) => entry?.canonicalChatId);
const updates = reportMetadata.filter((entry) =>
  entry.title?.changed || (entry.project?.changed && ["high", "medium"].includes(entry.project?.confidence))
);
const liveDb = new DatabaseSync(liveDbPath);
try {
  liveDb.exec("BEGIN IMMEDIATE");
  const updateSession = liveDb.prepare(`
    UPDATE assistant_sessions
    SET title = ?, project_path = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateThread = liveDb.prepare(`
    UPDATE assistant_threads
    SET cwd = ?, updated_at = ?
    WHERE id = ?
  `);
  const occurredAt = new Date().toISOString();
  for (const entry of updates) {
    const title = entry.title?.changed ? entry.title.recommended : entry.title.current;
    const project = entry.project?.changed && ["high", "medium"].includes(entry.project?.confidence)
      ? entry.project.recommended
      : entry.project.current;
    if (entry.desktopSessionId) updateSession.run(title, project, occurredAt, entry.desktopSessionId);
    if (entry.desktopThreadId) updateThread.run(project, occurredAt, entry.desktopThreadId);
    manifest.metadataUpdates.push({
      canonicalChatId: entry.canonicalChatId,
      desktopSessionId: entry.desktopSessionId,
      desktopThreadId: entry.desktopThreadId,
      title,
      project
    });
  }
  liveDb.exec("COMMIT");
} catch (error) {
  try { liveDb.exec("ROLLBACK"); } catch {}
  throw error;
} finally {
  liveDb.close();
}

const catalog = readCatalog(catalogPath);
for (const entry of reportMetadata) {
  const title = entry.title?.recommended || entry.title?.current || entry.currentTitle;
  const project = entry.project?.changed && ["high", "medium"].includes(entry.project?.confidence)
    ? entry.project.recommended
    : entry.project?.current || entry.currentProject;
  catalog.metadata[entry.canonicalChatId] = {
    ...(catalog.metadata[entry.canonicalChatId] || {}),
    ...(title ? { title } : {}),
    ...(project ? { project, cwd: project } : {}),
    updatedAt: new Date().toISOString()
  };
}
for (const recovered of stagedTranscripts) {
  const existingMetadata = catalog.metadata[recovered.canonicalChatId] || {};
  catalog.metadata[recovered.canonicalChatId] = {
    ...existingMetadata,
    title: existingMetadata.title || recovered.title,
    project: existingMetadata.project || recovered.project,
    cwd: existingMetadata.cwd || existingMetadata.project || recovered.project,
    recoveredFromDesktopSnapshot: true,
    updatedAt: new Date().toISOString()
  };
}
catalog.projects = mergeProjects(catalog.projects, [
  os.homedir(),
  ...reportMetadata.map((entry) => entry.project?.changed && ["high", "medium"].includes(entry.project?.confidence)
    ? entry.project.recommended
    : entry.project?.current || entry.currentProject)
]);
catalog.updatedAt = new Date().toISOString();
writeJsonAtomic(catalogPath, catalog);

assertSqliteOk(liveDbPath);
manifest.verification = {
  liveDatabaseQuickCheck: "ok",
  liveDatabaseSha256: sha256File(liveDbPath),
  catalogSha256: sha256File(catalogPath),
  recoveredTranscriptCount: stagedTranscripts.length,
  metadataUpdateCount: manifest.metadataUpdates.length,
  canonicalMetadataUpdateCount: reportMetadata.length
};
writeFileSync(path.join(backupDirectory, "migration-apply-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ backupDirectory, verification: manifest.verification }, null, 2)}\n`);

function stageMissingCanonicalTranscripts(db, orphanRows, stagingDirectory, stateDirectory) {
  const result = [];
  const readSession = db.prepare(`
    SELECT s.id AS session_id, s.title, s.project_path, s.created_at,
           t.id AS thread_id, t.provider_thread_id, t.cwd
    FROM assistant_sessions s
    JOIN assistant_threads t ON t.session_id = s.id
    WHERE t.id = ? AND t.provider_thread_id = ?
  `);
  const readMessages = db.prepare(`
    SELECT id, role, text, turn_id, timeline_sequence, created_at, updated_at
    FROM assistant_messages WHERE thread_id = ?
    ORDER BY COALESCE(timeline_sequence, 9223372036854775807), created_at, id
  `);
  const readActivities = db.prepare(`
    SELECT id, kind, tone, summary, detail, turn_id, timeline_sequence, created_at, payload_json
    FROM assistant_activities WHERE thread_id = ?
    ORDER BY COALESCE(timeline_sequence, 9223372036854775807), created_at, id
  `);

  for (const orphan of orphanRows) {
    const canonicalChatId = String(orphan.canonicalChatId || "");
    if (!canonicalChatId || !orphan.desktopThreadId) throw new Error("Orphan recovery row is incomplete.");
    const existing = findCanonicalTranscript(stateDirectory, canonicalChatId);
    if (existing) throw new Error(`Report is stale; canonical transcript already exists: ${existing}`);
    const session = readSession.get(orphan.desktopThreadId, canonicalChatId);
    if (!session) throw new Error(`Verified snapshot no longer contains orphan thread ${orphan.desktopThreadId}.`);
    const messages = readMessages.all(orphan.desktopThreadId);
    const activities = readActivities.all(orphan.desktopThreadId);
    const entries = buildRecoveredEntries(session, messages, activities);
    const timestamp = normalizeFileTimestamp(session.created_at);
    const fileName = `${timestamp}_${canonicalChatId}.jsonl`;
    const stagingPath = path.join(stagingDirectory, fileName);
    const destinationPath = path.join(stateDirectory, "sessions", fileName);
    const content = `${entries.map((entry) => JSON.stringify(entry)).join("\n")}\n`;
    writeFileSync(stagingPath, content, { encoding: "utf8", mode: 0o600, flag: "wx" });
    validateRecoveredTranscript(stagingPath, canonicalChatId);
    result.push({
      canonicalChatId,
      stagingPath,
      destinationPath,
      sha256: sha256File(stagingPath),
      sourceMessageCount: messages.length,
      sourceActivityCount: activities.length,
      title: String(session.title || orphan.currentTitle || "Recovered chat"),
      project: path.resolve(String(session.project_path || session.cwd || orphan.currentProject || os.homedir()))
    });
  }
  return result;
}

function buildRecoveredEntries(session, messages, activities) {
  const createdAt = toIso(session.created_at);
  const records = [
    ...messages.map((row) => ({ kind: "message", sequence: numberOrMax(row.timeline_sequence), createdAt: toIso(row.created_at), row })),
    ...activities.map((row) => ({ kind: "activity", sequence: numberOrMax(row.timeline_sequence), createdAt: toIso(row.created_at), row }))
  ].sort((left, right) => left.sequence - right.sequence || left.createdAt.localeCompare(right.createdAt) || String(left.row.id).localeCompare(String(right.row.id)));
  const entries = [{
    type: "session",
    version: 3,
    id: String(session.provider_thread_id),
    timestamp: createdAt,
    cwd: path.resolve(String(session.project_path || session.cwd || os.homedir()))
  }];
  let parentId = null;
  const append = (entry) => {
    const id = stableEntryId(entry.id || randomUUID());
    entries.push({ ...entry, id, parentId });
    parentId = id;
  };
  append({ type: "session_info", name: String(session.title || "Recovered chat"), timestamp: createdAt });
  append({
    type: "custom",
    customType: "zyra.desktop-recovery.v1",
    timestamp: createdAt,
    data: {
      source: "verified Desktop SQLite snapshot",
      desktopSessionId: String(session.session_id),
      desktopThreadId: String(session.thread_id),
      recoveredAt: new Date().toISOString()
    }
  });
  for (const record of records) {
    if (record.kind === "message") {
      const role = ["user", "assistant", "system"].includes(String(record.row.role)) ? String(record.row.role) : "system";
      append({
        type: "message",
        id: record.row.id,
        timestamp: record.createdAt,
        message: {
          id: String(record.row.id),
          role,
          content: [{ type: "text", text: String(record.row.text || "") }],
          timestamp: Date.parse(record.createdAt)
        }
      });
      continue;
    }
    const payload = parseJson(record.row.payload_json);
    const toolName = String(payload.toolName || record.row.kind || "activity");
    const isTool = record.row.tone === "tool" || payload.toolName || payload.toolCallId;
    const isError = record.row.tone === "error";
    if (isTool) {
      const toolCallId = String(payload.toolCallId || record.row.id);
      append({
        type: "message",
        id: `${record.row.id}:call`,
        timestamp: record.createdAt,
        message: {
          id: `${record.row.id}:call`,
          role: "assistant",
          content: [{ type: "toolCall", id: toolCallId, name: toolName, arguments: payload.args || {} }],
          timestamp: Date.parse(record.createdAt)
        }
      });
      append({
        type: "message",
        id: `${record.row.id}:result`,
        timestamp: record.createdAt,
        message: {
          id: `${record.row.id}:result`,
          role: "toolResult",
          toolCallId,
          toolName,
          isError,
          content: [{ type: "text", text: activityText(record.row, payload) }],
          timestamp: Date.parse(record.createdAt)
        }
      });
    } else if (record.row.kind === "reasoning") {
      append({
        type: "message",
        id: record.row.id,
        timestamp: record.createdAt,
        message: {
          id: String(record.row.id),
          role: "assistant",
          content: [{ type: "thinking", thinking: String(record.row.detail || record.row.summary || "") }],
          timestamp: Date.parse(record.createdAt)
        }
      });
    } else if (isError) {
      append({
        type: "message",
        id: record.row.id,
        timestamp: record.createdAt,
        message: {
          id: String(record.row.id),
          role: "assistant",
          content: [],
          stopReason: "error",
          errorMessage: String(record.row.detail || record.row.summary || "Recovered Desktop error"),
          timestamp: Date.parse(record.createdAt)
        }
      });
    }
    append({
      type: "custom",
      id: `${record.row.id}:desktop-activity`,
      customType: "zyra.recovered-desktop-activity.v1",
      timestamp: record.createdAt,
      data: {
        id: record.row.id,
        kind: record.row.kind,
        tone: record.row.tone,
        summary: record.row.summary,
        detail: record.row.detail,
        turnId: record.row.turn_id,
        timelineSequence: record.row.timeline_sequence,
        payload
      }
    });
  }
  return entries;
}

function activityText(row, payload) {
  const parts = [row.summary, row.detail, payload.output, payload.result]
    .filter((value) => value !== undefined && value !== null && value !== "")
    .map((value) => typeof value === "string" ? value : JSON.stringify(value));
  return parts.join("\n\n") || "Recovered Desktop tool activity";
}

function assertIdleWindow({ liveDbPath, stateDirectory }) {
  if (!existsSync(liveDbPath)) throw new Error(`Live Desktop database is missing: ${liveDbPath}`);
  const descriptorPath = getAgentServerPaths({ stateDirectory, channel: "default" }).descriptorFile;
  if (existsSync(descriptorPath)) {
    try {
      const descriptor = JSON.parse(readFileSync(descriptorPath, "utf8"));
      if (descriptor.pid && isProcessAlive(Number(descriptor.pid))) {
        throw new Error(`Agent server PID ${descriptor.pid} is active. Close Zyra/Desktop normally and retry; this script will not terminate it.`);
      }
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(`Agent-server descriptor is malformed: ${descriptorPath}`);
      throw error;
    }
  }
  const temporaryDb = `${liveDbPath}.tmp`;
  if (existsSync(temporaryDb) && Date.now() - statSync(temporaryDb).mtimeMs < 5 * 60_000) {
    throw new Error(`Desktop persistence temp file was modified recently: ${temporaryDb}. Wait for a coordinated idle window.`);
  }
}

function validateRecoveredTranscript(file, canonicalChatId) {
  const lines = readFileSync(file, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  if (lines[0]?.type !== "session" || lines[0]?.id !== canonicalChatId) throw new Error(`Recovered transcript header is invalid: ${file}`);
  const ids = new Set();
  for (const entry of lines.slice(1)) {
    if (!entry.id || ids.has(entry.id)) throw new Error(`Recovered transcript has a missing/duplicate entry id: ${file}`);
    ids.add(entry.id);
  }
}

function findCanonicalTranscript(stateDirectory, canonicalChatId) {
  const sessions = path.join(stateDirectory, "sessions");
  if (!existsSync(sessions)) return null;
  const indexFile = path.join(stateDirectory, "chat-index-v2.json");
  if (existsSync(indexFile)) {
    const indexed = JSON.parse(readFileSync(indexFile, "utf8"))?.chats?.[canonicalChatId]?.sessionPath;
    if (indexed && existsSync(indexed)) return indexed;
  }
  return null;
}

function assertSqliteOk(file) {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const row = db.prepare("PRAGMA quick_check").get();
    if (!row || !Object.values(row).includes("ok")) throw new Error(`SQLite quick_check failed: ${file}`);
  } finally {
    db.close();
  }
}

function readCatalog(file) {
  if (!existsSync(file)) return { version: 1, projects: [], aliases: {}, surfaces: {}, metadata: {}, updatedAt: new Date().toISOString() };
  const value = JSON.parse(readFileSync(file, "utf8"));
  return {
    version: 1,
    projects: Array.isArray(value.projects) ? value.projects : [],
    aliases: value.aliases && typeof value.aliases === "object" ? value.aliases : {},
    surfaces: value.surfaces && typeof value.surfaces === "object" ? value.surfaces : {},
    metadata: value.metadata && typeof value.metadata === "object" ? value.metadata : {},
    updatedAt: String(value.updatedAt || new Date().toISOString())
  };
}

function mergeProjects(existing, projects) {
  const byKey = new Map((existing || []).map((entry) => [pathKey(entry.path), entry]));
  for (const project of projects.filter(Boolean)) {
    const resolved = path.resolve(project);
    byKey.set(pathKey(resolved), { path: resolved, updatedAt: new Date().toISOString() });
  }
  return [...byKey.values()];
}

function writeJsonAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function parseJson(value) {
  try { return JSON.parse(String(value || "{}")) || {}; }
  catch { return { rawPayload: String(value || "") }; }
}

function stableEntryId(value) {
  return createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
}

function normalizeFileTimestamp(value) {
  return toIso(value).replace(/[:.]/g, "-").replace("Z", "Z");
}

function numberOrMax(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER;
}

function toIso(value) {
  const date = new Date(String(value || ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function pathKey(value) {
  const resolved = path.resolve(String(value || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function isProcessAlive(pid) {
  try { process.kill(pid, 0); return true; }
  catch { return false; }
}

function sha256File(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

function parseArgs(values) {
  const result = { report: "", liveDb: "", stateDirectory: "", apply: false, confirm: "", validateRecoveryOnly: false };
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === "--report") result.report = values[++index] || "";
    else if (value === "--live-db") result.liveDb = values[++index] || "";
    else if (value === "--state-directory") result.stateDirectory = values[++index] || "";
    else if (value === "--apply") result.apply = true;
    else if (value === "--confirm") result.confirm = values[++index] || "";
    else if (value === "--validate-recovery-only") result.validateRecoveryOnly = true;
  }
  return result;
}
