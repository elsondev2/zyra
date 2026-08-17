/**
 * Zyra
 * Main Process Entry Point
 */

import { app, BrowserWindow, Menu, dialog, shell, ipcMain, nativeTheme, protocol, globalShortcut, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import { isAbsolute, join } from 'path'
import { existsSync, statSync } from 'fs'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { electronApp, is } from './utils'
import log from 'electron-log'
import { registerIpcHandlers } from './ipc'
import { configureAssistantService, disposeAssistantService, getAssistantService } from './assistant'
import { persistAssistantClipboardImage, resolveAssistantClipboardAttachment } from './assistant/clipboard-attachments'
import { getCodexVoiceTranscriptionState, transcribeVoiceWithCodex } from './assistant/codex-voice-transcription'
import { BrowserClientRuntime } from './browser-client-runtime'
import { disposeUpdater, initializeUpdater, registerUpdateWindow } from './update/manager'
import { registerFileProtocol } from './file-protocol'
import { isSafeBrowserNavigationUrl, isZyraBrowserPartition } from './ipc/handlers/browser-preview-handlers'
import { disposeAgentControlBroker, getAgentControlBroker } from './agent-control'
import { trustedBrowserGuests } from './agent-control/trusted-guest-registry'
import { resolveZyraWindowChromePolicy, type ZyraDesktopPlatform } from '../shared/platform-window-chrome'
import { createDesktopSetupServices } from './setup'
import { resolveZyraRoot } from './zyra/zyra-root'

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

const setupServices = createDesktopSetupServices(app.getPath('userData'))

// Configure logging
const verboseMainLogs = process.env.ZYRA_VERBOSE_LOGS === '1'
log.transports.file.level = 'info'
log.transports.console.level = verboseMainLogs ? 'debug' : 'warn'
console.log = log.log
console.error = log.error
console.warn = log.warn

let mainWindow: BrowserWindow | null = null
let quickPreviewWindow: BrowserWindow | null = null
let browserClientRuntime: BrowserClientRuntime | null = null
let hasRegisteredIpcHandlers = false
let normalDesktopRuntimeStarted = false
let quitCleanupStarted = false
let quitCleanupComplete = false
const pendingShellLaunchTargets: ShellLaunchTarget[] = []
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

function getWindowChromeOptions(): Pick<Electron.BrowserWindowConstructorOptions, 'frame' | 'titleBarStyle' | 'trafficLightPosition' | 'autoHideMenuBar'> {
    const platform = process.platform as ZyraDesktopPlatform
    const policy = resolveZyraWindowChromePolicy(platform)

    if (platform === 'darwin') {
        return {
            frame: policy.nativeFrame,
            titleBarStyle: 'hiddenInset',
            trafficLightPosition: { x: 14, y: 10 },
            autoHideMenuBar: false
        }
    }

    return {
        frame: policy.nativeFrame,
        titleBarStyle: 'default',
        autoHideMenuBar: true
    }
}

function sendAppMenuCommand(command: 'new-chat' | 'search' | 'settings' | 'reload' | 'about'): void {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    if (!mainWindow.isVisible()) mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('window:app-menu-command', command)
}

function configureApplicationMenu(setupComplete = true): void {
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null)
        return
    }

    if (!setupComplete) {
        Menu.setApplicationMenu(Menu.buildFromTemplate([
            {
                label: APP_NAME,
                submenu: [
                    { role: 'about' },
                    { type: 'separator' },
                    { role: 'services' },
                    { type: 'separator' },
                    { role: 'hide' },
                    { role: 'hideOthers' },
                    { role: 'unhide' },
                    { type: 'separator' },
                    { role: 'quit' }
                ]
            },
            { role: 'editMenu' },
            { role: 'windowMenu' }
        ]))
        return
    }

    const template: Electron.MenuItemConstructorOptions[] = [
        {
            label: APP_NAME,
            submenu: [
                { role: 'about' },
                {
                    label: 'Settings…',
                    accelerator: 'CommandOrControl+,',
                    click: () => sendAppMenuCommand('settings')
                },
                { type: 'separator' },
                { role: 'services' },
                { type: 'separator' },
                { role: 'hide' },
                { role: 'hideOthers' },
                { role: 'unhide' },
                { type: 'separator' },
                { role: 'quit' }
            ]
        },
        {
            label: 'File',
            submenu: [
                {
                    label: 'New Chat',
                    accelerator: 'CommandOrControl+N',
                    click: () => sendAppMenuCommand('new-chat')
                },
                { type: 'separator' },
                { role: 'close' }
            ]
        },
        { role: 'editMenu' },
        {
            label: 'View',
            submenu: [
                {
                    label: 'Search',
                    accelerator: 'CommandOrControl+K',
                    click: () => sendAppMenuCommand('search')
                },
                { type: 'separator' },
                { role: 'reload' },
                ...(is.dev ? [{ role: 'toggleDevTools' as const }] : []),
                { type: 'separator' },
                { role: 'resetZoom' },
                { role: 'zoomIn' },
                { role: 'zoomOut' },
                { type: 'separator' },
                { role: 'togglefullscreen' }
            ]
        },
        { role: 'windowMenu' },
        {
            role: 'help',
            submenu: [
                {
                    label: 'About Zyra',
                    click: () => sendAppMenuCommand('about')
                },
                {
                    label: 'Zyra on GitHub',
                    click: () => void shell.openExternal('https://github.com/justelson/zyra')
                },
                {
                    label: 'Report an issue',
                    click: () => void shell.openExternal('https://github.com/justelson/zyra/issues')
                }
            ]
        }
    ]
    Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function attachWindowStateEvents(window: BrowserWindow): void {
    const publish = () => {
        if (window.isDestroyed() || window.webContents.isDestroyed()) return
        window.webContents.send('window:maximized-changed', window.isMaximized() || window.isFullScreen())
    }
    window.on('maximize', publish)
    window.on('unmaximize', publish)
    window.on('enter-full-screen', publish)
    window.on('leave-full-screen', publish)
    window.webContents.on('did-finish-load', publish)
}

