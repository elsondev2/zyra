import { randomBytes } from 'node:crypto'
import { realpath, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { dialog, type BrowserWindow, type Session } from 'electron'
import { BROWSER_LOCAL_FILE_SCHEME } from '../shared/browser-view'
import { serveLocalFileRequest } from './file-protocol'
import { resolveFileMimeType } from './local-file-content'

const MAX_CAPABILITIES_PER_TAB = 16
const MAX_CAPABILITIES_PER_SESSION = 128

const BROWSER_LOCAL_FILE_EXTENSIONS = [
    'aac', 'avif', 'avi', 'bmp', 'c', 'cc', 'cpp', 'css', 'csv', 'flac', 'gif',
    'htm', 'html', 'ico', 'ini', 'jfif', 'jpeg', 'jpg', 'js', 'jsx', 'json', 'log',
    'm4a', 'm4v', 'markdown', 'md', 'mkv', 'mov', 'mp3', 'mp4', 'oga', 'ogg', 'ogv',
    'opus', 'pdf', 'png', 'svg', 'tif', 'tiff', 'toml', 'ts', 'tsx', 'txt', 'wav',
    'webm', 'webp', 'xml', 'yaml', 'yml'
]

type BrowserLocalFileCapability = {
    token: string
    tabId: string
    filePath: string
    fileName: string
    url: string
}

type BrowserLocalFileRegistry = {
    capabilities: Map<string, BrowserLocalFileCapability>
}

export type BrowserLocalFileSelection = {
    url: string
    displayAddress: string
    fileName: string
}

const registries = new WeakMap<Session, BrowserLocalFileRegistry>()

function emptyResponse(status: number, headers?: HeadersInit): Response {
    return new Response(null, { status, headers })
}

function safeFileName(value: string): string {
    return value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 240) || 'Local file'
}

function capabilityPath(capability: BrowserLocalFileCapability): string {
    return `/${capability.token}/${encodeURIComponent(capability.fileName)}`
}

function findCapability(registry: BrowserLocalFileRegistry, rawUrl: string): BrowserLocalFileCapability | null {
    try {
        const parsed = new URL(rawUrl)
        if (parsed.protocol !== `${BROWSER_LOCAL_FILE_SCHEME}:` || parsed.hostname !== 'file' || parsed.search) return null
        const token = parsed.pathname.split('/')[1] || ''
        const capability = registry.capabilities.get(token)
        if (!capability || parsed.pathname !== capabilityPath(capability)) return null
        return capability
    } catch {
        return null
    }
}

function removeCapability(registry: BrowserLocalFileRegistry, token: string): void {
    registry.capabilities.delete(token)
}

function pruneCapabilities(registry: BrowserLocalFileRegistry, tabId: string): void {
    const tabCapabilities = [...registry.capabilities.values()].filter((capability) => capability.tabId === tabId)
    while (tabCapabilities.length > MAX_CAPABILITIES_PER_TAB) {
        const oldest = tabCapabilities.shift()
        if (oldest) removeCapability(registry, oldest.token)
    }
    while (registry.capabilities.size > MAX_CAPABILITIES_PER_SESSION) {
        const oldestToken = registry.capabilities.keys().next().value
        if (typeof oldestToken !== 'string') break
        removeCapability(registry, oldestToken)
    }
}

function registryFor(browserSession: Session): BrowserLocalFileRegistry {
    const existing = registries.get(browserSession)
    if (existing) return existing

    const registry: BrowserLocalFileRegistry = { capabilities: new Map() }
    browserSession.protocol.handle(BROWSER_LOCAL_FILE_SCHEME, async (request) => {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            return emptyResponse(405, { Allow: 'GET, HEAD' })
        }
        const capability = findCapability(registry, request.url)
        if (!capability) return emptyResponse(404)
        return serveLocalFileRequest(capability.filePath, request)
    })
    registries.set(browserSession, registry)
    return registry
}

export function ensureBrowserLocalFileProtocol(browserSession: Session): void {
    registryFor(browserSession)
}

export async function authorizeBrowserLocalFile(
    browserSession: Session,
    tabId: string,
    selectedPath: string
): Promise<BrowserLocalFileSelection> {
    const registry = registryFor(browserSession)
    const filePath = await realpath(selectedPath)
    const fileStats = await stat(filePath)
    if (!fileStats.isFile()) throw new Error('Choose a file, not a folder.')
    if (resolveFileMimeType(filePath) === 'application/octet-stream') {
        throw new Error('Zyra Browser cannot preview this file type safely.')
    }

    const fileName = safeFileName(basename(filePath))
    const existing = [...registry.capabilities.values()].find((capability) => (
        capability.tabId === tabId && capability.filePath === filePath
    ))
    if (existing) {
        return { url: existing.url, displayAddress: `Local file · ${existing.fileName}`, fileName: existing.fileName }
    }

    const token = randomBytes(24).toString('base64url')
    const capability: BrowserLocalFileCapability = {
        token,
        tabId,
        filePath,
        fileName,
        url: `${BROWSER_LOCAL_FILE_SCHEME}://file/${token}/${encodeURIComponent(fileName)}`
    }
    registry.capabilities.set(token, capability)
    pruneCapabilities(registry, tabId)
    return { url: capability.url, displayAddress: `Local file · ${fileName}`, fileName }
}

export async function chooseBrowserLocalFile(
    ownerWindow: BrowserWindow,
    browserSession: Session,
    tabId: string
): Promise<BrowserLocalFileSelection | null> {
    const result = await dialog.showOpenDialog(ownerWindow, {
        title: 'Open file in Zyra Browser',
        buttonLabel: 'Open',
        properties: ['openFile'],
        filters: [{ name: 'Previewable files', extensions: BROWSER_LOCAL_FILE_EXTENSIONS }]
    })
    const selectedPath = result.canceled ? '' : String(result.filePaths[0] || '')
    return selectedPath ? authorizeBrowserLocalFile(browserSession, tabId, selectedPath) : null
}

export function isAuthorizedBrowserLocalFileUrl(browserSession: Session, tabId: string, value: string): boolean {
    const registry = registries.get(browserSession)
    const capability = registry ? findCapability(registry, value) : null
    return capability?.tabId === tabId
}

export function getBrowserLocalFilePresentation(
    browserSession: Session,
    tabId: string,
    value: string
): { displayAddress: string; fileName: string } | null {
    const registry = registries.get(browserSession)
    const capability = registry ? findCapability(registry, value) : null
    if (!capability || capability.tabId !== tabId) return null
    return { displayAddress: `Local file · ${capability.fileName}`, fileName: capability.fileName }
}

export function revokeBrowserLocalFilesForTab(browserSession: Session, tabId: string): void {
    const registry = registries.get(browserSession)
    if (!registry) return
    for (const capability of [...registry.capabilities.values()]) {
        if (capability.tabId === tabId) removeCapability(registry, capability.token)
    }
}
