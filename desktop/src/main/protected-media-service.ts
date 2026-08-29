import * as electronRuntime from 'electron'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import log from 'electron-log'
import type { DevScopeProtectedMediaStatus } from '../shared/contracts/devscope-api'

type ComponentResult = {
    id: string
    status: string
    title?: string
    version?: string
}

type ComponentsApi = {
    WIDEVINE_CDM_ID: string
    whenReady(required?: string[]): Promise<ComponentResult[]>
    status(): Record<string, { status: string; title?: string; version?: string }>
}

const PROTECTED_MEDIA_TIMEOUT_MS = 3 * 60_000
const PRODUCTION_VMP_MARKER = 'zyra-widevine-vmp.json'
const components = (electronRuntime as unknown as { components?: ComponentsApi }).components
let componentInstallationPromise: Promise<ComponentResult[]> | null = null
let readinessPromise: Promise<DevScopeProtectedMediaStatus> | null = null
function runtimeVmpLevel(): DevScopeProtectedMediaStatus['vmpLevel'] {
    try {
        if (!electronRuntime.app.isPackaged) return 'development'
        const markerPath = join(process.resourcesPath, PRODUCTION_VMP_MARKER)
        if (!existsSync(markerPath)) return 'development'
        const marker = JSON.parse(readFileSync(markerPath, 'utf8')) as { schemaVersion?: unknown; productionVmp?: unknown; platform?: unknown }
        return marker.schemaVersion === 1 && marker.productionVmp === true && marker.platform === process.platform
            ? 'production'
            : 'development'
    } catch {
        return 'development'
    }
}

let currentStatus: DevScopeProtectedMediaStatus = {
    supported: Boolean(components),
    ready: false,
    restartRequired: false,
    componentVersion: null,
    vmpLevel: runtimeVmpLevel(),
    message: components ? 'Preparing Widevine protected-media support.' : 'This Electron runtime does not include Widevine support.',
}

function applyComponentResult(results: ComponentResult[]): DevScopeProtectedMediaStatus {
    if (!components) return currentStatus
    const result = results.find((entry) => entry.id === components.WIDEVINE_CDM_ID)
    const status = components.status()[components.WIDEVINE_CDM_ID]
    const componentVersion = status?.version || result?.version || null
    const firstLinuxInstall = process.platform === 'linux' && (result?.status === 'new' || result?.status === 'updated')
    const restartRequired = firstLinuxInstall || !componentVersion
    currentStatus = {
        supported: true,
        ready: Boolean(componentVersion) && !restartRequired,
        restartRequired,
        componentVersion,
        vmpLevel: runtimeVmpLevel(),
        message: restartRequired
            ? componentVersion
                ? 'Widevine was installed. Restart Zyra once to enable protected playback.'
                : 'Widevine did not report a usable version. Restart Zyra and try protected playback again.'
            : null
    }
    log.info('[ProtectedMedia] Widevine component ready', { version: componentVersion, restartRequired })
    return currentStatus
}

function componentInstallation(): Promise<ComponentResult[]> {
    if (!components) return Promise.resolve([])
    if (!componentInstallationPromise) {
        componentInstallationPromise = components.whenReady([components.WIDEVINE_CDM_ID])
            .then((results) => {
                applyComponentResult(results)
                return results
            })
            .catch((error) => {
                componentInstallationPromise = null
                throw error
            })
    }
    return componentInstallationPromise
}

export function initializeProtectedMedia(): Promise<DevScopeProtectedMediaStatus> {
    if (!components) return Promise.resolve(currentStatus)
    if (currentStatus.ready) return Promise.resolve({ ...currentStatus })
    if (readinessPromise) return readinessPromise

    let timeout: NodeJS.Timeout | null = null
    const boundedWait = new Promise<ComponentResult[]>((_, reject) => {
        timeout = setTimeout(() => reject(Object.assign(new Error('Widevine component preparation timed out.'), { name: 'TimeoutError' })), PROTECTED_MEDIA_TIMEOUT_MS)
        timeout.unref?.()
    })
    readinessPromise = Promise.race([componentInstallation(), boundedWait])
        .then(applyComponentResult)
        .catch((error) => {
            currentStatus = {
                supported: true,
                ready: false,
                restartRequired: false,
                componentVersion: null,
                vmpLevel: runtimeVmpLevel(),
                message: error instanceof Error && error.name === 'TimeoutError'
                    ? 'Widevine is still being prepared. Retry Browser shortly or restart Zyra.'
                    : 'Widevine could not be installed. Check the network connection and retry Browser.'
            }
            log.warn('[ProtectedMedia] Widevine component unavailable', { errorType: error instanceof Error ? error.name : 'UnknownError' })
            return currentStatus
        })
        .finally(() => {
            if (timeout) clearTimeout(timeout)
            readinessPromise = null
        })
    return readinessPromise
}

export function getProtectedMediaStatus(): DevScopeProtectedMediaStatus {
    return { ...currentStatus }
}
