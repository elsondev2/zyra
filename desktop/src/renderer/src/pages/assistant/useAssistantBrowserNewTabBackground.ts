import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DevScopeBrowserBackgroundCategory, DevScopeBrowserBackgroundProviderStatus, DevScopeBrowserRemoteBackground } from '@shared/contracts/devscope-api'
import { useSettings } from '@/lib/settings'
import {
    ASSISTANT_BROWSER_BUILT_IN_BACKGROUNDS,
    chooseAssistantBrowserBuiltInBackground,
    filterAssistantBrowserBuiltInBackgrounds,
    type AssistantBrowserBackground
} from './assistant-browser-backgrounds'

let lastRemoteBackgroundId = ''

function chooseRemoteBackground(
    backgrounds: DevScopeBrowserRemoteBackground[],
    rotation: 'every-tab' | 'fixed',
    selectedId: string,
    nonce: number
): DevScopeBrowserRemoteBackground | null {
    if (backgrounds.length === 0) return null
    if (rotation === 'fixed') return backgrounds.find((background) => background.id === selectedId) || backgrounds[0]!
    const fresh = backgrounds.filter((background) => background.id !== lastRemoteBackgroundId)
    const pool = fresh.length > 0 ? fresh : backgrounds
    const selected = pool[Math.abs(nonce) % pool.length]!
    lastRemoteBackgroundId = selected.id
    return selected
}

