import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pointsPath } from './lucide-points.mjs';
test('Lucide terminal chevron and polygon coordinates form complete path pairs', () => {
  assert.equal(pointsPath('4 17 10 11 4 5'), 'M4,17L10,11L4,5');
  assert.equal(pointsPath('4,17 10,11 4,5', true), 'M4,17L10,11L4,5Z');
  assert.throws(() => pointsPath('4 17 10'));
  assert.throws(() => pointsPath('4 nope 10 11'));
});
