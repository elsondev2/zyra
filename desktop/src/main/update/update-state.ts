import type { DevScopeReleaseChannel, DevScopeUpdateState } from '../../shared/contracts/devscope-api'

export function resolveReleaseChannel(version: string): DevScopeReleaseChannel {
    const prerelease = version.split('-')[1]?.toLowerCase() || ''
    if (prerelease.startsWith('alpha')) return 'alpha'
    if (prerelease.startsWith('beta')) return 'beta'
    return 'stable'
}

export function formatDisplayVersion(version: string): string {
    const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)(?:-([a-z]+)\.?(\d+)?)?$/i)
    if (!match) return `v${version}`

    const [, major, minor, patch, prerelease] = match
    const semverLabel = `v${major}.${minor}.${patch}`
    if (!prerelease) {
        return semverLabel
    }

    return `${semverLabel} ${prerelease.toLowerCase()}`
}

export function createInitialUpdateState(
    currentVersion: string,
    repository: string,
    enabled: boolean,
    releasePageUrl: string,
    disabledReason: string | null = null
): DevScopeUpdateState {
    return {
        enabled,
        status: enabled ? 'idle' : 'disabled',
        currentVersion,
        currentDisplayVersion: formatDisplayVersion(currentVersion),
        channel: resolveReleaseChannel(currentVersion),
        repository,
        releasePageUrl,
        disabledReason,
        availableVersion: null,
        availableDisplayVersion: null,
        downloadedVersion: null,
        downloadedDisplayVersion: null,
        downloadPercent: null,
        checkedAt: null,
        message: null,
        errorContext: null,
        canRetry: false
    }
}

export function shouldBroadcastDownloadProgress(
    currentState: DevScopeUpdateState,
    nextPercent: number
): boolean {
    if (currentState.status !== 'downloading') {
        return true
    }

    const currentPercent = currentState.downloadPercent
    if (currentPercent === null) {
        return true
    }

    const previousStep = Math.floor(currentPercent / 10)
    const nextStep = Math.floor(nextPercent / 10)
    return previousStep !== nextStep || nextPercent === 100
}

export function getAutoUpdateDisabledReason(args: {
    isPackaged: boolean
    disabledByEnv: boolean
}): string | null {
    if (!args.isPackaged) {
        return 'Automatic updates are only available in packaged production builds.'
    }
    if (args.disabledByEnv) {
        return 'Automatic updates are disabled by the DEVSCOPE_DISABLE_AUTO_UPDATE setting.'
    }
    return null
}
