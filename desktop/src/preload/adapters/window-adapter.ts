import { ipcRenderer } from 'electron'
import type { DevScopeAppMenuCommand, DevScopeWindowRuntimeInfo } from '../../shared/contracts/devscope-api'

export function createWindowAdapter() {
    return {
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
            onAppMenuCommand: (callback: (command: DevScopeAppMenuCommand) => void) => {
                const listener = (_event: Electron.IpcRendererEvent, command: unknown) => {
                    if (command === 'new-chat' || command === 'search' || command === 'settings' || command === 'reload' || command === 'about') {
                        callback(command)
                    }
                }
                ipcRenderer.on('window:app-menu-command', listener)
                return () => ipcRenderer.removeListener('window:app-menu-command', listener)
            }
        }
    }
}
