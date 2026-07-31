import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CanonicalChatCatalog } from "../src/agent-server/catalog.mjs";
import { ZyraAgentServerClient } from "../src/agent-server/client.mjs";
import { ZyraAgentServer } from "../src/agent-server/server.mjs";
import { AgentEventJournal } from "../src/agent-server/event-journal.mjs";
import { createZyraTuiClientRuntime } from "../src/agent-server/tui-runtime.mjs";

class FakeWorker extends EventEmitter {
  constructor() {
    super();
    this.activePrompt = null;
    this.controlResponses = [];
    this.disposed = false;
  }
  isAlive() { return !this.disposed; }
  request(type) {
    if (type === "connect") return Promise.resolve({ threadId: "chat:test", providerThreadId: sessionPath, events: [] });
    if (type === "prompt") return new Promise((resolve) => { this.activePrompt = resolve; });
    if (type === "abort") return Promise.resolve({ aborted: true });
    return Promise.resolve({ ok: true });
  }
  finishPrompt(result) {
    const resolve = this.activePrompt;
    this.activePrompt = null;
    resolve?.(result);
  }
  sendControlResponse(message) { this.controlResponses.push(message); return true; }
  dispose() { this.disposed = true; this.removeAllListeners(); }
}

const stateDirectory = mkdtempSync(path.join(os.tmpdir(), "zyra-agent-server-test-"));
const channel = `test-${process.pid}-${Date.now()}`;
const project = path.join(stateDirectory, "project");
const sessionPath = path.join(project, ".zyra", "sessions", "chat-test.jsonl");
const fakeSessions = [{
  path: sessionPath,
  id: "chat:test",
  cwd: project,
  name: "Shared desktop and TUI chat",
  created: new Date("2026-07-01T00:00:00.000Z"),
  modified: new Date("2026-07-02T00:00:00.000Z"),
  messageCount: 8,
  firstMessage: "hello"
}];
const catalog = new CanonicalChatCatalog({
  stateDirectory,
  channel,
  loadSessionManager: async () => ({
    list: async () => fakeSessions,
    open: () => ({ getEntries: () => [{ type: "message", message: { role: "user", content: "hello" } }] })
  })
});
const durableJournal = new AgentEventJournal(path.join(stateDirectory, "journal-test"), "chat:journal");
durableJournal.append({ sequence: 1, occurredAt: new Date().toISOString(), event: { type: "message_end" } });
assert.equal(new AgentEventJournal(path.join(stateDirectory, "journal-test"), "chat:journal").replay(0).length, 1);

const workers = [];
const server = new ZyraAgentServer({
  root: path.resolve("."), stateDirectory, channel, catalog, idleTimeoutMs: 5_000,
  desktopAuthorityToken: "test-desktop-authority",
  createWorker: () => {
    const worker = new FakeWorker();
    workers.push(worker);
    return worker;
  }
});

await server.start();
const desktop = client("desktop:test", "desktop", ["desktop-control"]);
const tui = client("tui:test", "tui");