function isDevToolsShortcut(input: Electron.Input): boolean {
    const key = input.key?.toLowerCase()
    if (input.type !== 'keyDown' || key !== 'i') return false
    return process.platform === 'darwin'
        ? !!input.meta && !!input.alt
        : !!input.control && !!input.shift
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
        webPreferences.backgroundThrottling = false
        webPreferences.webSecurity = true
        webPreferences.allowRunningInsecureContent = false
        webPreferences.navigateOnDragDrop = false
        webPreferences.safeDialogs = true
    })

    window.webContents.on('did-attach-webview', (_event, guestContents) => {
        trustedBrowserGuests.register(window.webContents.id, guestContents)
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
    registerIpcHandlers(targetWindow, setupServices)
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

function configureMainRendererMediaPermissions(): void {
    const isTrustedMainRenderer = (webContents: Electron.WebContents | null) => (
        Boolean(webContents && mainWindow && !mainWindow.isDestroyed() && webContents.id === mainWindow.webContents.id)
    )

    session.defaultSession.setPermissionCheckHandler((webContents, permission, _origin, details) => (
        permission === 'media'
        && details.isMainFrame
        && details.mediaType === 'audio'
        && isTrustedMainRenderer(webContents)
    ))
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
        const mediaTypes = permission === 'media' && 'mediaTypes' in details && Array.isArray(details.mediaTypes)
            ? details.mediaTypes
            : []
        const audioOnly = mediaTypes.length > 0 && mediaTypes.every((mediaType) => mediaType === 'audio')
        callback(permission === 'media' && details.isMainFrame && audioOnly && isTrustedMainRenderer(webContents))
    })
}

