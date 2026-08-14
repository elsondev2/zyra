import { BrowserWindow, dialog } from 'electron'
import log from 'electron-log'
import {
    downloadGoogleFont,
    importManagedFontFile,
    listManagedFonts,
    listSystemFonts,
    readManagedFont,
    removeManagedFont
} from '../../services/font-manager'

export async function handleListManagedFonts() {
    try {
        return { success: true, fonts: await listManagedFonts() }
    } catch (error) {
        log.error('Failed to list managed fonts:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to list managed fonts.' }
    }
}

export async function handleListSystemFonts() {
    try {
        return { success: true, fonts: await listSystemFonts() }
    } catch (error) {
        log.error('Failed to list system fonts:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to list installed fonts.' }
    }
}

export async function handleDownloadGoogleFont(_event: Electron.IpcMainInvokeEvent, family: string) {
    try {
        return { success: true, font: await downloadGoogleFont(family) }
    } catch (error) {
        log.error('Failed to download Google Font:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to download Google Font.' }
    }
}

export async function handleImportFontFile(event: Electron.IpcMainInvokeEvent) {
    try {
        const window = BrowserWindow.fromWebContents(event.sender)
        const options: Electron.OpenDialogOptions = {
            title: 'Import font into Zyra',
            properties: ['openFile'],
            filters: [
                { name: 'Font files', extensions: ['ttf', 'otf', 'woff', 'woff2'] },
                { name: 'All files', extensions: ['*'] }
            ]
        }
        const result = window
            ? await dialog.showOpenDialog(window, options)
            : await dialog.showOpenDialog(options)
        if (result.canceled || result.filePaths.length === 0) return { success: true, cancelled: true }
        return { success: true, font: await importManagedFontFile(result.filePaths[0]) }
    } catch (error) {
        log.error('Failed to import font:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to import font.' }
    }
}

export async function handleRemoveManagedFont(_event: Electron.IpcMainInvokeEvent, fontId: string) {
    try {
        return { success: true, removed: await removeManagedFont(String(fontId || '')) }
    } catch (error) {
        log.error('Failed to remove managed font:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to remove managed font.' }
    }
}

export async function handleReadManagedFont(_event: Electron.IpcMainInvokeEvent, fontId: string) {
    try {
        return { success: true, ...await readManagedFont(String(fontId || '')) }
    } catch (error) {
        log.error('Failed to read managed font:', error)
        return { success: false, error: error instanceof Error ? error.message : 'Failed to read managed font.' }
    }
}
