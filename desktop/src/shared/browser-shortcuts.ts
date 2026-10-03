import { COMMANDS, resolveShortcut, type ShortcutOverrides } from './keybindings'
export type BrowserShortcutPlatform = 'darwin' | 'win32' | 'linux'
export type BrowserShortcutAction =
    | { type: 'new-tab' } | { type: 'close-tab' } | { type: 'reopen-closed-tab' }
    | { type: 'focus-address' } | { type: 'open-file' }
    | { type: 'reload'; bypassCache: boolean }
    | { type: 'next-tab' } | { type: 'previous-tab' }
    | { type: 'select-tab'; index: number | 'last' }
    | { type: 'back' } | { type: 'forward' } | { type: 'toggle-fullscreen' } | { type: 'devtools' }
export function isBrowserShortcutAction(value: unknown): value is BrowserShortcutAction {
    if (!value || typeof value !== 'object') return false
    const action = value as Partial<BrowserShortcutAction>
    if (action.type === 'reload') return typeof action.bypassCache === 'boolean'
    if (action.type === 'select-tab') return action.index === 'last' || (Number.isInteger(action.index) && Number(action.index) >= 0 && Number(action.index) <= 8)
    return ['new-tab', 'close-tab', 'reopen-closed-tab', 'focus-address', 'open-file', 'next-tab', 'previous-tab', 'back', 'forward', 'toggle-fullscreen', 'devtools'].includes(String(action.type))
}
export type BrowserShortcutInput = import('./keybindings').ShortcutInput
export function resolveBrowserShortcut(input: BrowserShortcutInput, platform: BrowserShortcutPlatform, overrides?: ShortcutOverrides): BrowserShortcutAction | null {
    const id = resolveShortcut(input, platform, 'browser', overrides)
    const command = COMMANDS.find(command => command.id === id)
    return command && 'action' in command ? command.action : null
}
