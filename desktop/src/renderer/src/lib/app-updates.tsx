import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode
} from 'react'
import type {
    DevScopeUpdateActionResult,
    DevScopeUpdateState
} from '@shared/contracts/devscope-api'

type UpdatePendingAction = 'check' | 'download' | 'install' | null

interface UpdateSuccessToastState {
    versionLabel: string
    isVisible: boolean
}

interface AppUpdatesContextValue {
    updateState: DevScopeUpdateState | null
    pendingAction: UpdatePendingAction
    isModalOpen: boolean
    shouldShowPrompt: boolean
    skippedVersion: string | null
    updateSuccessToast: UpdateSuccessToastState | null
    statusTone: 'neutral' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'up-to-date' | 'error'
    openModal: () => void
    closeModal: () => void
    dismissUpdateSuccessToast: () => void
    checkForUpdates: () => Promise<DevScopeUpdateActionResult | null>
    downloadUpdate: () => Promise<DevScopeUpdateActionResult | null>
    installUpdate: () => Promise<DevScopeUpdateActionResult | null>
    skipAvailableVersion: () => void
    remindLater: () => void
    clearSkippedVersion: () => void
}

const UPDATE_SKIPPED_VERSION_KEY = 'devscope:update-skipped-version:v1'
const UPDATE_SUCCESS_SEEN_PREFIX = 'devscope:update-success-seen:'

const AppUpdatesContext = createContext<AppUpdatesContextValue | null>(null)

function readSkippedVersion(): string | null {
    try {
        const raw = String(localStorage.getItem(UPDATE_SKIPPED_VERSION_KEY) || '').trim()
        return raw || null
    } catch {
        return null
    }
}

function writeSkippedVersion(version: string | null): void {
    try {
        if (!version) {
            localStorage.removeItem(UPDATE_SKIPPED_VERSION_KEY)
            return
        }
        localStorage.setItem(UPDATE_SKIPPED_VERSION_KEY, version)
    } catch {
        // Ignore storage write failures.
    }
}

function hasSeenUpdateSuccess(version: string): boolean {
    try {
        return localStorage.getItem(`${UPDATE_SUCCESS_SEEN_PREFIX}${version}`) === '1'
    } catch {
        return true
    }
}

function writeSeenUpdateSuccess(version: string): void {
    try {
        localStorage.setItem(`${UPDATE_SUCCESS_SEEN_PREFIX}${version}`, '1')
    } catch {
        // Ignore storage write failures.
    }
}

function resolveUpdateTone(updateState: DevScopeUpdateState | null): AppUpdatesContextValue['statusTone'] {
    if (!updateState || !updateState.enabled) return 'neutral'

    switch (updateState.status) {
        case 'checking':
            return 'checking'
        case 'available':
            return 'available'
        case 'downloading':
            return 'downloading'
        case 'downloaded':
            return 'downloaded'
        case 'up-to-date':
            return 'up-to-date'
        case 'error':
            return 'error'
        default:
            return 'neutral'
    }
}