try {
  await Promise.all([desktop.connect(), tui.connect()]);
  await desktop.request("catalog.registerProject", { project });
  const listed = await tui.request("catalog.list", {});
  assert.equal(listed.chats.length, 1);
  assert.equal(listed.chats[0].canonicalChatId, "chat:test");
  assert.equal(listed.chats[0].presence.state, "detached");
  const history = await desktop.request("catalog.history", { session: "chat:test", project });
  assert.equal(history.history.entries[0].message.content, "hello");
  const archived = await desktop.request("catalog.update", { session: "chat:test", archived: true });
  assert.equal(archived.chat.archived, true);
  assert.equal((await tui.request("catalog.list", {})).chats.length, 0, "archived chats must be hidden by default");
  const archivedList = await tui.request("catalog.list", { includeArchived: true });
  assert.equal(archivedList.chats.length, 1);
  assert.equal(archivedList.chats[0].archived, true);
  const restored = await desktop.request("catalog.update", { session: "chat:test", archived: false });
  assert.equal(restored.chat.archived, false);

  const desktopAttached = await desktop.attach({ project, cwd: project, session: "chat:test", localThreadId: "assistant-thread:desktop" });
  assert.equal(desktopAttached.canonicalChatId, "chat:test");
  const tuiAttached = await tui.attach({ project, cwd: project, session: "assistant-thread:desktop", localThreadId: "tui:local" });
  assert.equal(tuiAttached.canonicalChatId, "chat:test");
  assert.equal(workers.length, 1, "desktop and TUI must share one server worker");
  const attachedList = await desktop.request("catalog.list", {});
  assert.equal(attachedList.chats[0].presence.clients.length, 2);
  assert.deepEqual(new Set(attachedList.chats[0].presence.clients.map((entry) => entry.surface)), new Set(["desktop", "tui"]));
  const updated = await desktop.request("catalog.update", { session: "chat:test", title: "Editable shared title", project });
  assert.equal(updated.chat.title, "Editable shared title");
  assert.equal(updated.chat.sessionPath, sessionPath, "metadata edits must not move canonical transcript storage");

  const tuiEvents = [];
  tui.on("session-event:chat:test", (event) => tuiEvents.push(event));
  const promptResult = desktop.request("session.request", {
    sessionKey: "chat:test", type: "prompt", payload: { prompt: "keep building" },
    requestContext: { turnId: "turn:test", localThreadId: "assistant-thread:desktop" }
  }).catch((error) => ({ disconnected: error.code === "AGENT_SERVER_DISCONNECTED" }));
  await waitUntil(() => workers[0].activePrompt !== null);
  workers[0].emit("event", { type: "message_update", message: { role: "assistant", content: "still working" } });
  await waitUntil(() => tuiEvents.length === 1);
  desktop.close();
  assert.equal(server.state().sessions[0].activeRequests, 1, "closing Desktop must not stop active work");
  workers[0].finishPrompt({ completed: true });
  await waitUntil(() => server.state().sessions[0].activeRequests === 0);
  await promptResult;

  const spoofedAuthority = client("tui:spoofed-authority", "tui", ["desktop-control"]);
  await spoofedAuthority.connect();
  await spoofedAuthority.attach({ project, cwd: project, session: "chat:test", localThreadId: "tui:spoof" });
  workers[0].emit("control", { type: "control.request", requestId: "control:spoof", operation: { action: "observe" } });
  await waitUntil(() => workers[0].controlResponses.length === 1);
  assert.equal(workers[0].controlResponses[0].error.code, "CONTROL_DRIVER_UNAVAILABLE", "a TUI handshake cannot self-assert Desktop authority");
  spoofedAuthority.close();

  const reconnect = client("desktop:reconnect", "desktop", ["desktop-control"]);
  await reconnect.connect();
  const replay = await reconnect.attach({ project, cwd: project, session: "chat:test", localThreadId: "assistant-thread:reconnect", lastSequence: 0 });
  assert.equal(replay.replay.length, 3, "reconnect must replay metadata, provider events, and durable turn completion");
  assert.equal(replay.replay[0].event.type, "session_metadata");
  assert.equal(replay.replay[1].event.message.content, "still working");
  assert.equal(replay.replay[1].requestContext.turnId, "turn:test");
  assert.equal(replay.replay[2].event.type, "zyra_server_turn_completed");

  const tuiRuntime = await createZyraTuiClientRuntime({
    project,
    session: "chat:test",
    agentServer: { stateDirectory, channel, autoStart: false }
  });
  assert.equal(tuiRuntime.session.sessionManager.getSessionName(), "Editable shared title");
  assert.equal(tuiRuntime.history.events()[0].message.content[0].text, "hello");
  const remoteEvents = [];
  tuiRuntime.session.subscribe((event) => remoteEvents.push(event));
  const remotePrompt = tuiRuntime.session.prompt("continue from TUI");
  await waitUntil(() => workers[0].activePrompt !== null);
  workers[0].emit("event", { type: "message_end", message: { id: "assistant:tui", role: "assistant", content: "shared" } });
  workers[0].finishPrompt({});
  await remotePrompt;
  assert.equal(remoteEvents.at(-1).message.content, "shared");
  assert.equal(tuiRuntime.session.state.messages.at(-1).content, "shared");
  tuiRuntime.session.dispose();

  reconnect.setControlHandler(async (operation) => ({ accepted: operation.action === "observe" }));
  workers[0].emit("control", { type: "control.request", requestId: "control:1", operation: { action: "observe" } });
  await waitUntil(() => workers[0].controlResponses.length === 2);
  assert.deepEqual(workers[0].controlResponses[1].result, { accepted: true });

  await reconnect.detach("chat:test");
  reconnect.close();
  assert.equal(workers[0].disposed, false, "detaching a client must not immediately dispose the runtime");
  await tui.request("session.stop", { sessionKey: "chat:test", reason: "test complete" });
  assert.equal(workers[0].disposed, true, "explicit Stop must dispose the runtime");
  tui.close();
  process.stdout.write("zyra agent server tests passed\n");
} finally {
  desktop.close();
  tui.close();
  await server.stop("test cleanup");
  rmSync(stateDirectory, { recursive: true, force: true });
}

function client(clientId, surface, authorities = []) {
  return new ZyraAgentServerClient({
    root: path.resolve("."), stateDirectory, channel, autoStart: false, clientId, surface, authorities,
    authorityProof: surface === "desktop" && authorities.includes("desktop-control") ? "test-desktop-authority" : undefined
  });
}

async function waitUntil(predicate, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for test state.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
