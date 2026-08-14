/**
 * Zyra - Preload Entry
 */

import { contextBridge } from 'electron'
import { createDevScopeElectronAdapter } from './devscope-electron-adapter'
import { installBrowserDevscopeRelay } from './browser-devscope-relay'
import type { DevScopeApi } from '../shared/contracts/devscope-api'

const devscope = createDevScopeElectronAdapter()
installBrowserDevscopeRelay(devscope)

contextBridge.exposeInMainWorld('devscope', devscope)

declare global {
    interface Window {
        devscope: DevScopeApi
    }
}
