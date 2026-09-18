import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TerminalScreen } from '../src/terminal-screen.mjs';
test('terminal snapshots retain screen, colors and cursor without replaying truncated output', async () => {
  const screen = new TerminalScreen(80, 24), restored = new TerminalScreen(80, 24);
  try {
    screen.write('old text\r\n'); screen.write('\x1b[2J\x1b[H\x1b[31mhello\x1b[0m\x1b[3;7Hworld');
    const snapshot = await screen.snapshot(); assert.equal(snapshot.sequence, 2);
    restored.write(snapshot.data); await restored.snapshot();
    const original = screen.terminal.buffer.active, copy = restored.terminal.buffer.active;
    assert.equal(copy.cursorX, original.cursorX); assert.equal(copy.cursorY, original.cursorY);
    assert.equal(copy.getLine(0).translateToString(true), original.getLine(0).translateToString(true));
    assert.equal(copy.getLine(0).getCell(0).getFgColor(), original.getLine(0).getCell(0).getFgColor());
    screen.write('\x1b[?1049h\x1b[Hfullscreen');
    const alternate = await screen.snapshot();
    restored.write(alternate.data); await restored.snapshot();
    assert.equal(restored.terminal.buffer.active.type, 'alternate');
    assert.ok(restored.terminal.buffer.active.getLine(0).translateToString(true).includes('fullscreen'));
  } finally { screen.dispose(); restored.dispose(); }
});

test('snapshot cancellation rejects instead of leaving a request open after shell removal', async () => {
  const screen = new TerminalScreen();
  screen.write('pending'); const snapshot = screen.snapshot(); screen.dispose();
  await assert.rejects(snapshot, /closed/);
});
test('resizing is ordered after queued output and before its snapshot', async () => {
  const screen = new TerminalScreen(80, 24);
  try {
    screen.write('x'.repeat(90)); screen.resize(100, 28);
    const snapshot = await screen.snapshot();
    assert.equal(snapshot.cols, 100); assert.equal(snapshot.rows, 28);
    assert.equal(snapshot.sequence, 1);
  } finally { screen.dispose(); }
});
