export type BrowserShortcutPlatform = 'darwin' | 'win32' | 'linux'

export type BrowserShortcutAction =
    | { type: 'new-tab' }
    | { type: 'close-tab' }
    | { type: 'reopen-closed-tab' }
    | { type: 'focus-address' }
    | { type: 'open-file' }
    | { type: 'reload'; bypassCache: boolean }
    | { type: 'next-tab' }
    | { type: 'previous-tab' }
    | { type: 'select-tab'; index: number | 'last' }
    | { type: 'back' }
    | { type: 'forward' }
    | { type: 'toggle-fullscreen' }

export function isBrowserShortcutAction(value: unknown): value is BrowserShortcutAction {
    if (!value || typeof value !== 'object') return false
    const action = value as Partial<BrowserShortcutAction>
    if (action.type === 'reload') return typeof action.bypassCache === 'boolean'
    if (action.type === 'select-tab') {
        return action.index === 'last' || (Number.isInteger(action.index) && Number(action.index) >= 0 && Number(action.index) <= 8)
    }
    return action.type === 'new-tab'
        || action.type === 'close-tab'
        || action.type === 'reopen-closed-tab'
        || action.type === 'focus-address'
        || action.type === 'open-file'
        || action.type === 'next-tab'
        || action.type === 'previous-tab'
        || action.type === 'back'
        || action.type === 'forward'
        || action.type === 'toggle-fullscreen'
}

export type BrowserShortcutInput = {
    type?: string
    key?: string
    control?: boolean
    meta?: boolean
    shift?: boolean
    alt?: boolean
}

function normalizedKey(input: BrowserShortcutInput): string {
    const key = String(input.key || '').trim().toLowerCase()
    if (key === 'arrowleft') return 'left'
    if (key === 'arrowright') return 'right'
    if (key === 'pageup') return 'page-up'
    if (key === 'pagedown') return 'page-down'
    return key
}

export function resolveBrowserShortcut(
    input: BrowserShortcutInput,
    platform: BrowserShortcutPlatform
): BrowserShortcutAction | null {
    if (input.type && input.type !== 'keyDown' && input.type !== 'keydown') return null
    const key = normalizedKey(input)
    const command = platform === 'darwin' ? Boolean(input.meta) : Boolean(input.control)
    const shift = Boolean(input.shift)
    const alt = Boolean(input.alt)

    if (!command && !alt && !shift && key === 'f11') return { type: 'toggle-fullscreen' }
    if (alt && !command && key === 'left') return { type: 'back' }
    if (alt && !command && key === 'right') return { type: 'forward' }
    if (platform === 'darwin' && command && !alt && key === '[') return { type: 'back' }
    if (platform === 'darwin' && command && !alt && key === ']') return { type: 'forward' }
    if (!command && !alt && key === 'f5') return { type: 'reload', bypassCache: shift }
    if (platform === 'darwin' && input.control && !input.meta && !alt && key === 'tab') {
        return shift ? { type: 'previous-tab' } : { type: 'next-tab' }
    }
    if (!command) return null

    if (!alt && key === 't') return shift ? { type: 'reopen-closed-tab' } : { type: 'new-tab' }
    if (!alt && !shift && key === 'w') return { type: 'close-tab' }
    if (!alt && !shift && key === 'l') return { type: 'focus-address' }
    if (!alt && !shift && key === 'o') return { type: 'open-file' }
    if (!alt && key === 'r') return { type: 'reload', bypassCache: shift }
    if (platform !== 'darwin' && !alt && key === 'tab') return shift ? { type: 'previous-tab' } : { type: 'next-tab' }
    if (!shift && key === 'page-down') return { type: 'next-tab' }
    if (!shift && key === 'page-up') return { type: 'previous-tab' }
    if (platform === 'darwin' && alt && !shift && key === 'right') return { type: 'next-tab' }
    if (platform === 'darwin' && alt && !shift && key === 'left') return { type: 'previous-tab' }
    if (!alt && !shift && /^[1-9]$/.test(key)) {
        return { type: 'select-tab', index: key === '9' ? 'last' : Number(key) - 1 }
    }
    return null
}