export function AppUpdatesProvider({ children }: { children: ReactNode }) {
    const [updateState, setUpdateState] = useState<DevScopeUpdateState | null>(null)
    const [pendingAction, setPendingAction] = useState<UpdatePendingAction>(null)
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [skippedVersion, setSkippedVersion] = useState<string | null>(() => readSkippedVersion())
    const [laterDownloadedVersion, setLaterDownloadedVersion] = useState<string | null>(null)
    const [updateSuccessToast, setUpdateSuccessToast] = useState<UpdateSuccessToastState | null>(null)

    useEffect(() => {
        let mounted = true

        void window.devscope.updates.getState().then((state) => {
            if (mounted) {
                setUpdateState(state)
            }
        }).catch(() => undefined)

        const unsubscribe = window.devscope.updates.onStateChange((state) => {
            if (mounted) {
                setUpdateState(state)
            }
        })

        return () => {
            mounted = false
            unsubscribe()
        }
    }, [])

    useEffect(() => {
        if (!updateState?.availableVersion) return
        if (updateState.availableVersion === skippedVersion) return
        if (updateState.status === 'available') {
            setLaterDownloadedVersion(null)
        }
    }, [skippedVersion, updateState?.availableVersion, updateState?.status])

    useEffect(() => {
        if (!updateState?.downloadedVersion) return
        if (laterDownloadedVersion && laterDownloadedVersion !== updateState.downloadedVersion) {
            setLaterDownloadedVersion(null)
        }
    }, [laterDownloadedVersion, updateState?.downloadedVersion])

    useEffect(() => {
        if (!updateState?.enabled || !updateState.currentVersion) return
        if (hasSeenUpdateSuccess(updateState.currentVersion)) return

        writeSeenUpdateSuccess(updateState.currentVersion)
        setUpdateSuccessToast({
            versionLabel: updateState.currentDisplayVersion || `v${updateState.currentVersion}`,
            isVisible: true
        })
    }, [updateState?.currentDisplayVersion, updateState?.currentVersion, updateState?.enabled])

    useEffect(() => {
        if (!updateSuccessToast?.isVisible) return
        const timeoutId = window.setTimeout(() => {
            setUpdateSuccessToast((current) => current ? { ...current, isVisible: false } : current)
        }, 5200)

        return () => window.clearTimeout(timeoutId)
    }, [updateSuccessToast?.isVisible])

    useEffect(() => {
        if (!updateSuccessToast || updateSuccessToast.isVisible) return
        const timeoutId = window.setTimeout(() => {
            setUpdateSuccessToast(null)
        }, 180)

        return () => window.clearTimeout(timeoutId)
    }, [updateSuccessToast])

    const runAction = async (
        action: Exclude<UpdatePendingAction, null>,
        callback: () => Promise<DevScopeUpdateActionResult>
    ): Promise<DevScopeUpdateActionResult | null> => {
        setPendingAction(action)
        try {
            const result = await callback()
            setUpdateState(result.state)
            if (!result.accepted || !result.completed) {
                setIsModalOpen(true)
            }
            return result
        } catch {
            setIsModalOpen(true)
            return null
        } finally {
            setPendingAction(null)
        }
    }

    const checkForUpdates = () => runAction('check', () => window.devscope.updates.checkForUpdates())
    const downloadUpdate = () => {
        setLaterDownloadedVersion(null)
        return runAction('download', () => window.devscope.updates.downloadUpdate())
    }
    const installUpdate = () => runAction('install', () => window.devscope.updates.installUpdate())

    const skipAvailableVersion = () => {
        if (!updateState?.availableVersion) return
        writeSkippedVersion(updateState.availableVersion)
        setSkippedVersion(updateState.availableVersion)
        setIsModalOpen(false)
    }

    const clearSkippedVersion = () => {
        writeSkippedVersion(null)
        setSkippedVersion(null)
    }

    const dismissUpdateSuccessToast = () => {
        setUpdateSuccessToast((current) => current ? { ...current, isVisible: false } : current)
    }

    const remindLater = () => {
        if (updateState?.downloadedVersion) {
            setLaterDownloadedVersion(updateState.downloadedVersion)
        }
        setIsModalOpen(false)
    }

    const shouldShowPrompt = useMemo(() => {
        if (!updateState?.enabled) return false

        if (updateState.status === 'available') {
            return Boolean(updateState.availableVersion && updateState.availableVersion !== skippedVersion)
        }

        if (updateState.status === 'downloading') {
            return true
        }

        if (updateState.status === 'downloaded') {
            return Boolean(
                updateState.downloadedVersion
                && updateState.downloadedVersion !== laterDownloadedVersion
            )
        }

        return false
    }, [
        laterDownloadedVersion,
        skippedVersion,
        updateState?.availableVersion,
        updateState?.downloadedVersion,
        updateState?.enabled,
        updateState?.status
    ])

    const value: AppUpdatesContextValue = {
        updateState,
        pendingAction,
        isModalOpen,
        shouldShowPrompt,
        skippedVersion,
        updateSuccessToast,
        statusTone: resolveUpdateTone(updateState),
        openModal: () => setIsModalOpen(true),
        closeModal: () => setIsModalOpen(false),
        dismissUpdateSuccessToast,
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        skipAvailableVersion,
        remindLater,
        clearSkippedVersion
    }

    return (
        <AppUpdatesContext.Provider value={value}>
            {children}
        </AppUpdatesContext.Provider>
    )
}

function useAppUpdatesContext(): AppUpdatesContextValue {
    const context = useContext(AppUpdatesContext)
    if (!context) {
        throw new Error('useAppUpdates must be used within AppUpdatesProvider')
    }
    return context
}

export function useAppUpdates(): AppUpdatesContextValue {
    return useAppUpdatesContext()
}

export function useAppUpdateState(): DevScopeUpdateState | null {
    return useAppUpdatesContext().updateState
}

export function getUpdateActionLabel(updateState: DevScopeUpdateState | null): string {
    if (!updateState) return 'Updates unavailable'
    if (!updateState.enabled) {
        return 'Automatic updates unavailable'
    }
    switch (updateState.status) {
        case 'checking':
            return 'Checking for updates...'
        case 'available':
            return updateState.availableDisplayVersion
                ? `Update available: ${updateState.availableDisplayVersion}`
                : 'Update available'
        case 'downloading':
            return updateState.downloadPercent !== null
                ? `Downloading ${Math.round(updateState.downloadPercent)}%`
                : 'Downloading update...'
        case 'downloaded':
            return updateState.downloadedDisplayVersion
                ? `Ready to install: ${updateState.downloadedDisplayVersion}`
                : 'Ready to install'
        case 'up-to-date':
            return updateState.checkedAt ? 'Up to date' : 'Check for updates'
        case 'error':
            return updateState.message || 'Update failed'
        default:
            return 'Check for updates'
    }
}