export function useAssistantBrowserNewTabBackground() {
    const { settings, updateSettings } = useSettings()
    const [remoteBackgrounds, setRemoteBackgrounds] = useState<DevScopeBrowserRemoteBackground[]>([])
    const [remoteSearchResults, setRemoteSearchResults] = useState<DevScopeBrowserRemoteBackground[] | null>(null)
    const [providerStatus, setProviderStatus] = useState<DevScopeBrowserBackgroundProviderStatus | null>(null)
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [nonce, setNonce] = useState(() => Date.now() ^ Math.floor(Math.random() * 0x7fffffff))
    const trackedRef = useRef(new Set<string>())
    const remoteRequestRef = useRef(0)
    const category = settings.assistantBrowserNewTabBackgroundCategory
    const rotation = settings.assistantBrowserNewTabBackgroundRotation
    const selectedId = settings.assistantBrowserNewTabBackgroundId
    const mode = settings.assistantBrowserNewTabBackgroundMode

    const loadProviderStatus = useCallback(async () => {
        if (typeof window.devscope.getBrowserBackgroundProviderStatus !== 'function') return null
        const result = await window.devscope.getBrowserBackgroundProviderStatus()
        if (!result.success) throw new Error(result.error || 'Could not read Unsplash configuration.')
        return result.status
    }, [])

    const loadRemoteBackgrounds = useCallback(async (refresh = false, query = '') => {
        const requestId = ++remoteRequestRef.current
        setLoading(true)
        setError(null)
        try {
            const status = await loadProviderStatus()
            if (requestId !== remoteRequestRef.current) return
            if (status) setProviderStatus(status)
            if (!status?.unsplashConfigured) {
                setRemoteBackgrounds([])
                setRemoteSearchResults(null)
                return
            }
            const result = await window.devscope.getBrowserRemoteBackgrounds({ category, refresh, ...(query ? { query } : {}) })
            if (requestId !== remoteRequestRef.current) return
            if (!result.success) throw new Error(result.error || 'Unsplash backgrounds are unavailable right now.')
            if (query) setRemoteSearchResults(result.backgrounds)
            else {
                setRemoteBackgrounds(result.backgrounds)
                setRemoteSearchResults(null)
            }
            if (refresh) setNonce((current) => current + 1)
        } catch (nextError) {
            if (requestId !== remoteRequestRef.current) return
            const resolved = nextError instanceof Error ? nextError : new Error('Unsplash backgrounds are unavailable right now.')
            if (query) setRemoteSearchResults([])
            else setRemoteBackgrounds([])
            setError(resolved.message)
            throw resolved
        } finally {
            if (requestId === remoteRequestRef.current) setLoading(false)
        }
    }, [category, loadProviderStatus])

    useEffect(() => {
        if (mode !== 'unsplash') {
            remoteRequestRef.current += 1
            setLoading(false)
            return
        }
        void loadRemoteBackgrounds().catch(() => undefined)
        return () => {
            remoteRequestRef.current += 1
        }
    }, [loadRemoteBackgrounds, mode])

    const activeBackground = useMemo<AssistantBrowserBackground | null>(() => {
        if (mode === 'off') return null
        if (mode === 'unsplash') return chooseRemoteBackground(remoteBackgrounds, rotation, selectedId, nonce)
        return chooseAssistantBrowserBuiltInBackground({ category, rotation, selectedId: selectedId || String(nonce) })
    }, [category, mode, nonce, remoteBackgrounds, rotation, selectedId])

    useEffect(() => {
        if (!activeBackground || activeBackground.provider !== 'unsplash' || trackedRef.current.has(activeBackground.id)) return
        let cancelled = false
        let retryTimer = 0
        const track = async (attempt: number) => {
            try {
                const result = await window.devscope.trackBrowserRemoteBackground({ downloadLocation: activeBackground.downloadLocation })
                if (!result.success) throw new Error(result.error || 'Unsplash tracking failed.')
                if (!cancelled) trackedRef.current.add(activeBackground.id)
            } catch {
                if (!cancelled && attempt < 3) retryTimer = window.setTimeout(() => void track(attempt + 1), 500 * (2 ** attempt))
            }
        }
        void track(0)
        return () => {
            cancelled = true
            window.clearTimeout(retryTimer)
        }
    }, [activeBackground])

    const setMode = useCallback((nextMode: 'off' | 'built-in' | 'unsplash') => {
        updateSettings({ assistantBrowserNewTabBackgroundMode: nextMode })
    }, [updateSettings])

    const setCategory = useCallback((nextCategory: DevScopeBrowserBackgroundCategory) => {
        setRemoteSearchResults(null)
        updateSettings({
            assistantBrowserNewTabBackgroundCategory: nextCategory,
            assistantBrowserNewTabBackgroundId: '',
            assistantBrowserNewTabBackgroundRotation: 'every-tab'
        })
        setNonce((current) => current + 1)
    }, [updateSettings])

    const setRotation = useCallback((nextRotation: 'every-tab' | 'fixed') => {
        updateSettings({
            assistantBrowserNewTabBackgroundRotation: nextRotation,
            ...(nextRotation === 'fixed' && activeBackground ? { assistantBrowserNewTabBackgroundId: activeBackground.id } : {})
        })
    }, [activeBackground, updateSettings])

    const selectBackground = useCallback((background: AssistantBrowserBackground) => {
        if (background.provider === 'unsplash') {
            setRemoteBackgrounds((current) => [background, ...current.filter((candidate) => candidate.id !== background.id)])
        }
        updateSettings({
            assistantBrowserNewTabBackgroundMode: background.provider === 'built-in' ? 'built-in' : 'unsplash',
            assistantBrowserNewTabBackgroundCategory: background.category,
            assistantBrowserNewTabBackgroundRotation: 'fixed',
            assistantBrowserNewTabBackgroundId: background.id
        })
    }, [updateSettings])

    const changeBackground = useCallback(() => {
        const candidates: AssistantBrowserBackground[] = mode === 'unsplash'
            ? remoteBackgrounds
            : filterAssistantBrowserBuiltInBackgrounds(category)
        if (rotation === 'fixed') {
            if (candidates.length <= 1 && mode === 'unsplash') {
                void loadRemoteBackgrounds(true).catch(() => undefined)
                return
            }
            if (candidates.length > 1) {
                const currentIndex = candidates.findIndex((background) => background.id === activeBackground?.id)
                selectBackground(candidates[(currentIndex + 1 + candidates.length) % candidates.length]!)
            }
            return
        }
        if (mode === 'unsplash' && remoteBackgrounds.length <= 1) {
            void loadRemoteBackgrounds(true).catch(() => undefined)
            return
        }
        setNonce((current) => current + 1)
    }, [activeBackground?.id, category, loadRemoteBackgrounds, mode, remoteBackgrounds, rotation, selectBackground])

    const saveUnsplashAccessKey = useCallback(async (accessKey: string) => {
        const validation = await window.devscope.validateBrowserUnsplashAccessKey({ accessKey })
        if (!validation.success) throw new Error(validation.error || 'The Unsplash access key could not be verified.')
        const result = await window.devscope.secrets.updateBrowserIntegrationSecrets({ unsplashAccessKey: accessKey })
        if (!result.success) throw new Error(result.error || 'Could not save the Unsplash access key.')
        setProviderStatus(result.status)
        updateSettings({ assistantBrowserNewTabBackgroundMode: 'unsplash' })
        await loadRemoteBackgrounds(true)
    }, [loadRemoteBackgrounds, updateSettings])

    const removeUnsplashAccessKey = useCallback(async () => {
        const result = await window.devscope.secrets.updateBrowserIntegrationSecrets({ unsplashAccessKey: '', confirmClear: true })
        if (!result.success) throw new Error(result.error || 'Could not remove the Unsplash access key.')
        remoteRequestRef.current += 1
        setProviderStatus(result.status)
        setRemoteBackgrounds([])
        setRemoteSearchResults(null)
        setError(null)
        updateSettings({ assistantBrowserNewTabBackgroundMode: 'built-in', assistantBrowserNewTabBackgroundId: '' })
    }, [updateSettings])

    const visibleBackgrounds = mode === 'unsplash'
        ? remoteSearchResults ?? remoteBackgrounds
        : category === 'all'
            ? ASSISTANT_BROWSER_BUILT_IN_BACKGROUNDS
            : filterAssistantBrowserBuiltInBackgrounds(category)

    return {
        mode,
        category,
        rotation,
        activeBackground,
        visibleBackgrounds,
        providerStatus,
        loading,
        error,
        setMode,
        setCategory,
        setRotation,
        selectBackground,
        changeBackground,
        refreshRemote: () => loadRemoteBackgrounds(true),
        searchRemote: (query: string) => loadRemoteBackgrounds(false, query.trim()),
        saveUnsplashAccessKey,
        removeUnsplashAccessKey
    }
}

export type AssistantBrowserNewTabBackgroundController = ReturnType<typeof useAssistantBrowserNewTabBackground>
