/**
 * Zyra
 * Main Process Entry Point
 */

import { app, BrowserWindow, Menu, shell, ipcMain, nativeTheme, protocol, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { join } from 'path'
import { existsSync, statSync } from 'fs'
import { electronApp, is } from './utils'
import log from 'electron-log'
import { registerIpcHandlers } from './ipc'
import { disposeAssistantService } from './assistant'
import { disposeUpdater, initializeUpdater, registerUpdateWindow } from './update/manager'
import { registerFileProtocol } from './file-protocol'
import { isSafeBrowserNavigationUrl, isZyraBrowserPartition } from './ipc/handlers/browser-preview-handlers'

const APP_NAME = "Zyra"
const DEV_APP_NAME = `${APP_NAME}-dev`
const APP_USER_MODEL_ID = 'app.zyra.desktop'
const DEV_APP_USER_MODEL_ID = `${APP_USER_MODEL_ID}.dev`

type RuntimeIdentity = {
    appName: string
    appUserModelId: string
    userDataDirectoryName: string
    isDevRuntime: boolean
}

function resolveRuntimeIdentity(): RuntimeIdentity {
    if (is.dev) {
        return {
            appName: DEV_APP_NAME,
            appUserModelId: DEV_APP_USER_MODEL_ID,
            userDataDirectoryName: DEV_APP_NAME,
            isDevRuntime: true
        }
    }

    return {
        appName: APP_NAME,
        appUserModelId: APP_USER_MODEL_ID,
        userDataDirectoryName: APP_NAME,
        isDevRuntime: false
    }
}

const runtimeIdentity = resolveRuntimeIdentity()

function applyRuntimeIdentity(identity: RuntimeIdentity): void {
    app.setName(identity.appName)

    if (!identity.isDevRuntime) return

    const userDataPath = join(app.getPath('appData'), identity.userDataDirectoryName)
    app.setPath('userData', userDataPath)
    app.setPath('sessionData', join(userDataPath, 'session'))
}

applyRuntimeIdentity(runtimeIdentity)

// Configure logging
const verboseMainLogs = process.env.ZYRA_VERBOSE_LOGS === '1'
log.transports.file.level = 'info'
log.transports.console.level = verboseMainLogs ? 'debug' : 'warn'
console.log = log.log
console.error = log.error
console.warn = log.warn

let mainWindow: BrowserWindow | null = null
let quickPreviewWindow: BrowserWindow | null = null
let hasRegisteredIpcHandlers = false
const FILE_PROTOCOL = 'zyra'
const QUICK_PREVIEW_ROUTE = '/quick-open'
const EXTERNAL_EXPLORER_LAUNCH_QUERY = 'shellLaunch=1'

type ShellLaunchTarget = {
    kind: 'file' | 'directory'
    path: string
}

protocol.registerSchemesAsPrivileged([
    {
        scheme: FILE_PROTOCOL,
        privileges: {
            standard: true,
            secure: true,
            supportFetchAPI: true,
            stream: true
        }
    }
])

const getPreloadPath = (): string => {
    const preloadMjs = join(__dirname, '../preload/index.mjs')
    const preloadJs = join(__dirname, '../preload/index.js')
    return existsSync(preloadMjs) ? preloadMjs : preloadJs
}

const getAppIconPath = (): string | undefined => {
    const family = runtimeIdentity.isDevRuntime ? 'dev' : 'prod'
    const theme = nativeTheme.shouldUseDarkColors ? 'dark' : 'light'
    const variantName = `zyra-${family}-${theme}.png`
    const masterName = `zyra-${family}.png`
    const fallbackName = runtimeIdentity.isDevRuntime ? 'icon-dev.png' : 'icon.png'
    const candidates = [
        join(process.cwd(), 'resources/branding/icons', variantName),
        join(app.getAppPath(), 'resources/branding/icons', variantName),
        join(process.cwd(), 'resources/branding/icons', masterName),
        join(app.getAppPath(), 'resources/branding/icons', masterName),
        join(process.resourcesPath, fallbackName),
        join(app.getAppPath(), 'resources', fallbackName),
        join(process.cwd(), 'resources', fallbackName)
    ]
    return candidates.find((candidate) => existsSync(candidate))
}

function syncOpenWindowIcons(): void {
    if (process.platform === 'darwin') return
    const iconPath = getAppIconPath()
    if (!iconPath) return
    for (const window of BrowserWindow.getAllWindows()) {
        if (!window.isDestroyed()) window.setIcon(iconPath)
    }
}

function isDevToolsShortcut(input: Electron.Input): boolean {
    const key = input.key?.toLowerCase()
    return input.type === 'keyDown' && !!input.control && !!input.shift && key === 'i'
}

function lockWindowZoom(window: BrowserWindow): void {
    const { webContents } = window

    // Keep the desktop app at a fixed 100% zoom so focus changes or shortcut
    // noise cannot leave the whole UI in an inconsistent scaled state.
    webContents.setZoomLevel(0)
    webContents.setZoomFactor(1)
    void webContents.setVisualZoomLevelLimits(1, 1).catch(() => {})
}

function registerBrowserPreviewWebviewSecurity(window: BrowserWindow): void {
    window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
        const partition = String(params.partition || '')
        const sourceUrl = String(params.src || 'about:blank')
        const safeSource = sourceUrl === 'about:blank' || isSafeBrowserNavigationUrl(sourceUrl)
        if (!isZyraBrowserPartition(partition) || !safeSource || params.preload) {
            event.preventDefault()
            return
        }

        webPreferences.preload = undefined
        webPreferences.sandbox = true
        webPreferences.contextIsolation = true
        webPreferences.nodeIntegration = false
        webPreferences.nodeIntegrationInSubFrames = false
        webPreferences.nodeIntegrationInWorker = false
        webPreferences.webSecurity = true
        webPreferences.allowRunningInsecureContent = false
        webPreferences.navigateOnDragDrop = false
        webPreferences.safeDialogs = true
    })

    window.webContents.on('did-attach-webview', (_event, guestContents) => {
        guestContents.setWindowOpenHandler(({ url }) => {
            if (isSafeBrowserNavigationUrl(url)) void shell.openExternal(url)
            return { action: 'deny' }
        })
        guestContents.on('will-navigate', (event, url) => {
            if (url === 'about:blank' || isSafeBrowserNavigationUrl(url)) return
            event.preventDefault()
        })
        guestContents.on('will-redirect', (event, url) => {
            if (isSafeBrowserNavigationUrl(url)) return
            event.preventDefault()
        })
    })
}

