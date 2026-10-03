import assert from 'node:assert/strict';
import { createPlatformClipboard } from '../src/runtime/engine/src/utils/platform-clipboard.js';
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
for (const platform of ['win32', 'darwin', 'linux']) {
  const calls = [];
  const clipboard = createPlatformClipboard({ platform, env: platform === 'linux' ? { WAYLAND_DISPLAY: 'fixture' } : {}, execute: async (command, args, input) => {
    calls.push({ command, args, input });
    if (input !== undefined) return Buffer.alloc(0);
    if (command === 'powershell.exe' && args.at(-1).includes('ContainsImage') || command === 'osascript') return Buffer.from(png.toString('base64'));
    if (args.includes('image/png')) return png;
    return Buffer.from('Fixture clipboard text.');
  } });
  assert.equal(await clipboard.getText(), 'Fixture clipboard text.');
  const text = '" $secret `name`\nUnicode: é 🦉';
  await clipboard.setText(text);
  assert.equal(calls.at(-1).input, text, 'Clipboard text is stdin, never interpolated shell code.');
  assert.equal(calls.at(-1).args.join(' ').includes(text), false);
  assert.equal(await clipboard.hasImage(), true);
  assert.deepEqual(await clipboard.getImageBinary(), png);
}
const absent = createPlatformClipboard({ platform: 'linux', env: {}, execute: async () => { throw new Error('No display'); } });
assert.equal(await absent.hasImage(), false);
const fallback = [];
const x11 = createPlatformClipboard({ platform: 'linux', env: { WAYLAND_DISPLAY: 'fixture' }, execute: async command => { fallback.push(command); if (command === 'wl-paste') throw Error('Unavailable'); return Buffer.from('X11'); } });
assert.equal(await x11.getText(), 'X11');
assert.deepEqual(fallback, ['wl-paste', 'xclip']);
console.log('Owned clipboard: Windows, macOS, Wayland, X11 fallback, absent display and shell-safe text: ok');
