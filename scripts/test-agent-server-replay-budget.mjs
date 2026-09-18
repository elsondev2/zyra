import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentEventJournal } from '../src/agent-server/event-journal.mjs';
const dir = mkdtempSync(path.join(os.tmpdir(), 'zyra-replay-budget-'));
try {
  const journal = new AgentEventJournal(dir, 'synthetic:budget');
  const content = 'x'.repeat(600000);
  for (let sequence = 1; sequence <= 16; sequence++) journal.append({ sequence, event: { type: 'message_end', message: { role: 'assistant', content } } });
  assert.ok(statSync(journal.file).size <= 8 * 1024 * 1024, 'compacting must enforce the journal byte budget as well as the event count');
  const restored = new AgentEventJournal(dir, 'synthetic:budget');
  assert.equal(restored.latestSequence(), 16);
  assert.ok(restored.replay(0).length < 16);
  console.log('Replay journal byte budget and sequence recovery: passed');
} finally { rmSync(dir, { recursive: true, force: true }); }
