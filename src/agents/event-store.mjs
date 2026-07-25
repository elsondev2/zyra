import { createReadStream } from "node:fs";
import { randomUUID } from "node:crypto";
import { appendFile, mkdir, open, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";
import { createFleetEvent, createFleetSnapshot, TERMINAL_AGENT_STATES, TERMINAL_WORKFLOW_STATES } from "./contracts.mjs";
import { reduceFleetEvents } from "./reducer.mjs";

export class FleetEventStore {
  constructor(options = {}) {
    this.project = path.resolve(options.project ?? process.cwd());
    this.rootSessionId = requiredSegment(options.rootSessionId, "rootSessionId");
    this.rootThreadId = String(options.rootThreadId ?? options.rootSessionId);
    this.fleetId = String(options.fleetId ?? "");
    this.directory = path.join(this.project, ".zyra", "agent-runs", this.rootSessionId);
    this.snapshotFile = path.join(this.directory, "fleet.snapshot.json");
    this.eventsFile = path.join(this.directory, "fleet.events.jsonl");
    this.snapshot = null;
    this.sequence = 0;
    this.listeners = new Set();
    this.queue = Promise.resolve();
    this.snapshotTimer = null;
    this.snapshotWrite = Promise.resolve();
    this.snapshotDebounceMs = Math.max(10, Number(options.snapshotDebounceMs) || 120);
  }

  async initialize(input = {}) {
    await mkdir(this.directory, { recursive: true });
    const loaded = await this.load();
    if (loaded.snapshot) {
      this.snapshot = loaded.snapshot;
      this.fleetId = loaded.snapshot.fleetId;
      this.sequence = Math.max(loaded.maxSequence, loaded.snapshot.lastAppliedSequence);
      return loaded;
    }
    this.snapshot = createFleetSnapshot({
      fleetId: input.fleetId ?? this.fleetId,
      rootSessionId: this.rootSessionId,
      rootThreadId: this.rootThreadId,
      project: this.project,
    });
    this.fleetId = this.snapshot.fleetId;
    await this.append("fleet.created", { project: this.project }, { flush: true });
    return { snapshot: this.snapshot, events: [], warnings: loaded.warnings, maxSequence: this.sequence };
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  append(type, payload = {}, refs = {}) {
    const task = this.queue.then(async () => {
      if (!this.snapshot) throw new Error("FleetEventStore must be initialized before append.");
      const event = createFleetEvent({
        sequence: ++this.sequence,
        rootSessionId: this.rootSessionId,
        rootThreadId: this.rootThreadId,
        fleetId: this.fleetId,
        type,
        payload,
        agentRunId: refs.agentRunId,
        workflowRunId: refs.workflowRunId,
        phaseId: refs.phaseId,
      });
      await appendFile(this.eventsFile, `${JSON.stringify(event)}\n`, "utf8");
      this.snapshot = reduceFleetEvents(this.snapshot, [event]);
      await this.persistRecordsForEvent(event);
      if (refs.flush || isTerminalEvent(event)) await this.flushSnapshot();
      else this.scheduleSnapshot();
      const snapshot = this.getSnapshot();
      for (const listener of this.listeners) {
        try { listener({ event, snapshot }); } catch { /* projections must not break durable writes */ }
      }
      return event;
    });
    this.queue = task.then(() => undefined, () => undefined);
    return task;
  }

  async load() {
    const warnings = [];
    let snapshot;
    try {
      snapshot = createFleetSnapshot(JSON.parse(await readFile(this.snapshotFile, "utf8")));
    } catch (error) {
      if (error?.code !== "ENOENT") warnings.push(`snapshot ignored: ${error instanceof Error ? error.message : String(error)}`);
    }
    const events = await readJsonLines(this.eventsFile, warnings);
    const maxSequence = events.reduce((max, event) => Math.max(max, Number(event?.sequence) || 0), 0);
    if (!snapshot && events.length) {
      try { snapshot = reduceFleetEvents(undefined, events); } catch (error) { warnings.push(`event replay failed: ${error instanceof Error ? error.message : String(error)}`); }
    } else if (snapshot) {
      snapshot = reduceFleetEvents(snapshot, events.filter((event) => event.sequence > snapshot.lastAppliedSequence));
    }
    return { snapshot, events, warnings, maxSequence };
  }

  getSnapshot() {
    return this.snapshot ? createFleetSnapshot(this.snapshot) : null;
  }

  async writeWorkflowScript(workflowRunId, source) {
    const directory = this.workflowDirectory(workflowRunId);
    await mkdir(path.join(directory, "cache"), { recursive: true });
    await atomicWrite(path.join(directory, "script.mjs"), String(source));
  }

  workflowDirectory(workflowRunId) {
    return path.join(this.directory, "workflows", requiredSegment(workflowRunId, "workflowRunId"));
  }

  agentRecordFile(agentRunId) {
    return path.join(this.directory, "agents", `${requiredSegment(agentRunId, "agentRunId")}.json`);
  }

  async flush() {
    await this.queue;
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
      this.snapshotTimer = null;
    }
    if (this.snapshot) await this.flushSnapshot();
  }

  scheduleSnapshot() {
    if (this.snapshotTimer) return;
    this.snapshotTimer = setTimeout(() => {
      this.snapshotTimer = null;
      void this.flushSnapshot();
    }, this.snapshotDebounceMs);
    this.snapshotTimer.unref?.();
  }

  async flushSnapshot() {
    if (!this.snapshot) return;
    const contents = `${JSON.stringify(this.snapshot, null, 2)}\n`;
    const write = this.snapshotWrite.then(() => atomicWrite(this.snapshotFile, contents));
    this.snapshotWrite = write.catch(() => undefined);
    await write;
  }

  async persistRecordsForEvent(event) {
    if (event.agentRunId && this.snapshot.agents[event.agentRunId]) {
      await mkdir(path.dirname(this.agentRecordFile(event.agentRunId)), { recursive: true });
      await atomicWrite(this.agentRecordFile(event.agentRunId), `${JSON.stringify(this.snapshot.agents[event.agentRunId], null, 2)}\n`);
    }
    if (event.workflowRunId && this.snapshot.workflows[event.workflowRunId]) {
      const directory = this.workflowDirectory(event.workflowRunId);
      await mkdir(path.join(directory, "cache"), { recursive: true });
      await atomicWrite(path.join(directory, "snapshot.json"), `${JSON.stringify(this.snapshot.workflows[event.workflowRunId], null, 2)}\n`);
      await appendFile(path.join(directory, "events.jsonl"), `${JSON.stringify(event)}\n`, "utf8");
    }
  }
}

export async function atomicWrite(file, contents) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  const handle = await open(temporary, "w", 0o600);
  try {
    await handle.writeFile(contents, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(temporary, file);
}

async function readJsonLines(file, warnings) {
  const events = [];
  try {
    const input = createReadStream(file, { encoding: "utf8" });
    const lines = readline.createInterface({ input, crlfDelay: Infinity });
    let lineNumber = 0;
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      try { events.push(JSON.parse(line)); } catch (error) { warnings.push(`event line ${lineNumber} ignored: ${error instanceof Error ? error.message : String(error)}`); }
    }
  } catch (error) {
    if (error?.code !== "ENOENT") warnings.push(`event log ignored: ${error instanceof Error ? error.message : String(error)}`);
  }
  return events;
}

function isTerminalEvent(event) {
  if (["agent.result.completed", "agent.failed", "workflow.completed", "workflow.failed"].includes(event.type)) return true;
  if (event.type === "agent.state.changed" && TERMINAL_AGENT_STATES.has(event.payload?.status)) return true;
  if (event.type === "workflow.state.changed" && TERMINAL_WORKFLOW_STATES.has(event.payload?.status)) return true;
  return false;
}

function requiredSegment(value, name) {
  const text = String(value ?? "").trim();
  if (!text || text === "." || text === ".." || /[\\/\0]/.test(text)) throw new TypeError(`${name} must be a safe path segment.`);
  return text;
}