function registerEditableContextMenu(window: BrowserWindow): void {
    window.webContents.on('context-menu', (_event, params) => {
        if (!params.isEditable) return

        const template: Electron.MenuItemConstructorOptions[] = []

        if (params.misspelledWord) {
            if (params.dictionarySuggestions.length > 0) {
                template.push(
                    ...params.dictionarySuggestions.slice(0, 6).map((suggestion) => ({
                        label: suggestion,
                        click: () => window.webContents.replaceMisspelling(suggestion)
                    }))
                )
            } else {
                template.push({
                    label: 'No spelling suggestions',
                    enabled: false
                })
            }

            template.push({
                label: 'Add to Dictionary',
                click: () => window.webContents.session.addWordToSpellCheckerDictionary(params.misspelledWord)
            })
            template.push({ type: 'separator' })
        }

        template.push(
            { role: 'undo', enabled: params.editFlags.canUndo },
            { role: 'redo', enabled: params.editFlags.canRedo },
            { type: 'separator' },
            { role: 'cut', enabled: params.editFlags.canCut },
            { role: 'copy', enabled: params.editFlags.canCopy },
            { role: 'paste', enabled: params.editFlags.canPaste },
            { role: 'selectAll', enabled: params.editFlags.canSelectAll }
        )

        Menu.buildFromTemplate(template).popup({ window })
    })
}

