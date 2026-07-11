/**
 * Zyra - Electron Toolkit Utils Shim
 * Provides utilities for Electron development
 */

import { app } from 'electron'

export const electronApp = {
    setAppUserModelId: (id: string) => {
        if (process.platform === 'win32') {
            app.setAppUserModelId(id)
        }
    }
}

export const is = {
    dev: !app.isPackaged,
    prod: app.isPackaged
}
