import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CanonicalChatCatalog } from "../src/agent-server/catalog.mjs";
import { CanonicalChatIndex } from "../src/agent-server/chat-index.mjs";
import { getProjectSessionsDir } from "../src/zyra-sdk.mjs";

const root = mkdtempSync(path.join(os.tmpdir(), "zyra-chat-index-test-"));
const project = path.join(root, "project");
const reassignedProject = path.join(root, "reassigned-project");
const stateDirectory = path.join(root, "state");
const sessionsDirectory = getProjectSessionsDir(project);
const sessionPath = path.join(sessionsDirectory, "canonical.jsonl");
mkdirSync(sessionsDirectory, { recursive: true });
mkdirSync(reassignedProject, { recursive: true });

const lines = [
  { type: "session", id: "canonical:test", timestamp: "2026-07-01T00:00:00.000Z", cwd: project },
  {
    type: "message", id: "entry:user", timestamp: "2026-07-01T00:00:01.000Z",
    message: {
      id: "message:user", role: "user", timestamp: Date.parse("2026-07-01T00:00:01.000Z"),
      content: [{ type: "text", text: "Preserve every canonical event" }, { type: "image", mimeType: "image/png", data: "aGVsbG8=" }]
    }
  },
  {
    type: "message", id: "entry:assistant", timestamp: "2026-07-01T00:00:02.000Z",
    message: {
      id: "message:assistant", role: "assistant", timestamp: Date.parse("2026-07-01T00:00:02.000Z"),
      content: [
        { type: "thinking", thinking: "Check the source." },
        { type: "toolCall", id: "tool:1", name: "read", arguments: { path: "file.ts" } }
      ]
    }
  },
  {
    type: "message", id: "entry:tool", timestamp: "2026-07-01T00:00:03.000Z",
    message: {
      id: "message:tool", role: "toolResult", toolCallId: "tool:1", toolName: "read", isError: false,
      timestamp: Date.parse("2026-07-01T00:00:03.000Z"), content: [{ type: "text", text: "file contents" }]
    }
  }
];
writeFileSync(sessionPath, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`);

try {
  const index = new CanonicalChatIndex({ stateDirectory });
  const first = await index.listProjects([project]);
  assert.equal(first.length, 1);
  assert.equal(first[0].canonicalChatId, "canonical:test");
  assert.equal(first[0].displayMessageCount, 2);
  assert.equal(first[0].toolCallCount, 1);
  assert.equal(first[0].imageCount, 1);

  const latest = index.history("canonical:test", { limit: 1 });
  assert.equal(latest.entries[0].message.role, "toolResult");
  assert.equal(latest.pageInfo.startCursor, "2");
  assert.equal(latest.pageInfo.hasOlder, true);
  const older = index.history("canonical:test", { before: latest.pageInfo.oldestCursor, limit: 2 });
  assert.equal(older.entries[0].message.role, "user");
  assert.equal(older.entries[1].message.content[1].type, "toolCall");

  appendFileSync(sessionPath, `${JSON.stringify({
    type: "message", id: "entry:error", timestamp: "2026-07-01T00:00:04.000Z",
    message: { id: "message:error", role: "assistant", stopReason: "error", errorMessage: "provider failed", content: [] }
  })}\n`);
  const appended = await index.listProjects([project]);
  assert.equal(appended[0].messageCount, 4);
  assert.equal(appended[0].errorCount, 1);

  const catalog = new CanonicalChatCatalog({ stateDirectory });
  catalog.registerProject(project);
  const beforeUpdate = await catalog.list({ allProjects: true });
  assert.equal(beforeUpdate[0].title, "Preserve every canonical event");
  await catalog.updateChat("canonical:test", { title: "Canonical parity", project: reassignedProject });
  const afterUpdate = await catalog.find("canonical:test", { allProjects: true });
  assert.equal(afterUpdate.title, "Canonical parity");
  assert.equal(afterUpdate.project, path.resolve(reassignedProject));
  assert.equal(afterUpdate.sessionPath, path.resolve(sessionPath), "metadata changes must not move transcript storage");

  process.stdout.write("zyra incremental chat index tests passed\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
