import { clipboard, BrowserWindow, dialog, shell } from 'electron'
import { spawn } from 'child_process'
import { stat } from 'fs/promises'
import { homedir } from 'os'
import log from 'electron-log'
import { devscopeCore } from '../../core/devscope-core'
import { getInstalledIdes, launchProjectInIde } from '../../inspectors/system/windows-ides'
import type { ScanProjectsResult } from '../../services/project-discovery-service'

export async function handleSelectFolder(event: Electron.IpcMainInvokeEvent) {
    log.info('IPC: selectFolder')

    try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const result = await dialog.showOpenDialog(win!, {
            title: 'Select Projects Folder',
            properties: ['openDirectory']
        })

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, cancelled: true }
        }

        return { success: true, folderPath: result.filePaths[0] }
    } catch (err: any) {
        log.error('Failed to select folder:', err)
        return { success: false, error: err.message }
    }
}

export async function handleSelectMarkdownFile(event: Electron.IpcMainInvokeEvent) {
    log.info('IPC: selectMarkdownFile')

    try {
        const win = BrowserWindow.fromWebContents(event.sender)
        const result = await dialog.showOpenDialog(win!, {
            title: 'Select Markdown Guide',
            properties: ['openFile'],
            filters: [
                { name: 'Markdown', extensions: ['md', 'markdown', 'mdx', 'txt'] },
                { name: 'All Files', extensions: ['*'] }
            ]
        })

        if (result.canceled || result.filePaths.length === 0) {
            return { success: false, cancelled: true }
        }

        return { success: true, filePath: result.filePaths[0] }
    } catch (err: any) {
        log.error('Failed to select markdown file:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetUserHomePath() {
    log.info('IPC: getUserHomePath')

    try {
        const path = homedir()
        if (!path) {
            return { success: false, error: 'Home directory is unavailable.' }
        }

        return { success: true, path }
    } catch (err: any) {
        log.error('Failed to resolve user home path:', err)
        return { success: false, error: err.message || 'Failed to resolve user home path.' }
    }
}

export async function handleScanProjects(
    _event: Electron.IpcMainInvokeEvent,
    folderPath: string,
    options?: { forceRefresh?: boolean }
): Promise<ScanProjectsResult> {
    log.info('IPC: scanProjects', folderPath)
    const result = await devscopeCore.projects.scanProjects(folderPath, options)
    if (result.success) {
        log.info(
            `Found ${result.projects.length} projects, ${result.folders.length} folders, and ${result.files.length} files in ${folderPath}`
        )
    }
    return result
}

export async function handleIndexAllFolders(
    _event: Electron.IpcMainInvokeEvent,
    folders: string[],
    options?: { forceRefresh?: boolean }
) {
    log.info('IPC: indexAllFolders', { folders, forceRefresh: Boolean(options?.forceRefresh) })
    const result = await devscopeCore.projects.indexAllFolders(folders, options)
    log.info(`Indexed ${result.indexedCount} projects from ${folders.length} folders (max depth: unlimited)`)
    return result
}

export async function handleSearchIndexedPaths(
    _event: Electron.IpcMainInvokeEvent,
    input: {
        scopePath?: string
        roots?: string[]
        term?: string
        extensionFilters?: string[]
        limit?: number
        includeFiles?: boolean
        includeDirectories?: boolean
        showHidden?: boolean
    }
) {
    log.info('IPC: searchIndexedPaths', {
        scopePath: input?.scopePath,
        roots: input?.roots,
        term: input?.term,
        limit: input?.limit
    })
    const result = await devscopeCore.projects.searchIndexedPaths(input)
    return { success: true, ...result }
}

export async function handleOpenInExplorer(_event: Electron.IpcMainInvokeEvent, path: string) {
    log.info('IPC: openInExplorer', path)

    try {
        const normalizedPath = String(path || '').trim()
        if (!normalizedPath) return { success: false, error: 'Path is required.' }

        try {
            const targetStats = await stat(normalizedPath)
            if (targetStats.isFile()) {
                shell.showItemInFolder(normalizedPath)
                return { success: true }
            }
        } catch {
            // Fall back to shell.openPath when stats are unavailable.
        }

        const result = await shell.openPath(normalizedPath)
        if (result) {
            log.error('shell.openPath failed:', result)
            return { success: false, error: result }
        }
        return { success: true }
    } catch (err: any) {
        log.error('Failed to open in explorer:', err)
        return { success: false, error: err.message }
    }
}

export async function handleOpenFile(_event: Electron.IpcMainInvokeEvent, filePath: string) {
    log.info('IPC: openFile', filePath)

    try {
        const result = await shell.openPath(filePath)
        if (result) {
            log.error('shell.openPath failed:', result)
            return { success: false, error: result }
        }
        return { success: true }
    } catch (err: any) {
        log.error('Failed to open file:', err)
        return { success: false, error: err.message }
    }
}

export async function handleOpenWith(_event: Electron.IpcMainInvokeEvent, filePath: string) {
    log.info('IPC: openWith', filePath)

    try {
        const normalizedPath = String(filePath || '').trim()
        if (!normalizedPath) return { success: false, error: 'Path is required.' }

        if (process.platform === 'win32') {
            const child = spawn('rundll32.exe', ['shell32.dll,OpenAs_RunDLL', normalizedPath], {
                detached: true,
                windowsHide: true,
                stdio: 'ignore'
            })
            child.unref()
            return { success: true }
        }

        const result = await shell.openPath(normalizedPath)
        if (result) {
            log.error('shell.openPath failed:', result)
            return { success: false, error: result }
        }
        return { success: true }
    } catch (err: any) {
        log.error('Failed to open with:', err)
        return { success: false, error: err.message }
    }
}

export async function handleListInstalledIdes() {
    try {
        const ides = await getInstalledIdes()
        return { success: true, ides }
    } catch (err: any) {
        log.error('Failed to list installed IDEs:', err)
        return { success: false, error: err?.message || 'Failed to list installed IDEs.', ides: [] }
    }
}

export async function handleOpenProjectInIde(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    ideId: string
) {
    try {
        return await launchProjectInIde(projectPath, ideId)
    } catch (err: any) {
        log.error('Failed to open project in IDE:', err)
        return { success: false, error: err?.message || 'Failed to open project in IDE.' }
    }
}

export async function handleCopyToClipboard(_event: Electron.IpcMainInvokeEvent, text: string) {
    try {
        clipboard.writeText(text)
        return { success: true }
    } catch (err: any) {
        log.error('Failed to write to clipboard:', err)
        return { success: false, error: err.message }
    }
}
