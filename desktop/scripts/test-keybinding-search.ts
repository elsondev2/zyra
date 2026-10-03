import assert from 'node:assert/strict'
import { COMMANDS, inputBinding, type ShortcutOverrides } from '../src/shared/keybindings'
import { shortcutMatchesSearch } from '../src/renderer/src/pages/settings/keyboard-shortcut-search'

const matches = (query: string, pressed: string | null = null, overrides: ShortcutOverrides = {}, platform: 'win32' | 'darwin' = 'win32') => COMMANDS.filter(command => shortcutMatchesSearch(command, query, platform, overrides, pressed)).map(command => command.id)
assert.ok(matches('command palette').includes('app.search'))
assert.ok(matches('control k').includes('app.search'))
assert.ok(matches('cmd k', null, {}, 'darwin').includes('app.search'))
assert.deepEqual(matches('', 'Ctrl+K'), ['app.search'])
assert.deepEqual(matches('', 'Ctrl+Shift+K'), ['terminal.clear'])
assert.deepEqual(matches('', 'Ctrl+K', { 'app.search': ['Ctrl+J'] }), [], 'recorded search ignores replaced defaults')
assert.deepEqual(matches('', 'Ctrl+K', { 'app.search': [] }), [], 'recorded search ignores cleared defaults')
assert.ok(matches('', 'Ctrl+J', { 'app.search': ['Ctrl+J'] }).includes('app.search'))
assert.deepEqual(matches('', 'Meta+K', {}, 'darwin'), ['app.search'])
assert.ok(matches('', 'Ctrl+R').includes('browser.reload'))
assert.ok(matches('', 'Ctrl+R').includes('app.reload'), 'shows bindings in each applicable context')
assert.deepEqual(matches('', inputBinding({ key: '%', code: 'Digit5', control: true, shift: true })), ['terminal.splitHorizontal'])
assert.deepEqual(matches('', 'Ctrl+,'), ['app.settings'], 'punctuation stays distinct')
console.log('Shortcut text and recorded-key search: ok')
