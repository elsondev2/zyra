import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Copy,
    Ellipsis,
    Globe2,
    LoaderCircle,
    Minus,
    RefreshCw,
    Square,
    X
} from 'lucide-react'
import type { BrowserPopupCommand, BrowserPopupState } from '@shared/browser-popup'
import { resolveBrowserShortcut, type BrowserShortcutPlatform } from '@shared/browser-shortcuts'
import { cn } from '@/lib/utils'
import { useWindowChrome } from '@/lib/useWindowChrome'
import { normalizeAssistantBrowserNavigation } from './assistant-browser-workspace-state'
import { AssistantBrowserDownloadsButton } from './AssistantBrowserDownloadsButton'

const EMPTY_POPUP_STATE: BrowserPopupState = {
    title: 'Browser window',
    url: '',
    loading: true,
    canGoBack: false,
    canGoForward: false,
    audible: false,
    fullscreen: false,
    profileShared: true
}

const toolbarButtonClass = 'inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[color-mix(in_srgb,var(--color-text)_58%,transparent)] transition-colors hover:bg-[var(--surface-hover)] hover:text-[var(--color-text)] disabled:pointer-events-none disabled:opacity-25'
const windowControlClass = 'inline-flex h-[34px] w-10 items-center justify-center text-sparkle-text-secondary/75 transition-colors hover:text-sparkle-text'

function popupShortcutPlatform(): BrowserShortcutPlatform {
    return /mac|iphone|ipad|ipod/i.test(navigator.platform) ? 'darwin' : /win/i.test(navigator.platform) ? 'win32' : 'linux'
}

