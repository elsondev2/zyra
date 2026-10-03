import assert from 'node:assert/strict'
import { COMMANDS, bindingConflicts, configureShortcutOverrides, effectiveBindings, inputBinding, isAppNavigationCommand, normalizeBinding, resolveShortcut, sanitizeShortcutOverrides, shortcutAccelerator, shortcutLabel, suspendShortcuts, type ShortcutOverrides } from '../src/shared/keybindings'
import { resolveBrowserShortcut } from '../src/shared/browser-shortcuts'
import { canRunAppShortcut, isBrowserShortcutContext, isProtectedShortcutTarget } from '../src/shared/keybinding-context'

const ctrl = (key: string) => ({ type: 'keyDown', key, control: true })
assert.equal(new Set(COMMANDS.map(command => command.id)).size, COMMANDS.length)
for (const platform of ['darwin', 'win32', 'linux'] as const) {
    for (const command of COMMANDS) {
        assert.ok(effectiveBindings(command.id, platform).length, `${command.id} defaults parse`)
        for (const binding of effectiveBindings(command.id, platform)) assert.deepEqual(bindingConflicts(command.id, binding, platform), [], `${platform}: ${command.id} has no overlapping default conflicts`)
    }
}
assert.equal(resolveShortcut(ctrl('k'), 'win32', 'app'), 'app.search')
assert.equal(resolveShortcut({ ...ctrl('p'), shift: true }, 'win32', 'app'), 'app.search', 'command palette alternate binding')
assert.equal(resolveShortcut({ ...ctrl('/'), key: '/' }, 'win32', 'app'), 'app.shortcuts', 'shortcut settings discovery binding')
assert.equal(resolveShortcut({ ...ctrl('b'), key: 'b' }, 'win32', 'app'), 'app.sidebar', 'Codex-style sidebar binding')
assert.equal(resolveShortcut({ ...ctrl('['), key: '[', shift: true }, 'win32', 'app'), 'app.previousChat')
assert.equal(resolveShortcut({ ...ctrl(']'), key: ']', shift: true }, 'win32', 'app'), 'app.nextChat')
assert.equal(resolveShortcut({ ...ctrl('`'), key: '`' }, 'win32', 'app'), 'app.toggleTerminal')
assert.equal(resolveShortcut({ ...ctrl('.'), key: '.' }, 'win32', 'app'), 'app.stopTurn')
assert.equal(resolveShortcut({ key: 'k', meta: true }, 'darwin', 'app'), 'app.search')
assert.equal(resolveShortcut(ctrl('k'), 'darwin', 'app'), null)
assert.equal(resolveShortcut({ ...ctrl('k'), shift: true }, 'win32', 'app'), null, 'extra modifiers do not match')
assert.equal(resolveShortcut({ ...ctrl('k'), meta: true }, 'win32', 'app'), null)
assert.equal(resolveShortcut({ ...ctrl('k'), type: 'keyUp' }, 'win32', 'app'), null)
assert.equal(resolveShortcut({ ...ctrl('k'), isAutoRepeat: true }, 'win32', 'app'), null)
assert.equal(resolveShortcut({ ...ctrl('k'), isComposing: true }, 'win32', 'app'), null)
assert.equal(normalizeBinding('k', 'win32'), null, 'plain typing is not a command')
assert.equal(normalizeBinding('Shift+K', 'win32'), null)
assert.equal(normalizeBinding('Ctrl+Ctrl+K', 'win32'), null)
assert.equal(normalizeBinding('Ctrl+Escape', 'win32'), null, 'Escape remains recorder cancellation')
assert.equal(inputBinding({ ...ctrl('%'), code: 'Digit5', shift: true }), 'Ctrl+Shift+5')
assert.equal(resolveShortcut({ ...ctrl('%'), code: 'Digit5', shift: true }, 'win32', 'terminal'), 'terminal.splitHorizontal')
assert.equal(resolveShortcut({ key: '~', code: 'Backquote', meta: true, shift: true }, 'darwin', 'terminal'), 'terminal.new')
assert.equal(resolveShortcut({ ...ctrl('5'), code: 'Digit5', alt: true }, 'win32', 'terminal'), 'terminal.splitVertical')
assert.equal(resolveShortcut({ ...ctrl('W'), shift: true }, 'win32', 'terminal'), 'terminal.close')
assert.equal(resolveShortcut({ key: 'µ', code: 'KeyM', meta: true, alt: true }, 'darwin', 'app'), 'app.composer', 'Option-produced characters retain physical navigation binding')
assert.equal(resolveShortcut({ key: '™', code: 'Digit2', meta: true, alt: true }, 'darwin', 'app'), 'app.files')
for (const [key, id] of [['d', 'app.threadDetails'], ['6', 'app.resources'], ['7', 'app.agents']] as const) {
    const input = { ...ctrl(key), alt: true }
    assert.equal(resolveShortcut(input, 'win32', 'app'), id, `${id} resolves from its visible shortcut`)
    assert.equal(isAppNavigationCommand(id), true, `${id} crosses the native keybinding dispatch bridge`)
}
assert.deepEqual(bindingConflicts('app.reload', 'Alt+ArrowLeft', 'win32'), ['navigation.back'], 'shell and navigation overlap')
assert.deepEqual(resolveBrowserShortcut({ key: 'F12' }, 'win32'), { type: 'devtools' })
assert.equal(resolveShortcut(ctrl('r'), 'win32', 'shell'), 'app.reload')
assert.deepEqual(resolveBrowserShortcut(ctrl('r'), 'win32'), { type: 'reload', bypassCache: false })
assert.equal(resolveShortcut(ctrl('r'), 'win32', 'terminal'), null)
assert.deepEqual(bindingConflicts('terminal.new', 'Mod+T', 'win32'), [], 'disjoint contexts can reuse keys')
assert.deepEqual(bindingConflicts('app.search', 'Mod+T', 'win32'), ['browser.newTab'], 'app commands overlap Browser')
const changed: ShortcutOverrides = { 'app.search': ['Mod+Alt+Q'], 'browser.reload': ['Mod+Shift+Y'], 'browser.closeTab': [] }
assert.equal(resolveShortcut(ctrl('k'), 'win32', 'app', changed), null)
assert.equal(resolveShortcut({ ...ctrl('q'), alt: true }, 'win32', 'app', changed), 'app.search')
assert.equal(resolveBrowserShortcut(ctrl('r'), 'win32', changed), null)
assert.equal(resolveBrowserShortcut({ key: 'F5' }, 'win32', changed), null, 'override replaces every default alias')
assert.equal(resolveBrowserShortcut(ctrl('w'), 'win32', changed), null)
assert.deepEqual(resolveBrowserShortcut({ ...ctrl('y'), shift: true }, 'win32', changed), { type: 'reload', bypassCache: false })
assert.equal(shortcutLabel('app.search', 'win32', changed), 'Ctrl+Alt+Q')
assert.equal(shortcutLabel('app.search', 'darwin', changed), '⌘⌥Q')
assert.equal(shortcutLabel('browser.closeTab', 'win32', changed), '')
const ambiguous: ShortcutOverrides = { 'app.search': ['Mod+T'] }
assert.equal(resolveShortcut(ctrl('t'), 'win32', 'app', ambiguous), null)
assert.equal(resolveBrowserShortcut(ctrl('t'), 'win32', ambiguous), null)
assert.deepEqual(sanitizeShortcutOverrides({ unknown: ['Ctrl+K'], 'app.search': ['k'], 'browser.closeTab': [], 'app.settings': null }), { 'browser.closeTab': [] })
assert.deepEqual(sanitizeShortcutOverrides(JSON.parse('{"__proto__":{},"app.search":["Ctrl+J"]}')), { 'app.search': ['Ctrl+J'] })
let live: ShortcutOverrides = changed
configureShortcutOverrides(() => live)
assert.equal(resolveShortcut({ ...ctrl('q'), alt: true }, 'win32', 'app'), 'app.search')
assert.equal(shortcutAccelerator('app.search', 'darwin'), 'Command+Alt+q')
live = {}
assert.equal(resolveShortcut(ctrl('k'), 'win32', 'app'), 'app.search', 'reset takes effect without remount')
suspendShortcuts(true)
assert.equal(resolveShortcut(ctrl('k'), 'win32', 'app'), null)
assert.equal(resolveBrowserShortcut(ctrl('t'), 'win32'), null, 'recording protects capture-phase Browser handlers')
suspendShortcuts(false)
const event = (matches: string[], key = 'k') => ({ key, ctrlKey: true, metaKey: false, altKey: false, composedPath: () => [{ closest: (selector: string) => matches.some(value => selector.includes(value)) ? {} : null }] } as unknown as KeyboardEvent)
assert.equal(isProtectedShortcutTarget(event(['.xterm'])), true)
assert.equal(canRunAppShortcut(event(['.xterm'], 'c'), 'app.search'), false)
assert.equal(canRunAppShortcut(event(['.xterm']), 'app.files'), false, 'ordinary control gestures stay with terminal')
assert.equal(canRunAppShortcut({ ...event(['.xterm']), altKey: true }, 'app.files'), true, 'explicit navigation can leave terminal')
assert.equal(canRunAppShortcut({ ...event(['.monaco-editor']), altKey: true }, 'app.composer'), true, 'explicit navigation can leave editor')
assert.equal(canRunAppShortcut(event(['.monaco-editor'], 's'), 'app.saveFile'), true, 'save is allowed from Monaco')
assert.equal(canRunAppShortcut(event(['.monaco-editor'], 'app.search'), 'app.search'), false, 'ordinary app commands stay out of Monaco')
assert.equal(isProtectedShortcutTarget(event(['.monaco-editor'])), true)
for (const [key, id] of [['d', 'app.threadDetails'], ['6', 'app.resources'], ['7', 'app.agents']] as const) {
    assert.equal(canRunAppShortcut({ ...event(['.xterm'], key), altKey: true }, id), true, `${id} remains available while chat or terminal input is focused`)
}
assert.equal(isProtectedShortcutTarget(event(['[data-keybinding-recording]'])), true)
assert.equal(isProtectedShortcutTarget(event(['input'], 'c')), true)
assert.equal(isProtectedShortcutTarget(event(['input'], 'k')), false)
assert.equal(isBrowserShortcutContext(event(['textarea'])), false, 'Browser does not steal composer input')
assert.equal(isBrowserShortcutContext(event(['input', '[data-shortcut-scope="browser"]'])), true)
console.log('Keybinding registry, defaults, overrides, context, recording and labels: ok')
