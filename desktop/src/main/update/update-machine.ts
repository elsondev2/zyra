import type { DevScopeUpdateState } from '../../shared/contracts/devscope-api'
import { formatDisplayVersion } from './update-state'

function nextStatusAfterDownloadFailure(state: DevScopeUpdateState): DevScopeUpdateState['status'] {
    return state.availableVersion ? 'available' : 'error'
}

function getCanRetryAfterDownloadFailure(state: DevScopeUpdateState): boolean {
    return state.availableVersion !== null
}

export function reduceUpdateStateOnCheckStart(
    state: DevScopeUpdateState,
    checkedAt: string
): DevScopeUpdateState {
    return {
        ...state,
        status: 'checking',
        checkedAt,
        message: null,
        downloadPercent: null,
        errorContext: null,
        canRetry: false
    }
}

export function reduceUpdateStateOnCheckFailure(
    state: DevScopeUpdateState,
    message: string,
    checkedAt: string
): DevScopeUpdateState {
    return {
        ...state,
        status: 'error',
        checkedAt,
        message,
        downloadPercent: null,
        errorContext: 'check',
        canRetry: true
    }
}

export function reduceUpdateStateOnUpdateAvailable(
    state: DevScopeUpdateState,
    version: string,
    checkedAt: string
): DevScopeUpdateState {
    return {
        ...state,
        status: 'available',
        availableVersion: version,
        availableDisplayVersion: formatDisplayVersion(version),
        downloadedVersion: null,
        downloadedDisplayVersion: null,
        checkedAt,
        downloadPercent: null,
        message: null,
        errorContext: null,
        canRetry: false
    }
}

export function reduceUpdateStateOnNoUpdate(
    state: DevScopeUpdateState,
    checkedAt: string
): DevScopeUpdateState {
    return {
        ...state,
        status: 'up-to-date',
        availableVersion: null,
        availableDisplayVersion: null,
        downloadedVersion: null,
        downloadedDisplayVersion: null,
        checkedAt,
        downloadPercent: null,
        message: null,
        errorContext: null,
        canRetry: false
    }
}

export function reduceUpdateStateOnDownloadStart(
    state: DevScopeUpdateState
): DevScopeUpdateState {
    return {
        ...state,
        status: 'downloading',
        downloadPercent: 0,
        message: null,
        errorContext: null,
        canRetry: false
    }
}

export function reduceUpdateStateOnDownloadFailure(
    state: DevScopeUpdateState,
    message: string
): DevScopeUpdateState {
    return {
        ...state,
        status: nextStatusAfterDownloadFailure(state),
        message,
        downloadPercent: null,
        errorContext: 'download',
        canRetry: getCanRetryAfterDownloadFailure(state)
    }
}

export function reduceUpdateStateOnDownloadProgress(
    state: DevScopeUpdateState,
    percent: number
): DevScopeUpdateState {
    return {
        ...state,
        status: 'downloading',
        downloadPercent: percent,
        message: null,
        errorContext: null,
        canRetry: false
    }
}

export function reduceUpdateStateOnDownloadComplete(
    state: DevScopeUpdateState,
    version: string
): DevScopeUpdateState {
    return {
        ...state,
        status: 'downloaded',
        availableVersion: version,
        availableDisplayVersion: formatDisplayVersion(version),
        downloadedVersion: version,
        downloadedDisplayVersion: formatDisplayVersion(version),
        downloadPercent: 100,
        message: null,
        errorContext: null,
        canRetry: true
    }
}

export function reduceUpdateStateOnInstallFailure(
    state: DevScopeUpdateState,
    message: string
): DevScopeUpdateState {
    return {
        ...state,
        status: 'downloaded',
        message,
        errorContext: 'install',
        canRetry: true
    }
}