function createWindow(showOnReady = true, initialRoute = '/'): BrowserWindow {
    const iconPath = getAppIconPath()
    const window = new BrowserWindow({
        width: 1200,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        show: false,
        ...getWindowChromeOptions(),
        backgroundColor: '#0c121f',
        ...(iconPath ? { icon: iconPath } : {}),
        webPreferences: {
            preload: getPreloadPath(),
            sandbox: false,
            contextIsolation: true,
            nodeIntegration: false,
            webviewTag: true,
            // Pause renderer presentation while hidden; visibility reconciliation
            // snaps transient queues to current Assistant state on restore.
            backgroundThrottling: true,
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
    attachWindowStateEvents(window)
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
        ...getWindowChromeOptions(),
        backgroundColor: '#0c121f',
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
    attachWindowStateEvents(window)
    lockWindowZoom(window)
    loadRendererRoute(window, route)
    quickPreviewWindow = window
    return window
}

function openFolderInMainWindow(folderPath: string): BrowserWindow {
    if (!setupServices.onboarding.isAccessAllowed()) {
        pendingShellLaunchTargets.push({ kind: 'directory', path: folderPath })
        if (!mainWindow || mainWindow.isDestroyed()) {
            mainWindow = createWindow(true)
            ensureIpcHandlersRegistered(mainWindow)
        }
        if (mainWindow.isMinimized()) mainWindow.restore()
        mainWindow.show()
        mainWindow.focus()
        return mainWindow
    }
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
    if (!setupServices.onboarding.isAccessAllowed()) {
        pendingShellLaunchTargets.push(shellLaunchTarget)
        if (mainWindow && !mainWindow.isDestroyed()) {
            if (mainWindow.isMinimized()) mainWindow.restore()
            mainWindow.show()
            mainWindow.focus()
        }
        return
    }
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

function revealPendingShellLaunchTargets(): void {
    if (!setupServices.onboarding.isAccessAllowed()) return
    const pending = pendingShellLaunchTargets.splice(0, pendingShellLaunchTargets.length)
    for (const target of pending) handleShellLaunchTarget(target)
}

function startNormalDesktopRuntime(): void {
    if (normalDesktopRuntimeStarted || !setupServices.onboarding.isAccessAllowed()) return
    normalDesktopRuntimeStarted = true
    void initializeUpdater()
    revealPendingShellLaunchTargets()
}

function stopNormalDesktopRuntimeForSetup(): void {
    if (!normalDesktopRuntimeStarted) return
    normalDesktopRuntimeStarted = false
    void disposeAssistantService()
    disposeUpdater()
}

function resolveSenderWindow(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
    return BrowserWindow.fromWebContents(event.sender)
}

async function runPackagedLaunchSmoke(): Promise<void> {
    const markerPath = String(process.env.ZYRA_PACKAGED_SMOKE_MARKER || '').trim()
    if (!isAbsolute(markerPath) || markerPath.length > 2_048) {
        throw new Error('Packaged launch smoke requires a bounded absolute marker path.')
    }
    const root = resolveZyraRoot()
    await Promise.all([
        import(/* @vite-ignore */ pathToFileURL(join(root, 'src', 'zyra-sdk.mjs')).href),
        import(/* @vite-ignore */ pathToFileURL(join(root, 'src', 'chatgpt-account.mjs')).href)
    ])
    await writeFile(markerPath, `${JSON.stringify({
        version: app.getVersion(),
        platform: process.platform,
        architecture: process.arch,
        resourcesPath: process.resourcesPath,
        runtimeRoot: root
    })}\n`, { encoding: 'utf8', mode: 0o600 })
}

const initialShellLaunchTarget = extractShellLaunchTargetFromArgv(process.argv)
const hasSingleInstanceLock = app.requestSingleInstanceLock()

if (!hasSingleInstanceLock) {
    app.quit()
}

app.on('open-file', (event, filePath) => {
    event.preventDefault()
    const shellLaunchTarget = resolveShellLaunchTarget(filePath)
    if (shellLaunchTarget) handleShellLaunchTarget(shellLaunchTarget)
})

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

app.whenReady().then(async () => {
    if (process.env.ZYRA_PACKAGED_SMOKE === '1') {
        try {
            await runPackagedLaunchSmoke()
            app.quit()
        } catch (error) {
            log.error('[ReleaseSmoke] packaged launch failed', error)
            app.exit(1)
        }
        return
    }

    electronApp.setAppUserModelId(runtimeIdentity.appUserModelId)
    await setupServices.onboarding.initialize().catch((error) => {
        log.error('[Onboarding] failed to hydrate mandatory setup state', error)
    })
    if (setupServices.onboarding.shouldShowOnboarding()) {
        void setupServices.auth.prewarm().catch((error) => {
            log.warn('[Onboarding] OpenAI connection prewarm failed', error)
        })
    }
    configureAssistantService({
        getNewChatExecutionDefaults: () => setupServices.preferences.getNewChatWebDefaults()
    })
    configureApplicationMenu(setupServices.onboarding.isAccessAllowed())
    setupServices.onboarding.subscribe((snapshot) => {
        configureApplicationMenu(snapshot.accessAllowed)
        if (snapshot.accessAllowed) startNormalDesktopRuntime()
        else stopNormalDesktopRuntimeForSetup()
    })

    const rendererUrl = process.env['ELECTRON_RENDERER_URL']
    try {
        const runtime = new BrowserClientRuntime({
            getAssistantService: () => setupServices.onboarding.isAccessAllowed() ? getAssistantService() : null,
            getDevscopeTarget: () => mainWindow?.webContents || null,
            userDataPath: app.getPath('userData'),
            staticRoot: join(__dirname, '../renderer'),
            ...(is.dev && rendererUrl ? { rendererUrl } : {}),
            persistClipboardImage: persistAssistantClipboardImage,
            resolveClipboardAttachment: resolveAssistantClipboardAttachment,
            getVoiceTranscriptionState: getCodexVoiceTranscriptionState,
            transcribeVoice: transcribeVoiceWithCodex,
            isOnboardingComplete: () => setupServices.onboarding.isAccessAllowed()
        })
        browserClientRuntime = runtime
        void runtime.start().then((address) => {
            if (browserClientRuntime === runtime) log.info('[BrowserClientHost] ready', address.origin)
        }).catch((error) => {
            log.warn('[BrowserClientHost] failed to start', error)
            if (browserClientRuntime === runtime) browserClientRuntime = null
        })
    } catch (error) {
        log.warn('[BrowserClientHost] could not initialize', error)
        browserClientRuntime = null
    }
    registerFileProtocol(FILE_PROTOCOL)
    configureMainRendererMediaPermissions()
    nativeTheme.on('updated', syncOpenWindowIcons)
    globalShortcut.register('CommandOrControl+Alt+Escape', () => {
        void getAgentControlBroker().emergencyStop('Global emergency-stop shortcut pressed.')
    })

    const setupComplete = setupServices.onboarding.isAccessAllowed()
    if (initialShellLaunchTarget && !setupComplete) pendingShellLaunchTargets.push(initialShellLaunchTarget)
    // Keep the full app alive in background for completed shell file-preview launches.
    const launchHidden = setupComplete && initialShellLaunchTarget?.kind === 'file'
    const initialRoute = setupComplete && initialShellLaunchTarget?.kind === 'directory'
        ? buildExternalExplorerRoute(initialShellLaunchTarget.path)
        : '/'
    mainWindow = createWindow(!launchHidden, initialRoute)
    ensureIpcHandlersRegistered(mainWindow)
    if (setupComplete && initialShellLaunchTarget?.kind === 'file') {
        createQuickPreviewWindow(initialShellLaunchTarget.path)
    }
    startNormalDesktopRuntime()

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
    if (process.platform === 'darwin') return
    app.quit()
})

app.on('before-quit', (event) => {
    if (quitCleanupComplete) return
    event.preventDefault()
    if (quitCleanupStarted) return
    quitCleanupStarted = true
    globalShortcut.unregisterAll()
    const browserRuntime = browserClientRuntime
    browserClientRuntime = null
    disposeUpdater()
    void Promise.all([
        browserRuntime?.stop().catch((error) => log.warn('[Shutdown] Browser runtime cleanup failed', error)),
        disposeAssistantService(),
        setupServices.auth.dispose().catch((error) => log.warn('[Shutdown] OpenAI auth worker cleanup failed', error)),
        disposeAgentControlBroker().catch((error) => log.warn('[Shutdown] Agent Control cleanup failed', error))
    ]).then(() => {
        quitCleanupComplete = true
        app.quit()
    }).catch((error) => {
        quitCleanupStarted = false
        log.error('[Shutdown] Zyra kept running because Assistant state could not be committed.', error)
        if (!mainWindow || mainWindow.isDestroyed()) {
            mainWindow = createWindow(true)
            ensureIpcHandlersRegistered(mainWindow)
        } else if (!mainWindow.isVisible()) {
            mainWindow.show()
        }
        dialog.showErrorBox(
            'Zyra could not finish saving',
            'Zyra is still running so your pending chat state is not discarded. Free some disk space or fix the storage error, then quit again.'
        )
    })
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
    const targetWindow = resolveSenderWindow(event)
    return targetWindow ? targetWindow.isMaximized() || targetWindow.isFullScreen() : false
})
