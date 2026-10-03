import { canRunAppShortcut } from '@shared/keybinding-context'
export { isProtectedShortcutTarget, isBrowserShortcutContext } from '@shared/keybinding-context'
import { useCallback, useEffect } from 'react'
import { addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import { useSettings } from './settings'
import { shortcutLabel, resolveShortcut, suspendShortcuts, isAppNavigationCommand, type AppNavigationCommand, type CommandId, type ShortcutInput, type ShortcutPlatform } from '@shared/keybindings'

declare global { interface Window { zyraKeybindings?: { setRecording(active: boolean): Promise<boolean>; command(id: CommandId): Promise<boolean>; onCommand(callback: (id: AppNavigationCommand) => void): () => void } } }
let recording = false
export function isShortcutRecording(): boolean { return recording }
export async function setShortcutRecording(active: boolean): Promise<void> {
    recording = active
    suspendShortcuts(active)
    try { await window.zyraKeybindings?.setRecording(active) }
    catch (error) { recording = false; suspendShortcuts(false); throw error }
}
export function shortcutPlatform(): ShortcutPlatform {
    return /mac|iphone|ipad|ipod/i.test(navigator.platform) ? 'darwin' : /win/i.test(navigator.platform) ? 'win32' : 'linux'
}
export function keyboardInput(event: KeyboardEvent): ShortcutInput {
    return { type: event.type, key: event.key, code: event.code, control: event.ctrlKey, meta: event.metaKey, alt: event.altKey, shift: event.shiftKey, isAutoRepeat: event.repeat, isComposing: event.isComposing || event.getModifierState?.('AltGraph') === true }
}
export function appShortcut(event: KeyboardEvent): CommandId | null {
    if (event.defaultPrevented || recording) return null
    const command = resolveShortcut(keyboardInput(event), shortcutPlatform(), 'app') || resolveShortcut(keyboardInput(event), shortcutPlatform(), 'shell')
    // Explicit Ctrl/Command+Alt navigation can leave an editor/terminal; ordinary
    // typing, clipboard, and terminal shortcuts remain local to that surface.
    if (!canRunAppShortcut(event, command)) return null
    return command
}
export function subscribeAppNavigationShortcuts(dispatch: (id: AppNavigationCommand) => void): () => void {
    return addOverlayEventListener('keydown', (event: KeyboardEvent) => {
        const id = appShortcut(event)
        if (!isAppNavigationCommand(id)) return
        event.preventDefault()
        event.stopPropagation()
        dispatch(id)
    }, true)
}
export function useNativeAppShortcuts(): void {
    useEffect(() => {
        if (!window.zyraKeybindings) return
        const removeNavigation = subscribeAppNavigationShortcuts(id => {
            void window.zyraKeybindings?.command(id).catch(error => console.warn('Navigation shortcut failed', error))
        })
        const removeCommands = addOverlayEventListener('keydown', (event: KeyboardEvent) => {
            const id = appShortcut(event)
            if (!id || id === 'app.loadingPreview') return
            event.preventDefault()
            void window.zyraKeybindings?.command(id).catch(error => console.warn('Shortcut failed', error))
        })
        return () => { removeNavigation(); removeCommands() }
    }, [])
}
export function useShortcutLabel() {
    const { settings } = useSettings()
    const platform = shortcutPlatform()
    return useCallback((id: CommandId) => shortcutLabel(id, platform, settings.keyboardShortcuts), [platform, settings.keyboardShortcuts])
}
