import { useEffect, useMemo, useSyncExternalStore } from 'react'
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

type WindowChromeSnapshot = {
    runtime: DevScopeWindowRuntimeInfo
    isMaximized: boolean
}

let snapshot: WindowChromeSnapshot = {
    runtime: createInitialRuntimeInfo(),
    isMaximized: false
}
let runtimeLoaded = false
let retainCount = 0
let unsubscribeMaximized: (() => void) | null = null
const listeners = new Set<() => void>()

function emit(next: Partial<WindowChromeSnapshot>): void {
    const runtime = next.runtime || snapshot.runtime
    const isMaximized = next.isMaximized ?? snapshot.isMaximized
    if (runtime === snapshot.runtime && isMaximized === snapshot.isMaximized) return
    snapshot = { runtime, isMaximized }
    for (const listener of listeners) listener()
}

function subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function startWindowChromeRuntime(): void {
    if (!runtimeLoaded) {
        runtimeLoaded = true
        void window.devscope.window.getRuntimeInfo().then((runtime) => emit({ runtime })).catch(() => {
            runtimeLoaded = false
        })
    }
    void window.devscope.window.isMaximized().then((isMaximized) => emit({ isMaximized })).catch(() => undefined)
    if (!unsubscribeMaximized) {
        unsubscribeMaximized = window.devscope.window.onMaximizedChange((isMaximized) => emit({ isMaximized }))
    }
}

function retainWindowChromeRuntime(): () => void {
    retainCount += 1
    if (retainCount === 1) startWindowChromeRuntime()
    return () => {
        retainCount = Math.max(0, retainCount - 1)
        if (retainCount > 0) return
        unsubscribeMaximized?.()
        unsubscribeMaximized = null
    }
}

export function useWindowChrome() {
    useEffect(retainWindowChromeRuntime, [])
    const current = useSyncExternalStore(subscribe, () => snapshot, () => snapshot)
    const policy = useMemo(() => resolveZyraWindowChromePolicy(current.runtime.platform), [current.runtime.platform])
    return { runtime: current.runtime, policy, isMaximized: current.isMaximized }
}
