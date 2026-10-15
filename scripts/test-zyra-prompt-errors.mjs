import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { runZyraPrintPrompt, runZyraPrompt, queueZyraMidRunInput, setProfile } from "../src/zyra-sdk.mjs";
import { convertToLlm } from '../src/runtime/engine/src/core/messages.js';

function createRuntime(finalMessage) {
  const entries = [];
  const session = {
    state: { messages: [] },
    agent: { state: { systemPrompt: "" } },
    sessionManager: {
      getEntries: () => entries,
      getSessionId: () => undefined,
      getSessionFile: () => undefined,
    },
    async prompt(text, options) {
      this.observedPrompt = text;
      this.observedPromptOptions = options;
      this.observedSystemPrompt = this.agent.state.systemPrompt;
      this.state.messages.push(finalMessage);
      entries.push({ type: "message", message: finalMessage });
    },
  };
  return { project: process.cwd(), session };
}

function createClientRuntime(project) {
  let systemPrompt = "";
  return {
    project,
    session: {
      state: { messages: [] },
      agent: {
        getSystemPrompt: () => systemPrompt,
        setSystemPrompt: (value) => { systemPrompt = String(value || ""); },
      },
      sessionManager: {
        getEntries: () => [],
        getSessionId: () => undefined,
        getSessionFile: () => undefined,
      },
    },
    get systemPrompt() { return systemPrompt; },
  };
}

const tempProject = mkdtempSync(path.join(os.tmpdir(), "zyra-client-runtime-"));
try {
  const clientRuntime = createClientRuntime(tempProject);
  for (const legacyProfile of ["default", "learner", "builder"]) {
    assert.equal(setProfile(clientRuntime, legacyProfile), "concise", 'legacy built-in profiles resolve to the current default speaking style');
  }
  assert.match(clientRuntime.systemPrompt, /ZYRA_ACTIVE_PROFILE/);
} finally {
  rmSync(tempProject, { recursive: true, force: true });
}

const usageLimitMessage = {
  role: "assistant",
  content: [],
  stopReason: "error",
  errorMessage: "Codex error: The usage limit has been reached",
};

await assert.rejects(
  runZyraPrompt(createRuntime(usageLimitMessage), "hello"),
  /Codex error: The usage limit has been reached/,
);

await assert.rejects(
  runZyraPrompt(createRuntime({ role: "assistant", content: [], stopReason: "aborted" }), "hello"),
  /Request aborted/,
);

await assert.doesNotReject(
  runZyraPrompt(createRuntime({ role: "assistant", content: [{ type: "text", text: "ok" }], stopReason: "stop" }), "hello"),
);

assert.equal(
  await runZyraPrintPrompt(
    createRuntime({ role: "assistant", content: [{ type: "text", text: "print ok" }], stopReason: "stop" }),
    "hello",
  ),
  "print ok",
);

console.log("Zyra prompt error propagation checks passed.");

const worktreeRuntime = createRuntime({ role: 'assistant', content: [{ type: 'text', text: 'ok' }], stopReason: 'stop' });
await runZyraPrompt(worktreeRuntime, 'Fix the selected file.', { startInNewWorktree: true });
assert.equal(worktreeRuntime.session.observedPrompt, 'Fix the selected file.', 'The setup preference does not alter the visible user prompt');
assert.match(worktreeRuntime.session.observedSystemPrompt, /ZYRA_NEW_WORKTREE/);
assert.match(worktreeRuntime.session.observedSystemPrompt, /create a new isolated Git worktree/);
assert.doesNotMatch(worktreeRuntime.session.agent.state.systemPrompt, /ZYRA_NEW_WORKTREE/, 'Setup context is removed after the turn');
await runZyraPrompt(worktreeRuntime, 'Continue.');
assert.doesNotMatch(worktreeRuntime.session.observedSystemPrompt, /ZYRA_NEW_WORKTREE/, 'Later prompts cannot inherit the setup request');
const failedWorktreeRuntime = createRuntime(usageLimitMessage);
await assert.rejects(runZyraPrompt(failedWorktreeRuntime, 'Fix it.', { startInNewWorktree: true }), /usage limit/);
assert.doesNotMatch(failedWorktreeRuntime.session.agent.state.systemPrompt, /ZYRA_NEW_WORKTREE/, 'A failed turn also clears the temporary request');
await assert.rejects(runZyraPrompt(worktreeRuntime, 'Fix it.', { startInNewWorktree: 'yes' }), /Invalid worktree choice/);
console.log('Hidden worktree setup context, original prompt, later prompts and failure cleanup passed.');

const skillFixture = mkdtempSync(path.join(os.tmpdir(), 'zyra-skill-context-'));
try {
  const skillPath = path.join(skillFixture, 'SKILL.md');
  writeFileSync(skillPath, '# Fixture skill\n\nSynthetic skill instructions for this test.');
  const skillRuntime = createRuntime({ role: 'assistant', content: [{ type: 'text', text: 'ok' }], stopReason: 'stop' });
  const skillMessages = [];
  skillRuntime.resourceLoader = { getSkills: () => ({ skills: [{ name: 'fixture-skill', filePath: skillPath }] }) };
  skillRuntime.session.sendCustomMessage = async (message, options) => {
    skillMessages.push({ ...message, options });
    skillRuntime.session.state.messages.push({ role: 'custom', timestamp: Date.now(), ...message });
  };
  await runZyraPrompt(skillRuntime, '/skill:fixture-skill whats this for?');
  assert.equal(skillRuntime.session.observedPrompt, '/skill:fixture-skill whats this for?', 'The user prompt remains the visible prompt; skill instructions are not a second user message');
  assert.equal(skillMessages.length, 1);
  assert.equal(skillMessages[0].display, false);
  assert.equal(skillMessages[0].options.triggerTurn, false, 'Loading skill context cannot start its own turn');
  assert.match(skillMessages[0].content, /Synthetic skill instructions/);
  assert.equal(skillRuntime.session.observedPromptOptions.expandPromptTemplates, false, 'The native SDK cannot expand the visible reference again');
  assert.match(convertToLlm(skillRuntime.session.state.messages)[0].content[0].text, /Synthetic skill instructions/, 'Hidden skill context still reaches the actual model-message transformer');
  await runZyraPrintPrompt(skillRuntime, '/skill:fixture-skill describe it');
  assert.equal(skillRuntime.session.observedPrompt, '/skill:fixture-skill describe it', 'Print prompts retain the same context boundary');
  assert.equal(skillMessages.length, 2);
  skillRuntime.session.isStreaming = true;
  for (const mode of ['steer', 'queue']) {
    assert.equal(await queueZyraMidRunInput(skillRuntime, '/skill:fixture-skill continue', { mode }), mode);
    const delivery = mode === 'queue' ? 'followUp' : 'steer';
    assert.equal(skillMessages.at(-1).options.deliverAs, delivery);
    assert.equal(skillRuntime.session.observedPrompt, '/skill:fixture-skill continue');
    assert.equal(skillRuntime.session.observedPromptOptions.streamingBehavior, delivery);
    assert.equal(skillRuntime.session.observedPromptOptions.expandPromptTemplates, false);
  }
} finally {
  rmSync(skillFixture, { recursive: true, force: true });
}
console.log('Explicit skills use hidden model context and preserve the visible user prompt.');
