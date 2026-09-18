import { ipcRenderer } from 'electron'
import { createAppMenuCommandQueue } from '../../shared/app-menu-commands'
import type { DevScopeAppMenuCommand, DevScopeWindowRuntimeInfo } from '../../shared/contracts/devscope-api'

export function createWindowAdapter() {
    const commands = createAppMenuCommandQueue()
    ipcRenderer.on('window:app-menu-command', (_event, command: unknown) => commands.push(command))
    return {
        openDesktopSettings: () => ipcRenderer.invoke('desktop:open-settings'),
        window: {
            minimize: () => ipcRenderer.send('window:minimize'),
            maximize: () => ipcRenderer.send('window:maximize'),
            close: () => ipcRenderer.send('window:close'),
            setFullScreen: (enabled: boolean) => ipcRenderer.send('window:setFullScreen', enabled === true),
            isFullScreen: () => ipcRenderer.invoke('window:isFullScreen') as Promise<boolean>,
            isMaximized: () => ipcRenderer.invoke('window:isMaximized') as Promise<boolean>,
            getRuntimeInfo: () => ipcRenderer.invoke('window:getRuntimeInfo') as Promise<DevScopeWindowRuntimeInfo>,
            getTerminalCommandStatus: () => ipcRenderer.invoke('window:getTerminalCommandStatus'),
            installTerminalCommand: () => ipcRenderer.invoke('window:installTerminalCommand'),
            removeTerminalCommand: () => ipcRenderer.invoke('window:removeTerminalCommand'),
            onMaximizedChange: (callback: (maximized: boolean) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, maximized: unknown) => {
                    callback(maximized === true)
                }
                ipcRenderer.on('window:maximized-changed', listener)
                return () => ipcRenderer.removeListener('window:maximized-changed', listener)
            },
            onFullScreenChange: (callback: (fullscreen: boolean) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, fullscreen: unknown) => callback(fullscreen === true)
                ipcRenderer.on('window:fullscreen-changed', listener)
                return () => ipcRenderer.removeListener('window:fullscreen-changed', listener)
            },
            onAppMenuCommand: (callback: (command: DevScopeAppMenuCommand) => void) => commands.subscribe(callback)
        }
    }
}
