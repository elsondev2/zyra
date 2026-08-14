import { useEffect, useMemo, useState } from 'react'
import type { DevScopeWindowRuntimeInfo } from '@shared/contracts/devscope-api'
import { resolveZyraWindowChromePolicy, type ZyraClientPlatform } from '@shared/platform-window-chrome'

function inferClientPlatform(): ZyraClientPlatform {
    if (!/\bElectron\//.test(navigator.userAgent)) return 'browser'
    if (/Macintosh|Mac OS X/i.test(navigator.userAgent)) return 'darwin'
    if (/Linux/i.test(navigator.userAgent)) return 'linux'
    return 'win32'
}

function createInitialRuntimeInfo(): DevScopeWindowRuntimeInfo {
    const platform = inferClientPlatform()
    const policy = resolveZyraWindowChromePolicy(platform)
    return {
        platform,
        architecture: platform === 'browser' ? 'browser' : 'unknown',
        appVersion: '',
        electronVersion: platform === 'browser' ? null : 'unknown',
        isPackaged: false,
        nativeFrame: policy.nativeFrame,
        customWindowControls: policy.customWindowControls
    }
}

export function useWindowChrome() {
    const [runtime, setRuntime] = useState<DevScopeWindowRuntimeInfo>(createInitialRuntimeInfo)
    const [isMaximized, setIsMaximized] = useState(false)

    useEffect(() => {
        let active = true
        void window.devscope.window.getRuntimeInfo().then((value) => {
            if (active) setRuntime(value)
        }).catch(() => undefined)
        void window.devscope.window.isMaximized().then((value) => {
            if (active) setIsMaximized(value)
        }).catch(() => undefined)
        const unsubscribe = window.devscope.window.onMaximizedChange((value) => {
            if (active) setIsMaximized(value)
        })
        return () => {
            active = false
            unsubscribe()
        }
    }, [])

    const policy = useMemo(() => resolveZyraWindowChromePolicy(runtime.platform), [runtime.platform])
    return { runtime, policy, isMaximized }
}