export function AssistantBrowserPopupWindow() {
    const { runtime, policy, isMaximized } = useWindowChrome()
    const inputRef = useRef<HTMLInputElement | null>(null)
    const browserDownloadsApi = useMemo(() => ({
        list: () => window.devscope.browserPopup.listDownloads(),
        act: (action: Parameters<typeof window.devscope.browserPopup.actOnDownload>[0]) => window.devscope.browserPopup.actOnDownload(action),
        subscribe: (callback: Parameters<typeof window.devscope.browserPopup.onDownloadsChanged>[0]) => window.devscope.browserPopup.onDownloadsChanged(callback)
    }), [])
    const inputFocusedRef = useRef(false)
    const [state, setState] = useState<BrowserPopupState>(EMPTY_POPUP_STATE)
    const [addressValue, setAddressValue] = useState('')
    const [addressError, setAddressError] = useState<string | null>(null)
    const isMac = runtime.platform === 'darwin'

    useEffect(() => {
        let disposed = false
        void window.devscope.browserPopup.getState().then((result) => {
            if (disposed || !result.success) return
            setState(result.state)
            setAddressValue(result.state.url)
        }).catch(() => undefined)
        const unsubscribeState = window.devscope.browserPopup.onStateChange((nextState) => {
            if (disposed) return
            setState(nextState)
            if (!inputFocusedRef.current) setAddressValue(nextState.url)
        })
        const unsubscribeFocus = window.devscope.browserPopup.onFocusAddress(() => {
            inputRef.current?.focus()
            inputRef.current?.select()
        })
        return () => {
            disposed = true
            unsubscribeState()
            unsubscribeFocus()
        }
    }, [])

    const command = useCallback((input: BrowserPopupCommand) => {
        void window.devscope.browserPopup.command(input).then((result) => {
            if (!result.success) {
                setAddressError(result.error)
                return
            }
            setState(result.state)
            if (!inputFocusedRef.current) setAddressValue(result.state.url)
        }).catch((error: unknown) => {
            setAddressError(error instanceof Error ? error.message : 'The Browser window command failed.')
        })
    }, [])

    useEffect(() => {
        const handleShortcut = (event: KeyboardEvent) => {
            if (event.defaultPrevented) return
            if (event.key === 'Escape' && state.fullscreen) {
                event.preventDefault()
                command({ type: 'toggle-fullscreen' })
                return
            }
            const action = resolveBrowserShortcut({
                type: event.type,
                key: event.key,
                control: event.ctrlKey,
                meta: event.metaKey,
                shift: event.shiftKey,
                alt: event.altKey
            }, popupShortcutPlatform())
            if (!action) return
            event.preventDefault()
            command({ type: 'shortcut', action })
        }
        window.addEventListener('keydown', handleShortcut, true)
        return () => window.removeEventListener('keydown', handleShortcut, true)
    }, [command, state.fullscreen])

    const submitAddress = () => {
        const target = normalizeAssistantBrowserNavigation(addressValue)
        if (!target.success) {
            setAddressError(target.error)
            return
        }
        setAddressError(null)
        inputRef.current?.blur()
        command({ type: 'navigate', url: target.url })
    }

    if (state.fullscreen) return <div className="h-screen bg-black" />

    return (
        <div className="h-screen overflow-hidden bg-sparkle-bg text-sparkle-text">
            <header
                className="zyra-topbar-surface flex h-[34px] items-center border-b border-[var(--surface-panel-divider)]"
                style={{ WebkitAppRegion: 'drag' } as any}
            >
                <div className="flex h-full w-[112px] shrink-0 items-center px-2.5" style={{ paddingLeft: isMac ? 76 : 10 }}>
                    <span className="text-[12px] font-semibold text-sparkle-text-secondary">Zyra</span>
                </div>
                <div className="min-w-0 flex-1 truncate px-3 text-center text-[11px] font-medium text-sparkle-text-muted/80">
                    {state.title}
                </div>
                <div className="flex h-full w-[112px] shrink-0 items-center justify-end" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    {policy.customWindowControls ? (
                        <>
                            <button type="button" onClick={() => window.devscope.window.minimize()} className={cn(windowControlClass, 'hover:bg-[var(--surface-hover)]')} aria-label="Minimize"><Minus size={14} /></button>
                            <button type="button" onClick={() => window.devscope.window.maximize()} className={cn(windowControlClass, 'hover:bg-[var(--surface-hover)]')} aria-label={isMaximized ? 'Restore window' : 'Maximize window'}>{isMaximized ? <Copy size={12} /> : <Square size={12} />}</button>
                            <button type="button" onClick={() => window.devscope.window.close()} className={cn(windowControlClass, 'hover:bg-red-600 hover:text-white')} aria-label="Close"><X size={14} /></button>
                        </>
                    ) : null}
                </div>
            </header>

            <form
                className="flex h-10 items-center gap-1 border-b border-[var(--surface-divider)] bg-sparkle-bg px-2"
                onSubmit={(event) => {
                    event.preventDefault()
                    submitAddress()
                }}
            >
                <button type="button" onClick={() => command({ type: 'back' })} disabled={!state.canGoBack} className={toolbarButtonClass} title="Back" aria-label="Back"><ArrowLeft size={14} /></button>
                <button type="button" onClick={() => command({ type: 'forward' })} disabled={!state.canGoForward} className={toolbarButtonClass} title="Forward" aria-label="Forward"><ArrowRight size={14} /></button>
                <button type="button" onClick={() => command({ type: state.loading ? 'stop' : 'reload' })} className={toolbarButtonClass} title={state.loading ? 'Stop' : 'Reload'} aria-label={state.loading ? 'Stop' : 'Reload'}>{state.loading ? <X size={13} /> : <RefreshCw size={13} />}</button>

                <div className={cn(
                    'flex h-7 min-w-0 flex-1 items-center gap-1.5 rounded-[13px] border px-2 transition-colors',
                    addressError
                        ? 'border-red-400/35 bg-red-400/[0.04]'
                        : 'border-[color-mix(in_srgb,var(--color-text)_10%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_94%,var(--color-bg))] focus-within:border-[color-mix(in_srgb,var(--accent-primary)_48%,transparent)]'
                )}>
                    {state.loading ? <LoaderCircle size={11} className="shrink-0 animate-spin text-[var(--accent-primary)]" /> : <Globe2 size={11} className="shrink-0 text-sparkle-text-muted/55" />}
                    <input
                        ref={inputRef}
                        value={addressValue}
                        onChange={(event) => {
                            setAddressValue(event.target.value)
                            setAddressError(null)
                        }}
                        onFocus={(event) => {
                            inputFocusedRef.current = true
                            event.currentTarget.select()
                        }}
                        onBlur={() => {
                            inputFocusedRef.current = false
                            if (!addressError) setAddressValue(state.url)
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== 'Escape') return
                            setAddressValue(state.url)
                            setAddressError(null)
                            event.currentTarget.blur()
                        }}
                        className="min-w-0 flex-1 bg-transparent text-[11px] text-[var(--color-text)] outline-none"
                        aria-label="Browser address"
                        spellCheck={false}
                        title={addressError || state.url}
                    />
                    {state.profileShared ? <CheckCircle2 size={11} className="shrink-0 text-emerald-300/75" aria-label="Uses the shared Zyra Browser profile" /> : null}
                </div>

                <AssistantBrowserDownloadsButton api={browserDownloadsApi} />
                <button type="button" onClick={() => command({ type: 'show-menu' })} className={toolbarButtonClass} title="Browser window menu" aria-label="Browser window menu"><Ellipsis size={15} /></button>
            </form>
        </div>
    )
}
