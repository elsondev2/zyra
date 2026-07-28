import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { ZyraAgentServerClient } from "../src/agent-server/client.mjs";
import { ZyraAgentServer } from "../src/agent-server/server.mjs";

const root = path.resolve(import.meta.dirname, "..");
const temporary = mkdtempSync(path.join(os.tmpdir(), "zyra-agent-server-bridge-"));
const project = path.join(temporary, "project");
const stateDirectory = path.join(temporary, "state");
const channel = `bridge-${process.pid}-${Date.now()}`;
await import("node:fs/promises").then(({ mkdir }) => mkdir(project, { recursive: true }));
const server = new ZyraAgentServer({ root, stateDirectory, channel, idleTimeoutMs: 5_000 });
await server.start();
const desktop = client("desktop:bridge", "desktop");
const tui = client("tui:bridge", "tui");

try {
  await desktop.connect();
  const attached = await desktop.attach({
    project,
    cwd: project,
    localThreadId: "assistant-thread:bridge",
    model: "openai-codex/gpt-5.5",
    thinking: "low",
    profile: "default"
  });
  assert.match(attached.canonicalChatId, /.+/);
  assert.equal(typeof attached.connected.model, "string", "the real bridge must return its connected runtime metadata");
  await desktop.detach(attached.sessionKey);
  desktop.close();
  assert.equal(server.state().sessions.length, 1, "desktop detach must leave the bridge alive");

  await tui.connect();
  const reopened = await tui.attach({
    project,
    cwd: project,
    session: attached.canonicalChatId,
    localThreadId: "tui-thread:bridge"
  });
  assert.equal(reopened.canonicalChatId, attached.canonicalChatId, "TUI must reopen the desktop-created canonical chat");
  assert.equal(server.state().sessions.length, 1, "both surfaces must resolve to the same bridge worker");
  await tui.request("session.stop", { sessionKey: reopened.sessionKey, reason: "bridge test complete" });
  tui.close();
  process.stdout.write("zyra agent-server bridge tests passed\n");
} finally {
  desktop.close();
  tui.close();
  await server.stop("test cleanup");
  rmSync(temporary, { recursive: true, force: true });
}

function client(clientId, surface) {
  return new ZyraAgentServerClient({ root, stateDirectory, channel, autoStart: false, clientId, surface });
}
