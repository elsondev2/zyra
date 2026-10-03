import { isAppNavigationCommand, type CommandId } from './keybindings'
/** Structural checks work for events from native portal documents (different realms). */
type KeyEvent = Pick<KeyboardEvent, 'composedPath' | 'key' | 'ctrlKey' | 'metaKey' | 'altKey'>
function inPath(event: KeyEvent, selector: string): boolean {
    return event.composedPath().some(target => typeof (target as Element)?.closest === 'function' && Boolean((target as Element).closest(selector)))
}
const EDITABLE = 'input, textarea, [contenteditable="true"], [role="textbox"]'
export function isProtectedShortcutTarget(event: KeyEvent): boolean {
    if (inPath(event, '.monaco-editor, .xterm, [data-keybinding-recording]')) return true
    // Keep familiar selection, clipboard, undo and word-editing gestures local.
    return inPath(event, EDITABLE) && (event.ctrlKey || event.metaKey) && /^(?:a|c|v|x|z|y|backspace|delete|home|end|arrowleft|arrowright|arrowup|arrowdown)$/i.test(event.key)
}
const MONACO_LOCAL_COMMANDS: readonly CommandId[] = ['app.saveFile']

export function canRunAppShortcut(event: KeyEvent, command: CommandId | null): boolean {
    if (!command) return false
    if (!isProtectedShortcutTarget(event)) return true
    if (isAppNavigationCommand(command) && event.altKey && (event.ctrlKey || event.metaKey)) return true
    return MONACO_LOCAL_COMMANDS.includes(command) && inPath(event, '.monaco-editor')
}
export function isBrowserShortcutContext(event: KeyEvent): boolean {
    return !isProtectedShortcutTarget(event) && (!inPath(event, EDITABLE) || inPath(event, '[data-shortcut-scope="browser"]'))
}
