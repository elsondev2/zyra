import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { SessionManager as PiSessionManager } from "../src/runtime/engine/src/index.js";
import { ZyraSessionManager } from "../src/agent-server/zyra-session-manager.mjs";

const fixture = mkdtempSync(path.join(os.tmpdir(), "zyra-session-manager-"));
const project = path.join(fixture, "project");
const sessions = path.join(project, ".zyra", "sessions");
mkdirSync(sessions, { recursive: true });

function userMessage(text) {
  return { role: "user", content: [{ type: "text", text }], timestamp: Date.now() };
}

function assistantMessage(text) {
  return {
    role: "assistant",
    content: [{ type: "text", text }],
    provider: "test-provider",
    model: "test-model",
    timestamp: Date.now(),
  };
}

try {
  const manager = ZyraSessionManager.create(project, sessions, { id: "zyra_session_manager_test" });
  const firstMessageId = manager.appendMessage(userMessage("first prompt"));
  manager.appendThinkingLevelChange("low");
  manager.appendModelChange("test-provider", "test-model");
  manager.appendMessage(assistantMessage("first answer"));
  manager.appendCustomEntry("zyra-test", { enabled: true });
  manager.appendCustomMessageEntry("zyra-test-context", "extra context", false, { source: "test" });
  manager.appendLabelChange(firstMessageId, "keep");
  manager.appendSessionInfo("Session title");

  assert.equal(manager.getSessionName(), "Session title");
  assert.equal(manager.getLabel(firstMessageId), "keep");
  const file = manager.getSessionFile();
  assert.ok(file);
  const reopened = ZyraSessionManager.open(file, sessions);
  const piView = PiSessionManager.open(file, sessions);
  assert.deepEqual(reopened.buildSessionContext(), piView.buildSessionContext());
  assert.deepEqual(reopened.getBranch(), piView.getBranch());
  assert.equal(reopened.getTree()[0].label, piView.getTree()[0].label);

  reopened.branch(firstMessageId);
  const branchMessageId = reopened.appendMessage(userMessage("alternate prompt"));
  assert.equal(reopened.getBranch().at(-1).id, branchMessageId);
  assert.equal(reopened.getBranch().length, 2);
  const branchFile = reopened.createBranchedSession(branchMessageId);
  assert.ok(branchFile);
  const branchManager = ZyraSessionManager.open(branchFile, sessions);
  const branchPiView = PiSessionManager.open(branchFile, sessions);
  assert.equal(branchManager.getHeader().parentSession, file);
  assert.deepEqual(branchManager.buildSessionContext(), branchPiView.buildSessionContext());
  assert.equal(branchManager.getLabel(firstMessageId), "keep");

  const listed = await ZyraSessionManager.list(project, sessions);
  assert.ok(listed.some((session) => session.id === manager.getSessionId()));
  assert.equal(listed.find((session) => session.id === manager.getSessionId()).name, "Session title");

  const inMemory = ZyraSessionManager.inMemory(project);
  inMemory.appendMessage(userMessage("memory only"));
  assert.equal(inMemory.getSessionFile(), undefined);
  assert.equal(inMemory.buildSessionContext().messages.length, 1);

  const selectedDirectory = path.join(fixture, "selected-outside-project-sessions");
  mkdirSync(selectedDirectory);
  const selectedSource = ZyraSessionManager.create(project, selectedDirectory, { id: "selected_session" });
  selectedSource.appendMessage(userMessage("selected path"));
  const selected = ZyraSessionManager.open(selectedSource.getSessionFile(), sessions);
  assert.equal(selected.getSessionDir(), sessions);
  assert.equal(selected.getSessionFileDirectory(), selectedDirectory);
  selected.appendMessage(userMessage("continued selected path"));
  assert.equal(selected.getEntries().length, 2);

  const legacyDirectory = path.join(fixture, "legacy");
  mkdirSync(legacyDirectory);
  const legacyFile = path.join(legacyDirectory, "legacy.jsonl");
  const legacyHeader = { type: "session", id: "legacy_session", timestamp: new Date().toISOString(), cwd: project, version: 1 };
  const legacyEntries = [
    { type: "message", timestamp: new Date().toISOString(), message: { role: "user", content: [{ type: "text", text: "legacy question" }] } },
    { type: "message", timestamp: new Date().toISOString(), message: { role: "hookMessage", content: [{ type: "text", text: "legacy hook" }] } },
  ];
  writeFileSync(legacyFile, `${[legacyHeader, ...legacyEntries].map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");
  const migrated = ZyraSessionManager.open(legacyFile, legacyDirectory);
  assert.equal(migrated.getHeader().version, 3);
  assert.ok(migrated.getEntries().every((entry) => typeof entry.id === "string" && entry.parentId !== undefined));
  assert.equal(migrated.getEntries()[1].message.role, "custom");
  assert.equal(JSON.parse(readFileSync(legacyFile, "utf8").split(/\r?\n/)[0]).version, 3);
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log("Zyra-owned session manager interoperability: ok");
