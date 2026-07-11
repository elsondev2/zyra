/**
 * Zyra - Preload Entry
 */

import { contextBridge } from 'electron'
import { createDevScopeElectronAdapter } from './devscope-electron-adapter'
import type { DevScopeApi } from '../shared/contracts/devscope-api'

const devscope = createDevScopeElectronAdapter()

contextBridge.exposeInMainWorld('devscope', devscope)

declare global {
    interface Window {
        devscope: DevScopeApi
    }
}
