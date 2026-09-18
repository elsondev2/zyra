import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { timelineWireFixture } from './fixtures/timeline-wire.mjs';
test('Android streaming fixture matches the current gateway projector and coalescer', () => {
  const fixture = timelineWireFixture();
  assert.equal(fixture.frames.length, 8);
  assert.deepEqual(fixture.frames[1].deltaLengths, [6, 2]);
  assert.equal(fixture.canonicalFrames[0].event.canonicalCommit, true);
  assert.equal(fixture.canonicalFrames[0].event.message.zyraCanonicalMessage.providerItemId, 'voice-provider');
  assert.deepEqual(fixture, JSON.parse(readFileSync(new URL('../../android/app/src/test/resources/gateway-timeline.json', import.meta.url), 'utf8')));
});
