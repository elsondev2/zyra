import assert from "node:assert/strict";
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { CanonicalChatCatalog } from "../src/agent-server/catalog.mjs";
import { CanonicalChatIndex } from "../src/agent-server/chat-index.mjs";
import { MAX_EAGER_HISTORY_TOOL_RESULT_BYTES, projectLoadedHistoryEntries } from "../src/agent-server/history-bodies.mjs";
import { getProjectSessionsDir } from "../src/zyra-sdk.mjs";

const root = mkdtempSync(path.join(os.tmpdir(), "zyra-chat-index-test-"));
const project = path.join(root, "project");
const reassignedProject = path.join(root, "reassigned-project");
const stateDirectory = path.join(root, "state");
const sessionsDirectory = getProjectSessionsDir(project);
const sessionPath = path.join(sessionsDirectory, "canonical.jsonl");
mkdirSync(sessionsDirectory, { recursive: true });
mkdirSync(reassignedProject, { recursive: true });

const oversizedRecent = projectLoadedHistoryEntries([{
  type: "message",
  id: "entry:oversized-recent",
  message: {
    role: "toolResult",
    toolCallId: "tool:oversized-recent",
    toolName: "read",
    content: [{ type: "text", text: "x".repeat(MAX_EAGER_HISTORY_TOOL_RESULT_BYTES + 1) }]
  }
}], 0, { toolResultBodies: "lazy-v1", canonicalChatId: "canonical:oversized" });
assert.ok(oversizedRecent[0].historyBodyRef, "a recent body larger than the eager byte budget remains on demand");
assert.ok(JSON.stringify(oversizedRecent).length < 2_000, "oversized recent bodies cannot overflow the history response");

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

  const historicalToolEntries = [];
  for (let indexValue = 0; indexValue < 20; indexValue += 1) {
    const toolCallId = `tool:bulk:${indexValue}`;
    const toolName = indexValue === 0 ? "edit" : "read";
    historicalToolEntries.push({
      type: "message", id: `entry:bulk-assistant:${indexValue}`, timestamp: `2026-07-01T00:01:${String(indexValue).padStart(2, "0")}.000Z`,
      message: {
        id: `message:bulk-assistant:${indexValue}`, role: "assistant",
        content: [{ type: "toolCall", id: toolCallId, name: toolName, arguments: { path: `fixture-${indexValue}.txt` } }]
      }
    }, {
      type: "message", id: `entry:bulk-tool:${indexValue}`, timestamp: `2026-07-01T00:02:${String(indexValue).padStart(2, "0")}.000Z`,
      message: {
        id: `message:bulk-tool:${indexValue}`, role: "toolResult", toolCallId, toolName, isError: false,
        content: [
          { type: "text", text: `output-${indexValue}:${"x".repeat(10_000)}` },
          ...([0, 19].includes(indexValue) ? [{ type: "image", data: `fixture-image-${indexValue}`, mimeType: "image/png" }] : [])
        ]
      }
    });
  }
  appendFileSync(sessionPath, `${historicalToolEntries.map((entry) => JSON.stringify(entry)).join("\n")}\n`);
  await index.listProjects([project]);
  const eagerHistory = index.history("canonical:test", { limit: 100 });
  const lazyHistory = index.history("canonical:test", { limit: 100, toolResultBodies: "lazy-v1" });
  const deferredEntries = lazyHistory.entries.filter((entry) => entry.historyBodyRef);
  assert.equal(deferredEntries.length, 6, "only the latest 15 of 21 tool results should keep eager bodies");
  assert.equal("content" in deferredEntries[0].message, false, "deferred history must distinguish an omitted body from a canonical empty result");
  assert.equal(deferredEntries.some((entry) => entry.historyBodyRef.toolName === "edit"), true, "old mutation results follow the same lazy-body policy");
  const deferredImageEntry = deferredEntries.find((entry) => entry.id === "entry:bulk-tool:0");
  assert.equal(deferredImageEntry.historyBodyRef.imageCount, 1, "deferred references preserve image metadata without embedding image bytes");
  assert.deepEqual(deferredImageEntry.historyBodyRef.contentTypes, ["text", "image"]);
  const eagerImageEntry = lazyHistory.entries.find((entry) => entry.id === "entry:bulk-tool:19");
  assert.equal(eagerImageEntry.message.content[1].data, "fixture-image-19", "the newest 15 tool results remain complete, including images");
  const pairedLatest = index.history("canonical:test", { limit: 1, toolResultBodies: "lazy-v1" });
  assert.deepEqual(pairedLatest.entries.map((entry) => entry.id), ["entry:bulk-assistant:19", "entry:bulk-tool:19"], "lazy pages keep a boundary tool result paired with its assistant tool call");
  const newestPage = index.history("canonical:test", { limit: 30, toolResultBodies: "lazy-v1" });
  const olderPage = index.history("canonical:test", { before: newestPage.pageInfo.oldestCursor, limit: 30, toolResultBodies: "lazy-v1" });
  assert.equal(olderPage.entries.filter((entry) => entry.message?.role === "toolResult").every((entry) => entry.historyBodyRef), true, "older pages do not create another eager-output window");
  assert.ok(JSON.stringify(lazyHistory).length < JSON.stringify(eagerHistory).length * 0.8, "deferred history must avoid transporting old tool outputs");
  const sidecar = readFileSync(path.join(stateDirectory, "chat-index-v3.json"), "utf8");
  assert.equal(sidecar.includes("output-0:"), false, "the rebuildable sidecar must never duplicate canonical output bodies");
  const hydrated = index.entryBody("canonical:test", deferredEntries[0].historyBodyRef);
  assert.match(hydrated.entry.message.content[0].text, /^file contents$|^output-/, "an indexed body reference must hydrate the exact canonical entry");
  const hydratedImage = index.entryBody("canonical:test", deferredImageEntry.historyBodyRef);
  assert.equal(hydratedImage.entry.message.content[1].data, "fixture-image-0", "on-demand hydration preserves canonical image bodies exactly");
  assert.equal((await index.searchToolResults("canonical:test", "fixture-image-0")).length, 0, "deferred search skips image payload bytes");
  assert.throws(
    () => index.entryBody("canonical:test", { ...deferredEntries[0].historyBodyRef, entryId: "wrong-entry" }),
    /does not match|stale/,
    "body hydration must reject stale or forged entry references"
  );
  assert.throws(
    () => index.entryBody("canonical:test", { ...deferredEntries[0].historyBodyRef, entrySha256: "0".repeat(64) }),
    /stale/,
    "body hydration must bind the reference to the exact canonical line"
  );

  process.stdout.write("zyra incremental chat index tests passed\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
