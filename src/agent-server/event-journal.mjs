import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { MAX_AGENT_SERVER_REPLAY_EVENTS } from "./protocol.mjs";

const MAX_JOURNAL_BYTES = 8 * 1024 * 1024;
const MAX_DURABLE_EVENT_BYTES = 1024 * 1024;
// Live sessions replay these from ServerOwnedSession memory. Persisting every token/update
// synchronously blocks the shared server event loop and delays the turn completion itself.
const TRANSIENT_EVENT_TYPES = new Set(["message_update", "tool_execution_update"]);

export class AgentEventJournal {
  constructor(directory, canonicalChatId) {
    this.directory = path.resolve(directory);
    this.canonicalChatId = String(canonicalChatId || "");
    this.file = journalFile(this.directory, this.canonicalChatId);
    this.entries = readEntries(this.file);
  }

  append(entry) {
    if (TRANSIENT_EVENT_TYPES.has(entry?.event?.type)) return;
    mkdirSync(this.directory, { recursive: true });
    const durableEntry = toDurableEntry(entry);
    this.entries.push(durableEntry);
    if (this.entries.length > MAX_AGENT_SERVER_REPLAY_EVENTS) {
      this.entries.splice(0, this.entries.length - MAX_AGENT_SERVER_REPLAY_EVENTS);
    }
    appendFileSync(this.file, `${JSON.stringify(durableEntry)}\n`, { encoding: "utf8", mode: 0o600 });
    if (fileSize(this.file) > MAX_JOURNAL_BYTES) this.compact();
  }

  replay(afterSequence = 0) {
    return this.entries.filter((entry) => Number(entry.sequence) > afterSequence);
  }

  latestSequence() {
    return this.entries.reduce((latest, entry) => Math.max(latest, Number(entry.sequence) || 0), 0);
  }

  compact() {
    mkdirSync(this.directory, { recursive: true });
    const temporary = `${this.file}.tmp`;
    const content = this.entries.map((entry) => JSON.stringify(entry)).join("\n");
    writeFileSync(temporary, content ? `${content}\n` : "", { encoding: "utf8", mode: 0o600 });
    renameSync(temporary, this.file);
  }
}

function toDurableEntry(entry) {
  const serialized = JSON.stringify(entry);
  if (Buffer.byteLength(serialized, "utf8") <= MAX_DURABLE_EVENT_BYTES) return entry;
  return {
    sequence: entry.sequence,
    occurredAt: entry.occurredAt,
    requestContext: entry.requestContext,
    event: { type: "zyra_server_event_omitted", originalType: entry.event?.type, reason: "journal-limit" }
  };
}

function journalFile(directory, canonicalChatId) {
  const hash = createHash("sha256").update(canonicalChatId).digest("hex");
  return path.join(directory, `${hash}.jsonl`);
}

function readEntries(file) {
  try {
    const entries = readFileSync(file, "utf8")
      .split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line);
          return parsed && Number.isFinite(Number(parsed.sequence)) && parsed.event ? [parsed] : [];
        } catch {
          return [];
        }
      });
    return entries.slice(-MAX_AGENT_SERVER_REPLAY_EVENTS);
  } catch {
    return [];
  }
}

function fileSize(file) {
  try { return statSync(file).size; }
  catch { return 0; }
}
