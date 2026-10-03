import { contextBridge, ipcRenderer } from 'electron'
import { KEYBINDING_COMMAND_CHANNEL, KEYBINDING_RECORDING_CHANNEL, KEYBINDING_DISPATCH_CHANNEL, isAppNavigationCommand, type AppNavigationCommand } from '../shared/keybindings'
/** Trusted UI only; never installed into Browser guest pages. */
export function installKeybindingBridge(): void {
    const listeners = new Set<(id: AppNavigationCommand) => void>()
    let pending: AppNavigationCommand | null = null
    ipcRenderer.on(KEYBINDING_DISPATCH_CHANNEL, (_event, id: unknown) => {
        if (!isAppNavigationCommand(id)) return
        if (!listeners.size) { pending = id; return }
        for (const listener of listeners) listener(id)
    })
    contextBridge.exposeInMainWorld('zyraKeybindings', {
        setRecording: (active: boolean) => ipcRenderer.invoke(KEYBINDING_RECORDING_CHANNEL, active === true),
        command: (id: string) => ipcRenderer.invoke(KEYBINDING_COMMAND_CHANNEL, id),
        onCommand: (callback: (id: AppNavigationCommand) => void) => {
            listeners.add(callback)
            if (pending) { const id = pending; pending = null; callback(id) }
            return () => { listeners.delete(callback) }
        }
    })
}
