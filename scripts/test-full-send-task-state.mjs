import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const project = mkdtempSync(path.join(os.tmpdir(), 'full-send-task-'));
const script = fileURLToPath(new URL('../skills/full-send/scripts/task-state.mjs', import.meta.url));
const run = args => spawnSync(process.execPath, [script, ...args, '--project', project], { encoding: 'utf8', windowsHide: true });
try {
  const initialized = run(['init', '--title', 'Fixture task', '--criterion', 'Actual scenario works', '--constraint', 'No foreground']);
  assert.equal(initialized.status, 0, initialized.stderr);
  const { id } = JSON.parse(initialized.stdout);
  assert.notEqual(run(['finish', id, '--summary', 'Premature']).status, 0, 'cannot finish without proof');
  assert.notEqual(run(['checkpoint', id, '--verified', '1']).status, 0, 'cannot mark verified without evidence');
  assert.equal(run(['checkpoint', id, '--verified', '1', '--evidence', 'Fixture check passed', '--pending', 'Live account gate']).status, 0);
  assert.notEqual(run(['finish', id, '--summary', 'Still pending']).status, 0);
  const restored = JSON.parse(run(['show', id]).stdout);
  assert.equal(restored.criteria[0].verified, true);
  assert.equal(restored.pending[0], 'Live account gate');
  assert.equal(restored.constraints[0], 'No foreground');
  assert.equal(run(['checkpoint', id, '--clear-pending', '--note', 'Live gate verified']).status, 0);
  assert.equal(run(['finish', id, '--summary', 'Verified result']).status, 0);
  assert.equal(JSON.parse(run(['show', id]).stdout).status, 'complete');
  assert.notEqual(run(['show', '../escape']).status, 0, 'task IDs cannot escape their directory');
  console.log('PASS Full Send: durable checkpoints, evidence requirement, pending gates and completion checks');
} finally { rmSync(project, { recursive: true, force: true }); }
