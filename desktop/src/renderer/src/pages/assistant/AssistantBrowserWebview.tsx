import { createElement, forwardRef, memo, useCallback, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import type { DevScopeBrowserGuestTargetInput, DevScopeBrowserPreviewConfig } from '@shared/contracts/devscope-api'
import { dismissTransientMenus } from '@/lib/transient-menu'
import { normalizeAssistantBrowserFaviconUrl, type AssistantBrowserTabState } from './assistant-browser-workspace-state'

export type AssistantBrowserWebviewHandle = {
    navigate: (url: string) => Promise<void>
    goBack: () => void
    goForward: () => void
    reload: () => void
    stop: () => void
    getDeveloperTarget: () => DevScopeBrowserGuestTargetInput
    getViewportSize: () => { width: number; height: number }
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
    isCurrentlyAudible: () => boolean
    getWebContentsId: () => number
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
    threadId: string
    config: DevScopeBrowserPreviewConfig
    visible: boolean
    placement: 'full' | 'primary' | 'secondary'
    onStateChange: (tabId: string, patch: BrowserStatePatch) => void
    onControlTargetChange: (tabId: string, targetId: string | null) => void
    onViewportRectChange: (tabId: string, rect: { x: number; y: number; width: number; height: number } | null) => void
}>(function AssistantBrowserWebview({ tab, threadId, config, visible, placement, onStateChange, onControlTargetChange, onViewportRectChange }, forwardedRef) {
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
        getDeveloperTarget: () => {
            if (!webview) throw new Error('Browser view is not ready yet.')
            const guestWebContentsId = webview.getWebContentsId()
            if (!Number.isInteger(guestWebContentsId) || guestWebContentsId <= 0) {
                throw new Error('Browser guest is not attached yet.')
            }
            return { guestWebContentsId, tabId: tab.id }
        },
        getViewportSize: () => {
            if (!webview) return { width: 1, height: 1 }
            const rect = webview.getBoundingClientRect()
            return { width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }
        }
    }), [tab.id, webview])

    useLayoutEffect(() => {
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
        let controlBindRetryTimer = 0
        let controlBindAttempts = 0
        let controlBinding = false
        let controlTargetId: string | null = null
        let disposed = false
        let mainFrameFailed = false
        const bindControlTarget = () => {
            if (disposed || controlBinding || controlTargetId) return
            controlBindAttempts += 1
            let guestWebContentsId = 0
            try {
                guestWebContentsId = webview.getWebContentsId()
            } catch {
                // The guest may not be attached during the first layout pass.
            }
            if (!Number.isInteger(guestWebContentsId) || guestWebContentsId <= 0) {
                scheduleControlBindRetry()
                return
            }
            controlBinding = true
            void window.devscope.agentControl.bindBrowserTab({ guestWebContentsId, tabId: tab.id, threadId }).then((result) => {
                controlBinding = false
                if (disposed) return
                if (result.success) {
                    controlTargetId = result.target.targetId
                    onControlTargetChange(tab.id, controlTargetId)
                    return
                }
                scheduleControlBindRetry()
            }).catch(() => {
                controlBinding = false
                if (!disposed) scheduleControlBindRetry()
            })
        }
        const scheduleControlBindRetry = () => {
            if (disposed || controlTargetId || controlBindAttempts >= 6 || controlBindRetryTimer) {
                if (!disposed && !controlTargetId && controlBindAttempts >= 6) onControlTargetChange(tab.id, null)
                return
            }
            controlBindRetryTimer = window.setTimeout(() => {
                controlBindRetryTimer = 0
                bindControlTarget()
            }, controlBindAttempts === 0 ? 50 : Math.min(800, 100 * (2 ** (controlBindAttempts - 1))))
        }
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
        const handleDomReady = () => {
            syncAudible()
            bindControlTarget()
        }
        const handleAttach = () => bindControlTarget()
        const handleGuestFocus = () => dismissTransientMenus()

        webview.addEventListener('focus', handleGuestFocus)
        webview.addEventListener('did-attach', handleAttach)
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
        scheduleControlBindRetry()
        return () => {
            disposed = true
            window.clearTimeout(audibleSyncTimer)
            window.clearTimeout(controlBindRetryTimer)
            webview.removeEventListener('focus', handleGuestFocus)
            webview.removeEventListener('did-attach', handleAttach)
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
            onControlTargetChange(tab.id, null)
        }
    }, [onControlTargetChange, tab.id, threadId, webview])

    useLayoutEffect(() => {
        if (!webview || !visible) {
            onViewportRectChange(tab.id, null)
            return
        }
        const report = () => {
            const rect = webview.getBoundingClientRect()
            onViewportRectChange(tab.id, {
                x: Math.max(0, rect.left),
                y: Math.max(0, rect.top),
                width: Math.max(1, rect.width),
                height: Math.max(1, rect.height)
            })
        }
        report()
        const observer = new ResizeObserver(report)
        observer.observe(webview)
        window.addEventListener('resize', report)
        return () => {
            observer.disconnect()
            window.removeEventListener('resize', report)
            onViewportRectChange(tab.id, null)
        }
    }, [onViewportRectChange, placement, tab.id, visible, webview])


    return createElement('webview', {
        ref: setWebviewRef,
        src: initialUrlRef.current,
        partition: config.partition,
        webpreferences: config.webPreferences,
        className: 'absolute bottom-0 top-0 flex h-full bg-white',
        style: {
            left: placement === 'secondary' ? '50%' : 0,
            right: placement === 'primary' ? '50%' : 0,
            width: placement === 'full' ? '100%' : '50%',
            visibility: 'visible',
            pointerEvents: visible ? 'auto' : 'none',
            zIndex: visible ? 1 : 0
        },
        'aria-hidden': visible ? undefined : true,
        'data-assistant-browser-webview': tab.id
    } as never)
}))
