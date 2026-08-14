export type ZyraDesktopPlatform = 'win32' | 'darwin' | 'linux'
export type ZyraClientPlatform = ZyraDesktopPlatform | 'browser'

export type ZyraWindowChromePolicy = {
    nativeFrame: boolean
    customWindowControls: boolean
    titleBarStyle: 'default' | 'hiddenInset'
    reserveMacTrafficLights: boolean
}

export function resolveZyraWindowChromePolicy(platform: ZyraClientPlatform): ZyraWindowChromePolicy {
    if (platform === 'darwin') {
        return {
            nativeFrame: true,
            customWindowControls: false,
            titleBarStyle: 'hiddenInset',
            reserveMacTrafficLights: true
        }
    }

    if (platform === 'linux') {
        return {
            nativeFrame: true,
            customWindowControls: false,
            titleBarStyle: 'default',
            reserveMacTrafficLights: false
        }
    }

    if (platform === 'win32') {
        return {
            nativeFrame: false,
            customWindowControls: true,
            titleBarStyle: 'default',
            reserveMacTrafficLights: false
        }
    }

    return {
        nativeFrame: true,
        customWindowControls: false,
        titleBarStyle: 'default',
        reserveMacTrafficLights: false
    }
}

export function getZyraPlatformLabel(platform: ZyraClientPlatform): string {
    if (platform === 'darwin') return 'macOS'
    if (platform === 'linux') return 'Linux'
    if (platform === 'win32') return 'Windows'
    return 'Browser'
}
