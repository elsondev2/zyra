import type { WebContents } from 'electron'
import { ipcMain } from './ipc/trusted-ipc'
import { KEYBINDING_COMMAND_CHANNEL, KEYBINDING_RECORDING_CHANNEL, isManagedShortcutInput, isAppNavigationCommand, resolveShortcut, type AppNavigationCommand, type CommandId, type ShortcutInput, type ShortcutPlatform } from '../shared/keybindings'
type AppMenuCommand = 'search' | 'new-chat' | 'settings' | 'reload'
const recording = new Map<number, () => void>()
let dispatchAppCommand: (command: AppMenuCommand) => void = () => {}
let dispatchNavigation: (command: AppNavigationCommand) => void = () => {}
const appCommands: Partial<Record<CommandId, AppMenuCommand>> = { 'app.search': 'search', 'app.newChat': 'new-chat', 'app.settings': 'settings', 'app.reload': 'reload' }
function toggleDevTools(contents: WebContents): void {
    if (contents.isDevToolsOpened()) contents.closeDevTools()
    else contents.openDevTools({ mode: 'detach' })
}
export function registerKeybindingRecording(dispatch: (command: AppMenuCommand) => void, navigate: (command: AppNavigationCommand) => void): void {
    dispatchAppCommand = dispatch
    dispatchNavigation = navigate
    ipcMain.handle(KEYBINDING_COMMAND_CHANNEL, (event, id: unknown) => {
        if (isRecordingShortcut(event.sender)) return false
        if (isAppNavigationCommand(id)) { dispatchNavigation(id); return true }
        if (id === 'app.devtools') { toggleDevTools(event.sender); return true }
        const command = typeof id === 'string' && Object.prototype.hasOwnProperty.call(appCommands, id) ? appCommands[id as CommandId] : undefined
        if (!command) return false
        if (command === 'reload') event.sender.reload()
        else dispatchAppCommand(command)
        return true
    })
    ipcMain.handle(KEYBINDING_RECORDING_CHANNEL, (event, active: unknown) => {
        const id = event.sender.id
        if (active === true) {
            if (!recording.has(id)) {
                const cleanup = () => { recording.delete(id); event.sender.removeListener('destroyed', cleanup); event.sender.removeListener('did-start-loading', cleanup) }
                recording.set(id, cleanup)
                event.sender.once('destroyed', cleanup)
                event.sender.once('did-start-loading', cleanup)
            }
        } else recording.get(id)?.()
        return true
    })
}
export function isRecordingShortcut(contents: WebContents): boolean { return recording.has(contents.id) }
/** Menu accelerators are labels; managed keys reach the renderer's context-aware dispatcher. */
export function prepareAppShortcutInput(contents: WebContents, input: ShortcutInput, owner = contents): void {
    const platform = process.platform as ShortcutPlatform
    contents.setIgnoreMenuShortcuts(isRecordingShortcut(owner) || isManagedShortcutInput(input, platform))
}
/** Guest pages cannot call privileged IPC. Dispatch only main-resolved configured commands. */
export function handleGuestAppShortcut(input: ShortcutInput, owner: WebContents): boolean {
    if (isRecordingShortcut(owner)) return false
    const id = resolveShortcut(input, process.platform as ShortcutPlatform, 'app')
    if (isAppNavigationCommand(id)) { dispatchNavigation(id); return true }
    if (id === 'app.devtools') { toggleDevTools(owner); return true }
    const command = id ? appCommands[id] : undefined
    if (!command) return false
    if (command === 'reload') owner.reload()
    else dispatchAppCommand(command)
    return true
}
