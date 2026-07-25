import { createElement, forwardRef, memo, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { DevScopeBrowserPreviewConfig } from '@shared/contracts/devscope-api'
import { normalizeAssistantBrowserFaviconUrl, type AssistantBrowserTabState } from './assistant-browser-workspace-state'

export type AssistantBrowserWebviewHandle = {
    navigate: (url: string) => Promise<void>
    goBack: () => void
    goForward: () => void
    reload: () => void
    stop: () => void
    focus: () => void
}

type BrowserWebviewElement = HTMLElement & {
    src: string
    loadURL: (url: string) => Promise<void>
    getURL: () => string
    getTitle: () => string
    canGoBack: () => boolean
    canGoForward: () => boolean
    goBack: () => void
    goForward: () => void
    reload: () => void
    stop: () => void
    focus: () => void
    isCurrentlyAudible: () => boolean
}

type BrowserWebviewEvent = Event & {
    url?: string
    title?: string
    errorCode?: number
    errorDescription?: string
    validatedURL?: string
    isMainFrame?: boolean
    isInPlace?: boolean
    favicons?: string[]
}

type BrowserStatePatch = Partial<Omit<AssistantBrowserTabState, 'id'>>

export const AssistantBrowserWebview = memo(forwardRef<AssistantBrowserWebviewHandle, {
    tab: AssistantBrowserTabState
    config: DevScopeBrowserPreviewConfig
    active: boolean
    onStateChange: (tabId: string, patch: BrowserStatePatch) => void
}>(function AssistantBrowserWebview({ tab, config, active, onStateChange }, forwardedRef) {
    const [webview, setWebview] = useState<BrowserWebviewElement | null>(null)
    const onStateChangeRef = useRef(onStateChange)
    const tabTitleRef = useRef(tab.title)
    const initialUrlRef = useRef(tab.url || 'about:blank')
    onStateChangeRef.current = onStateChange
    tabTitleRef.current = tab.title
    const setWebviewRef = useCallback((node: BrowserWebviewElement | null) => {
        setWebview((current) => current === node ? current : node)
    }, [])

    useImperativeHandle(forwardedRef, () => ({
        navigate: async (url: string) => {
            if (!webview) throw new Error('Browser view is not ready yet.')
            onStateChangeRef.current(tab.id, { url, status: 'loading', error: null })
            await webview.loadURL(url)
        },
        goBack: () => {
            if (!webview?.canGoBack()) return
            onStateChangeRef.current(tab.id, { status: 'loading', error: null })
            webview.goBack()
        },
        goForward: () => {
            if (!webview?.canGoForward()) return
            onStateChangeRef.current(tab.id, { status: 'loading', error: null })
            webview.goForward()
        },
        reload: () => {
            if (!webview) return
            onStateChangeRef.current(tab.id, { status: 'loading', error: null })
            webview.reload()
        },
        stop: () => webview?.stop(),
        focus: () => webview?.focus()
    }), [tab.id, webview])

    useEffect(() => {
        if (!webview) return

        const readNavigation = (): Pick<AssistantBrowserTabState, 'url' | 'title' | 'canGoBack' | 'canGoForward'> => {
            const url = webview.getURL()
            return {
                url: url === 'about:blank' ? '' : url,
                title: webview.getTitle() || tabTitleRef.current,
                canGoBack: webview.canGoBack(),
                canGoForward: webview.canGoForward()
            }
        }
        const report = (patch: BrowserStatePatch) => {
            try {
                onStateChangeRef.current(tab.id, { ...readNavigation(), ...patch })
            } catch {
                onStateChangeRef.current(tab.id, patch)
            }
        }
        let audibleSyncTimer = 0
        let mainFrameFailed = false
        const syncAudible = () => {
            window.clearTimeout(audibleSyncTimer)
            const readAudible = () => {
                try {
                    report({ audible: webview.isCurrentlyAudible() })
                } catch {
                    report({ audible: false })
                }
            }
            readAudible()
            audibleSyncTimer = window.setTimeout(readAudible, 120)
        }
        const handleStartNavigation = (event: Event) => {
            const navigation = event as BrowserWebviewEvent
            if (navigation.isMainFrame === false || navigation.isInPlace === true) return
            mainFrameFailed = false
            const eventUrl = navigation.url && navigation.url !== 'about:blank' ? navigation.url : null
            report({
                ...(eventUrl ? { url: eventUrl } : {}),
                status: navigation.url === 'about:blank' ? 'idle' : 'loading',
                error: null,
                audible: false,
                faviconUrl: null
            })
        }
        const handleStop = () => {
            if (mainFrameFailed) return
            report({ status: webview.getURL() === 'about:blank' ? 'idle' : 'ready', error: null })
            syncAudible()
        }
        const handleNavigate = (event: Event) => {
            const navigationEvent = event as BrowserWebviewEvent
            const eventUrl = navigationEvent.url && navigationEvent.url !== 'about:blank'
                ? navigationEvent.url
                : null
            report({
                ...(eventUrl ? { url: eventUrl } : {}),
                ...(navigationEvent.url === 'about:blank' ? { status: 'idle' as const, faviconUrl: null } : {}),
                error: null
            })
        }
        const handleTitle = (event: Event) => {
            const titleEvent = event as BrowserWebviewEvent
            if (titleEvent.title) report({ title: titleEvent.title })
        }
        const handleFavicon = (event: Event) => {
            const faviconEvent = event as BrowserWebviewEvent
            const faviconUrl = faviconEvent.favicons
                ?.map(normalizeAssistantBrowserFaviconUrl)
                .find((candidate): candidate is string => Boolean(candidate)) || null
            report({ faviconUrl })
        }
        const handleFailure = (event: Event) => {
            const failure = event as BrowserWebviewEvent
            if (failure.isMainFrame === false || failure.errorCode === -3) return
            mainFrameFailed = true
            report({
                ...(failure.validatedURL ? { url: failure.validatedURL } : {}),
                status: 'error',
                error: failure.errorDescription || 'The page could not be loaded.'
            })
        }
        const handleReady = () => {
            mainFrameFailed = false
            report({
                status: webview.getURL() === 'about:blank' ? 'idle' : 'ready',
                error: null
            })
            syncAudible()
        }
        const handleDomReady = () => syncAudible()

        webview.addEventListener('did-start-navigation', handleStartNavigation)
        webview.addEventListener('did-stop-loading', handleStop)
        webview.addEventListener('did-finish-load', handleReady)
        webview.addEventListener('did-navigate', handleNavigate)
        webview.addEventListener('did-navigate-in-page', handleNavigate)
        webview.addEventListener('page-title-updated', handleTitle)
        webview.addEventListener('page-favicon-updated', handleFavicon)
        webview.addEventListener('did-fail-load', handleFailure)
        webview.addEventListener('dom-ready', handleDomReady)
        webview.addEventListener('media-started-playing', syncAudible)
        webview.addEventListener('media-paused', syncAudible)
        return () => {
            window.clearTimeout(audibleSyncTimer)
            webview.removeEventListener('did-start-navigation', handleStartNavigation)
            webview.removeEventListener('did-stop-loading', handleStop)
            webview.removeEventListener('did-finish-load', handleReady)
            webview.removeEventListener('did-navigate', handleNavigate)
            webview.removeEventListener('did-navigate-in-page', handleNavigate)
            webview.removeEventListener('page-title-updated', handleTitle)
            webview.removeEventListener('page-favicon-updated', handleFavicon)
            webview.removeEventListener('did-fail-load', handleFailure)
            webview.removeEventListener('dom-ready', handleDomReady)
            webview.removeEventListener('media-started-playing', syncAudible)
            webview.removeEventListener('media-paused', syncAudible)
        }
    }, [tab.id, webview])

    useEffect(() => {
        if (active) webview?.focus()
    }, [active, webview])

    return createElement('webview', {
        ref: setWebviewRef,
        src: initialUrlRef.current,
        partition: config.partition,
        webpreferences: config.webPreferences,
        className: 'absolute inset-0 flex h-full w-full bg-white',
        style: {
            visibility: active ? 'visible' : 'hidden',
            pointerEvents: active ? 'auto' : 'none',
            zIndex: active ? 1 : 0
        },
        'aria-hidden': active ? undefined : true,
        'data-assistant-browser-webview': tab.id
    } as never)
}))
