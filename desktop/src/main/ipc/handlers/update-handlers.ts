import {
    checkForAppUpdates,
    downloadAppUpdate,
    getUpdateState,
    installAppUpdate
} from '../../update/manager'

export async function handleGetUpdateState() {
    return getUpdateState()
}

export async function handleCheckForUpdates() {
    return checkForAppUpdates('renderer')
}

export async function handleDownloadUpdate() {
    return downloadAppUpdate()
}

export async function handleInstallUpdate() {
    return installAppUpdate()
}