function resolveShellLaunchTarget(arg: string): ShellLaunchTarget | null {
    const trimmed = String(arg || '').trim()
    if (!trimmed || trimmed.startsWith('-')) return null
    if (!existsSync(trimmed)) return null

    try {
        const stat = statSync(trimmed)
        if (stat.isDirectory()) {
            return { kind: 'directory', path: trimmed }
        }
        if (stat.isFile()) {
            return { kind: 'file', path: trimmed }
        }
    } catch {
        return null
    }

    return null
}

function extractShellLaunchTargetFromArgv(argv: string[]): ShellLaunchTarget | null {
    const startIndex = app.isPackaged ? 1 : 2
    for (let i = startIndex; i < argv.length; i += 1) {
        const candidate = String(argv[i] || '').trim()
        const shellLaunchTarget = resolveShellLaunchTarget(candidate)
        if (shellLaunchTarget) {
            return shellLaunchTarget
        }
    }
    return null
}

function ensureIpcHandlersRegistered(targetWindow: BrowserWindow): void {
    if (hasRegisteredIpcHandlers) return
    registerIpcHandlers(targetWindow)
    hasRegisteredIpcHandlers = true
}

function loadRendererRoute(window: BrowserWindow, routeWithSearch: string): void {
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        const url = new URL(process.env['ELECTRON_RENDERER_URL'])
        url.hash = routeWithSearch
        void window.loadURL(url.toString())
        return
    }
    void window.loadFile(join(__dirname, '../renderer/index.html'), { hash: routeWithSearch })
}

function buildExternalExplorerRoute(folderPath: string): string {
    return `/explorer/${encodeURIComponent(folderPath)}?${EXTERNAL_EXPLORER_LAUNCH_QUERY}`
}

function createWindow(showOnReady = true, initialRoute = '/'): BrowserWindow {
    const iconPath = getAppIconPath()
    const window = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        show: false,
        frame: false,
        backgroundColor: '#0c121f',
        ...(iconPath ? { icon: iconPath } : {}),
        webPreferences: {
            preload: getPreloadPath(),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            devTools: true
        }
    })

    window.on('ready-to-show', () => {
        if (showOnReady) window.show()
    })
    window.on('focus', () => {
        lockWindowZoom(window)
    })
    window.webContents.on('did-finish-load', () => {
        lockWindowZoom(window)
    })

    window.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    window.webContents.on('before-input-event', (event, input) => {
        if (!isDevToolsShortcut(input)) return

        event.preventDefault()
        if (window.webContents.isDevToolsOpened()) {
            window.webContents.closeDevTools()
        } else {
            window.webContents.openDevTools({ mode: 'detach' })
        }
    })

    registerBrowserPreviewWebviewSecurity(window)
    registerEditableContextMenu(window)
    lockWindowZoom(window)
    loadRendererRoute(window, initialRoute)
    registerUpdateWindow(window)

    return window
}

function createQuickPreviewWindow(filePath: string): BrowserWindow {
    const iconPath = getAppIconPath()
    const route = `${QUICK_PREVIEW_ROUTE}?file=${encodeURIComponent(filePath)}`

    if (quickPreviewWindow && !quickPreviewWindow.isDestroyed()) {
        loadRendererRoute(quickPreviewWindow, route)
        if (quickPreviewWindow.isMinimized()) quickPreviewWindow.restore()
        quickPreviewWindow.show()
        quickPreviewWindow.focus()
        return quickPreviewWindow
    }

    const window = new BrowserWindow({
        width: 1160,
        height: 860,
        minWidth: 760,
        minHeight: 520,
        show: false,
        frame: false,
        backgroundColor: '#0c121f',
        autoHideMenuBar: true,
        ...(iconPath ? { icon: iconPath } : {}),
        webPreferences: {
            preload: getPreloadPath(),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: false,
            devTools: true
        }
    })

    window.on('ready-to-show', () => window.show())
    window.on('focus', () => {
        lockWindowZoom(window)
    })
    window.on('closed', () => {
        quickPreviewWindow = null
    })
    window.webContents.on('did-finish-load', () => {
        lockWindowZoom(window)
    })
    window.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
    })

    registerEditableContextMenu(window)
    lockWindowZoom(window)
    loadRendererRoute(window, route)
    quickPreviewWindow = window
    return window
}

