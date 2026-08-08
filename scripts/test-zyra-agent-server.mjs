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
import { syncZyraThinkingLevel } from "../src/zyra-sdk.mjs";

class FakeWorker extends EventEmitter {
  constructor() {
    super();
    this.activePrompt = null;
    this.controlResponses = [];
    this.requests = [];
    this.disposed = false;
  }
  isAlive() { return !this.disposed; }
  request(type, payload = {}) {
    this.requests.push({ type, payload });
    if (type === "connect") return Promise.resolve({ threadId: "chat:test", providerThreadId: sessionPath, events: [] });
    if (type === "prompt") return new Promise((resolve) => { this.activePrompt = resolve; });
    if (type === "abort") return Promise.resolve({ aborted: true });
    if (type === "approval.respond") {
      this.emit("event", { type: "approval_resolved", requestId: payload.requestId, decision: payload.decision });
      return Promise.resolve({ ok: true });
    }
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
durableJournal.append({
  sequence: 2,
  occurredAt: new Date().toISOString(),
  event: {
    type: "message_update",
    message: { id: "assistant:streaming", role: "assistant", content: "transient snapshot" },
    assistantMessageEvent: { type: "text_delta", delta: "snapshot" }
  }
});
const reopenedDurableJournal = new AgentEventJournal(path.join(stateDirectory, "journal-test"), "chat:journal");
assert.equal(reopenedDurableJournal.replay(0).length, 1, "token-level message updates must stay live-only instead of synchronously hitting the durable journal");
assert.equal(reopenedDurableJournal.latestSequence(), 1, "transient stream updates must not advance durable replay state");

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
  const runningCatalog = await tui.request("catalog.list", {});
  assert.equal(runningCatalog.chats[0].presence.state, "running", "catalog presence must expose unopened work as running");
  assert.equal(runningCatalog.chats[0].presence.latestTurn?.id, "turn:test", "catalog presence must identify the active canonical turn");
  assert.equal(runningCatalog.chats[0].presence.latestTurn?.state, "running", "catalog presence must expose the active turn state");
  workers[0].emit("event", { type: "message_update", message: { role: "assistant", content: "still working" } });
  await waitUntil(() => tuiEvents.length === 1);
  workers[0].emit("event", { type: "approval_requested", requestId: "approval:test", requestType: "command", command: "npm test" });
  await waitUntil(() => tuiEvents.some((entry) => entry.event?.type === "approval_requested"));
  assert.equal((await tui.request("catalog.list", {})).chats[0].presence.attention, "approval", "catalog presence must expose approval attention before Desktop opens the thread");
  await tui.request("session.request", {
    sessionKey: "chat:test",
    type: "approval.respond",
    payload: { requestId: "approval:test", decision: "acceptOnce" }
  });
  assert.deepEqual(workers[0].requests.at(-1), {
    type: "approval.respond",
    payload: { requestId: "approval:test", decision: "acceptOnce" }
  }, "an attached surface should resolve a canonical approval while the prompt remains active");
  await waitUntil(() => tuiEvents.some((entry) => entry.event?.type === "approval_resolved"));
  assert.equal((await tui.request("catalog.list", {})).chats[0].presence.attention, null, "catalog presence must clear resolved approval attention");
  desktop.close();
  assert.equal(server.state().sessions[0].activeRequests, 1, "closing Desktop must not stop active work");
  workers[0].finishPrompt({ completed: true });
  await waitUntil(() => server.state().sessions[0].activeRequests === 0);
  await promptResult;
  const completedCatalog = await tui.request("catalog.list", {});
  assert.equal(completedCatalog.chats[0].presence.state, "ready", "catalog presence must return to ready after canonical work completes");
  assert.equal(completedCatalog.chats[0].presence.latestTurn?.id, "turn:test", "catalog presence must retain the completed turn identity");
  assert.equal(completedCatalog.chats[0].presence.latestTurn?.state, "completed", "catalog presence must expose completion without opening the thread");

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
  assert.equal(replay.replay.length, 5, "reconnect must replay metadata, provider events, approvals, and durable turn completion");
  assert.equal(replay.replay[0].event.type, "session_metadata");
  assert.equal(replay.replay[1].event.message.content, "still working");
  assert.equal(replay.replay[1].requestContext.turnId, "turn:test");
  assert.equal(replay.replay[2].event.type, "approval_requested");
  assert.equal(replay.replay[3].event.type, "approval_resolved");
  assert.equal(replay.replay[4].event.type, "zyra_server_turn_completed");

  const tuiRuntime = await createZyraTuiClientRuntime({
    project,
    session: "chat:test",
    model: "openai-codex/gpt-5.6-sol",
    thinking: "max",
    agentServer: { stateDirectory, channel, autoStart: false }
  });
  assert.equal(tuiRuntime.session.sessionManager.getSessionName(), "Editable shared title");
  assert.equal(tuiRuntime.session.thinkingLevel, "max", "an explicit resumed-chat max setting must outrank the first client's stale config")
  assert.equal(tuiRuntime.session.getAvailableThinkingLevels().includes("max"), true)
  assert.equal(
    workers[0].requests.some((entry) => entry.type === "configure" && entry.payload.thinking === "max"),
    true,
    "a later TUI attachment must synchronize its explicit max setting to the shared worker"
  );
  assert.equal(tuiRuntime.history.events()[0].message.content[0].text, "hello");
  const remoteEvents = [];
  tuiRuntime.session.subscribe((event) => remoteEvents.push(event));

  let approvalResolutionSignal;
  let resolveApprovalDialog;
  tuiRuntime.agentServer.setApprovalHandler((_request, options) => {
    approvalResolutionSignal = options.signal;
    return new Promise((resolve) => {
      resolveApprovalDialog = resolve;
      options.signal.addEventListener("abort", () => resolve("decline"), { once: true });
    });
  });
  const externalPrompt = reconnect.request("session.request", {
    sessionKey: "chat:test", type: "prompt", payload: { prompt: "external work" },
    requestContext: { turnId: "turn:external", localThreadId: "assistant-thread:external" }
  });
  await waitUntil(() => workers[0].activePrompt !== null);
  workers[0].emit("event", { type: "approval_requested", requestId: "approval:external", requestType: "command", command: "bun test" });
  await waitUntil(() => approvalResolutionSignal);
  assert.equal(tuiRuntime.session.isStreaming, true, "remote TUI running state must follow another surface's active turn");
  await reconnect.request("session.request", {
    sessionKey: "chat:test", type: "approval.respond",
    payload: { requestId: "approval:external", decision: "acceptOnce" }
  });
  await waitUntil(() => approvalResolutionSignal.aborted);
  assert.equal(approvalResolutionSignal.aborted, true, "an external approval resolution must cancel the mounted TUI prompt");
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(
    workers[0].requests.filter((entry) => entry.type === "approval.respond" && entry.payload.requestId === "approval:external").length,
    1,
    "the cancelled TUI dialog must not submit a second approval decision"
  );
  workers[0].emit("event", {
    type: "message_end",
    message: {
      id: "assistant:external",
      role: "assistant",
      content: "external complete",
      usage: { input: 900, output: 100, cacheRead: 0, cacheWrite: 0, totalTokens: 1000, cost: { total: 0.05 } }
    }
  });
  workers[0].finishPrompt({});
  await externalPrompt;
  await waitUntil(() => !tuiRuntime.session.isStreaming);
  assert.equal(tuiRuntime.session.getContextUsage().tokens, 1000, "remote context status must use canonical model usage");
  assert.equal(tuiRuntime.session.sessionManager.getEntries().at(-1).message.usage.cost.total, 0.05, "remote cost status must retain usage cost");
  assert.equal(tuiRuntime.session.sessionManager.getSessionUsage().cost.total, 0.05, "remote status must expose cumulative canonical cost");
  resolveApprovalDialog?.("decline");

  tuiRuntime.session.setThinkingLevel("high");
  await waitUntil(() => workers[0].requests.some((entry) => entry.type === "configure" && entry.payload.thinking === "high"));
  const maxConfigureCount = workers[0].requests.filter((entry) => entry.type === "configure" && entry.payload.thinking === "max").length;
  assert.equal(syncZyraThinkingLevel(tuiRuntime, "max"), "max");
  await waitUntil(() => workers[0].requests.filter((entry) => entry.type === "configure" && entry.payload.thinking === "max").length > maxConfigureCount);
  assert.equal(tuiRuntime.session.thinkingLevel, "max", "remote synchronization must not down-convert max to xhigh");
  const pendingSteer = tuiRuntime.session.steer("redirect from TUI");
  const pendingFollowUp = tuiRuntime.session.followUp("continue after this turn");
  assert.deepEqual(tuiRuntime.session.getSteeringMessages(), ["redirect from TUI"]);
  assert.deepEqual(tuiRuntime.session.getFollowUpMessages(), ["continue after this turn"]);
  assert.deepEqual(tuiRuntime.session.clearQueue(), {
    steering: ["redirect from TUI"],
    followUp: ["continue after this turn"]
  }, "remote clearQueue must return queued text for Stop/Escape restoration");
  await Promise.all([pendingSteer, pendingFollowUp]);
  const remotePrompt = tuiRuntime.session.prompt("continue from TUI");
  await waitUntil(() => workers[0].activePrompt !== null);
  assert.equal(
    workers[0].requests.findLast((entry) => entry.type === "prompt")?.payload.thinking,
    "max",
    "the actual resumed-chat prompt must request max instead of xhigh"
  );
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
