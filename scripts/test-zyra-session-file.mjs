import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendCanonicalMessage, findCanonicalMessageReceipt } from "../src/agent-server/canonical-message-ledger.mjs";
import { ZyraSessionFileManager } from "../src/agent-server/zyra-session-file.mjs";

const fixture = mkdtempSync(path.join(os.tmpdir(), "zyra-session-file-"));
const sessions = path.join(fixture, "sessions");
mkdirSync(sessions);
const sessionFile = path.join(sessions, "chat.jsonl");
const now = "2026-09-23T10:00:00.000Z";
const header = { type: "session", version: 3, id: "session_native_1", timestamp: now, cwd: fixture };
const entries = [
  { type: "message", id: "entry_user_1", parentId: null, timestamp: now, message: { role: "user", content: [{ type: "text", text: "old user" }] } },
  { type: "message", id: "entry_assistant_1", parentId: "entry_user_1", timestamp: now, message: { role: "assistant", content: [{ type: "text", text: "old assistant" }] } },
];
writeFileSync(sessionFile, `${[header, ...entries].map((entry) => JSON.stringify(entry)).join("\n")}\n`, "utf8");

function input(sequence) {
  return {
    operationId: `operation_${sequence}`,
    idempotencyKey: `voice:${sequence}`,
    conversationId: "conversation_native_1",
    messageId: `voice_user_${sequence}`,
    role: "user",
    producer: "user",
    modality: "voice",
    text: `spoken ${sequence}`,
    attachmentIds: [],
    providerItemId: `provider_${sequence}`,
    providerCompletedAt: now,
    payloadSha256: String(sequence).repeat(64),
    routeClaim: { foregroundRouteId: "route_native_1", routeEpoch: sequence, ownerClaimId: `claim_${sequence}` },
  };
}

try {
  const firstManager = ZyraSessionFileManager.open(sessionFile, sessions);
  const secondManager = ZyraSessionFileManager.open(sessionFile, sessions);
  assert.equal(firstManager.getHeader().id, header.id);
  assert.equal(firstManager.getEntries().length, 2);

  const firstReceipt = appendCanonicalMessage(firstManager, input(1));
  assert.equal(firstReceipt.canonicalSequence, 3);
  assert.match(firstReceipt.receiptId, /^zyra_entry_/);
  assert.equal(firstManager.getEntries()[2].parentId, "entry_assistant_1");

  const secondReceipt = appendCanonicalMessage(secondManager, input(2));
  assert.equal(secondReceipt.canonicalSequence, 4);
  assert.equal(secondManager.getEntries()[3].parentId, firstManager.getEntries()[2].id);
  assert.deepEqual(findCanonicalMessageReceipt(secondManager, "operation_1"), firstReceipt);
  assert.deepEqual(appendCanonicalMessage(secondManager, input(1)), firstReceipt);

  const stored = readFileSync(sessionFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(stored.length, 5);
  assert.equal(stored[0].type, "session");
  assert.equal(stored.at(-1).message.zyraCanonicalMessage.operationId, "operation_2");

  const outsideDirectory = path.join(fixture, "outside");
  mkdirSync(outsideDirectory);
  const outsideFile = path.join(outsideDirectory, "chat.jsonl");
  appendFileSync(outsideFile, "not a session");
  assert.throws(() => ZyraSessionFileManager.open(outsideFile, sessions), /inside its project session folder/);

  const { SessionManager } = await import("../src/runtime/engine/src/index.js");
  const compatible = SessionManager.open(sessionFile, sessions);
  assert.equal(compatible.getEntries().length, 4);
  assert.equal(compatible.getEntries().at(-1).message.zyraCanonicalMessage.operationId, "operation_2");

  const deferredSessions = path.join(fixture, "deferred-sessions");
  mkdirSync(deferredSessions);
  const deferredManager = SessionManager.create(fixture, deferredSessions, { id: "session_deferred_voice" });
  const deferredFile = deferredManager.getSessionFile();
  assert.equal(existsSync(deferredFile), false);
  const deferredReceipt = appendCanonicalMessage(deferredManager, input(3));
  assert.equal(deferredReceipt.canonicalSequence, 1);
  assert.equal(existsSync(deferredFile), true);
  assert.equal(deferredManager.getEntries().length, 1);
  assert.equal(deferredManager.getEntries()[0].message.zyraCanonicalMessage.operationId, "operation_3");

  deferredManager.appendMessage({ role: "assistant", content: [] });
  const deferredRecords = readFileSync(deferredFile, "utf8").trim().split(/\r?\n/).map((line) => JSON.parse(line));
  assert.equal(deferredRecords.length, 3);
  assert.equal(deferredRecords.at(-1).message.role, "assistant");
} finally {
  rmSync(fixture, { recursive: true, force: true });
}

console.log("Zyra native session-file append and legacy-format interop: ok");