function openFolderInMainWindow(folderPath: string): BrowserWindow {
    const route = buildExternalExplorerRoute(folderPath)

    if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow(true, route)
        ensureIpcHandlersRegistered(mainWindow)
        return mainWindow
    }

    loadRendererRoute(mainWindow, route)
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
}

function handleShellLaunchTarget(shellLaunchTarget: ShellLaunchTarget): void {
    if (shellLaunchTarget.kind === 'directory') {
        openFolderInMainWindow(shellLaunchTarget.path)
        return
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow(false)
        ensureIpcHandlersRegistered(mainWindow)
    }
    createQuickPreviewWindow(shellLaunchTarget.path)
}

function resolveSenderWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
    return BrowserWindow.fromWebContents(event.sender)
}

const initialShellLaunchTarget = extractShellLaunchTargetFromArgv(process.argv)
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
    app.quit()
}

app.on('second-instance', (_event, argv) => {
    const shellLaunchTarget = extractShellLaunchTargetFromArgv(argv)
    if (shellLaunchTarget) {
        handleShellLaunchTarget(shellLaunchTarget)
        return
    }

    if (!mainWindow || mainWindow.isDestroyed()) {
        mainWindow = createWindow(true)
        ensureIpcHandlersRegistered(mainWindow)
        return
    }

    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
})

app.whenReady().then(() => {
    electronApp.setAppUserModelId(runtimeIdentity.appUserModelId)
    void initializeUpdater()
    registerFileProtocol(FILE_PROTOCOL)
    nativeTheme.on('updated', syncOpenWindowIcons)

    // Keep the full app alive in background for shell file-preview launches.
    const launchHidden = initialShellLaunchTarget?.kind === 'file'
    const initialRoute = initialShellLaunchTarget?.kind === 'directory'
        ? buildExternalExplorerRoute(initialShellLaunchTarget.path)
        : '/'
    mainWindow = createWindow(!launchHidden, initialRoute)
    ensureIpcHandlersRegistered(mainWindow)
    if (initialShellLaunchTarget?.kind === 'file') {
        createQuickPreviewWindow(initialShellLaunchTarget.path)
    }

    app.on('activate', function () {
        if (!mainWindow || mainWindow.isDestroyed()) {
            mainWindow = createWindow(true)
            ensureIpcHandlersRegistered(mainWindow)
            return
        }
        if (!mainWindow.isVisible()) mainWindow.show()
        mainWindow.focus()
    })

    app.on('render-process-gone', (_event, webContents, details) => {
        log.error('[Process] Renderer gone', {
            id: webContents.id,
            reason: details.reason,
            exitCode: details.exitCode
        })
    })

    app.on('child-process-gone', (_event, details) => {
        log.error('[Process] Child process gone', details)
    })
})

app.on('window-all-closed', () => {
    disposeAssistantService()
    disposeUpdater()
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    disposeAssistantService()
    disposeUpdater()
})

// Handle window control IPC
ipcMain.on('window:minimize', (event) => {
    log.info('Window minimize requested')
    resolveSenderWindow(event)?.minimize()
})

ipcMain.on('window:maximize', (event) => {
    log.info('Window maximize requested')
    const targetWindow = resolveSenderWindow(event)
    if (!targetWindow) return

    if (targetWindow.isMaximized()) {
        targetWindow.unmaximize()
    } else {
        targetWindow.maximize()
    }
})

ipcMain.on('window:close', (event) => {
    log.info('Window close requested')
    resolveSenderWindow(event)?.close()
})

ipcMain.handle('window:isMaximized', (event) => {
    return resolveSenderWindow(event)?.isMaximized() ?? false
})
