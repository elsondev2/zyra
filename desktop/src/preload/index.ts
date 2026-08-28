/**
 * Zyra - Preload Entry
 */

import { contextBridge } from 'electron'
import { createDevScopeElectronAdapter } from './devscope-electron-adapter'
import { installBrowserDevscopeRelay } from './browser-devscope-relay'
import { installRendererDiagnostics } from './renderer-diagnostics'
import { installBrowserPopupPreload } from './browser-popup'
import { BROWSER_POPUP_PRELOAD_ARGUMENT } from '../shared/preload-surfaces'
import { installDesktopAnalytics } from './analytics'

if (process.argv.includes(BROWSER_POPUP_PRELOAD_ARGUMENT)) {
    installBrowserPopupPreload()
} else {
    installRendererDiagnostics()
    installDesktopAnalytics()
    const devscope = createDevScopeElectronAdapter()
    installBrowserDevscopeRelay(devscope)

    contextBridge.exposeInMainWorld('devscope', devscope)
}
