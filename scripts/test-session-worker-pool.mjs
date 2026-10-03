import assert from 'node:assert/strict';
import { SessionWorkerPool } from '../src/agent-server/session-worker-pool.mjs';

const workers = [];
const pool = new SessionWorkerPool('/runtime', input => {
  let rejectPreparation;
  const worker = {
    input, alive: true, disposed: false,
    request(type) {
      assert.equal(type, 'prepare');
      return new Promise((_, reject) => { rejectPreparation = reject; });
    },
    isAlive() { return this.alive && !this.disposed; },
    dispose() { this.disposed = true; },
    fail() { rejectPreparation(new Error('Synthetic preparation failure')); }
  };
  workers.push(worker);
  return worker;
});
pool.prepare(); pool.prepare();
assert.equal(workers.length, 1, 'only one idle worker is prepared');
const claimed = pool.acquire({ root: '/runtime', cwd: '/project-one' });
assert.equal(claimed, workers[0], 'acquisition returns immediately while imports are pending');
assert.equal(workers.length, 1, 'claim does not start competing module imports during connection');
pool.prepare();
assert.equal(workers.length, 2, 'completed attachment can prepare one replacement');
claimed.fail(); await Promise.resolve();
assert.equal(claimed.disposed, false, 'late preparation failure cannot dispose a claimed chat');
workers[1].fail(); await Promise.resolve();
assert.equal(workers[1].disposed, true, 'failed idle preparation is retired');
assert.equal(pool.spare, null);
const fallback = pool.acquire({ root: '/runtime', cwd: '/project-two' });
assert.equal(fallback.input.cwd, '/project-two', 'cold fallback uses the requested project');
assert.equal(workers.length, 3);
pool.prepare();
assert.equal(workers.length, 4);
pool.dispose('test complete');
assert.equal(workers[3].disposed, true);
assert.equal(fallback.disposed, false, 'pool shutdown only owns its idle worker');
pool.prepare(); assert.equal(workers.length, 4, 'shutdown cannot respawn background workers');
console.log('Session worker preparation: immediate acquisition, bounded spare, failure recovery and ownership passed.');
