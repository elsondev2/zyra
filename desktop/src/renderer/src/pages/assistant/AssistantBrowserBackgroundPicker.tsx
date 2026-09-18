import { openDesktopLink } from '@/lib/desktop-links'
import { AnchoredNativeOverlay } from '@/components/ui/AnchoredNativeOverlay'
import { getOverlayActiveElement } from '@/components/ui/native-overlay-portal'
import { addOverlayEventListener } from '@/components/ui/native-overlay-portal'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Check, Image, ImageOff, LoaderCircle, LockKeyhole, RefreshCw, Search, Shuffle, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
    ASSISTANT_BROWSER_BACKGROUND_CATEGORIES,
    remoteBackgroundAttribution
} from './assistant-browser-backgrounds'
import type { AssistantBrowserNewTabBackgroundController } from './useAssistantBrowserNewTabBackground'

export function AssistantBrowserBackgroundPicker({
    controller,
    onClose
}: {
    controller: AssistantBrowserNewTabBackgroundController
    onClose: () => void
}) {
    const dialogRef = useRef<HTMLElement | null>(null)
    const closingRef = useRef(false)
    const closeTimerRef = useRef(0)
    const [accessKey, setAccessKey] = useState('')
    const [savingKey, setSavingKey] = useState(false)
    const [keyError, setKeyError] = useState<string | null>(null)
    const [closing, setClosing] = useState(false)
    const [unsplashSettingsOpen, setUnsplashSettingsOpen] = useState(false)
    const [unsplashQuery, setUnsplashQuery] = useState('')

    const exit = useCallback(() => {
        if (closingRef.current) return
        closingRef.current = true
        setClosing(true)
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220
        closeTimerRef.current = window.setTimeout(onClose, duration)
    }, [onClose])

    useEffect(() => {
        const previous = getOverlayActiveElement()
        dialogRef.current?.focus()
        const handleKeyDown = (event: KeyboardEvent) => {
            if (!dialogRef.current || (!event.composedPath().includes(dialogRef.current) && event.target !== dialogRef.current.ownerDocument)) return
            if (event.key === 'Escape') {
                event.preventDefault()
                exit()
                return
            }
            if (event.key !== 'Tab' || !dialogRef.current) return
            const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')].filter(element => element.tabIndex >= 0)
            if (focusable.length === 0) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && getOverlayActiveElement() === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && getOverlayActiveElement() === last) {
                event.preventDefault()
                first.focus()
            }
        }
        const removeOverlayListener1 = addOverlayEventListener('keydown', handleKeyDown)
        return () => {
            removeOverlayListener1()
            if (dialogRef.current?.contains(getOverlayActiveElement())) {
                window.requestAnimationFrame(() => previous?.isConnected && previous.focus())
            }
        }
    }, [exit])

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

    const saveKey = async () => {
        if (!accessKey.trim() || savingKey) return
        setSavingKey(true)
        setKeyError(null)
        try {
            await controller.saveUnsplashAccessKey(accessKey.trim())
            setAccessKey('')
            setUnsplashSettingsOpen(false)
        } catch (error) {
            setKeyError(error instanceof Error ? error.message : 'Could not save the Unsplash access key.')
        } finally {
            setSavingKey(false)
        }
    }

    const removeKey = async () => {
        if (savingKey) return
        setSavingKey(true)
        setKeyError(null)
        try {
            await controller.removeUnsplashAccessKey()
            setAccessKey('')
            setUnsplashSettingsOpen(false)
        } catch (error) {
            setKeyError(error instanceof Error ? error.message : 'Could not remove the Unsplash access key.')
        } finally {
            setSavingKey(false)
        }
    }

    const searchUnsplash = () => {
        const query = unsplashQuery.trim()
        if (!query || controller.loading) return
        void controller.searchRemote(query).catch(() => undefined)
    }

    const clearUnsplashSearch = () => {
        setUnsplashQuery('')
        void controller.searchRemote('').catch(() => undefined)
    }

    const unsplashConfigured = controller.providerStatus?.unsplashConfigured === true
    const showUnsplashSettings = controller.mode === 'unsplash'
        && controller.providerStatus
        && (!unsplashConfigured || unsplashSettingsOpen)

    return (
        <AnchoredNativeOverlay scoped><div className="absolute inset-0 z-[90] overflow-hidden">
            <section ref={dialogRef} data-native-overlay-autofocus tabIndex={-1} role="dialog" aria-modal="false" aria-label="New Tab backgrounds" className={cn('absolute bottom-3 right-3 top-3 flex w-[min(440px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-[var(--surface-divider)] bg-[var(--color-card)] text-sparkle-text shadow-[0_16px_48px_rgba(0,0,0,0.20)] outline-none transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', closing ? 'translate-x-[calc(100%+16px)]' : 'translate-x-0 animate-[assistant-browser-history-panel-in_180ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none')}>
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] px-3">
                    <Image size={14} className="text-[var(--accent-primary)]/85" />
                    <h3 className="text-[12px] font-semibold text-sparkle-text">Backgrounds</h3>
                    <div className="ml-auto flex items-center gap-1">
                        {controller.mode === 'unsplash' && unsplashConfigured ? <button type="button" onClick={() => setUnsplashSettingsOpen((current) => !current)} aria-expanded={unsplashSettingsOpen} className={cn('inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]', unsplashSettingsOpen && 'bg-[var(--surface-hover)] text-sparkle-text')} title="Manage Unsplash access key" aria-label="Manage Unsplash access key"><SlidersHorizontal size={13} /></button> : null}
                        <button type="button" onClick={exit} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]" aria-label="Close background picker"><X size={14} /></button>
                    </div>
                </header>

                <div className="shrink-0 border-b border-[var(--surface-divider)] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="flex h-9 w-full items-center gap-1" role="tablist" aria-label="Background source" onKeyDown={(event) => {
                            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
                            const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')]
                            const index = tabs.indexOf(event.target as HTMLButtonElement)
                            if (index < 0) return
                            event.preventDefault()
                            const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length
                            tabs[next]?.click()
                            tabs[next]?.focus()
                        }}>
                            {([
                                { mode: 'built-in' as const, label: 'Included' },
                                { mode: 'unsplash' as const, label: 'Unsplash' },
                                { mode: 'off' as const, label: 'None' }
                            ]).map((option) => (
                                <button key={option.mode} type="button" role="tab" aria-selected={controller.mode === option.mode} tabIndex={controller.mode === option.mode ? 0 : -1} onClick={() => controller.setMode(option.mode)} className={cn('h-8 flex-1 rounded-md px-2.5 text-[11px] font-medium transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]', controller.mode === option.mode ? 'bg-[var(--surface-hover)] text-sparkle-text' : 'text-sparkle-text-muted')}>{option.label}</button>
                            ))}
                        </div>

                        {controller.mode !== 'off' ? (
                            <>
                                <label className="sr-only" htmlFor="new-tab-background-category">Background category</label>
                                <select id="new-tab-background-category" value={controller.category} onChange={(event) => { setUnsplashQuery(''); controller.setCategory(event.target.value as typeof controller.category) }} className="h-8 min-w-0 w-full rounded-md border border-[var(--surface-divider)] bg-[var(--color-card)] px-2 text-[11px] text-sparkle-text outline-none focus:border-[var(--accent-primary)]">
                                    {ASSISTANT_BROWSER_BACKGROUND_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.id === 'all' ? 'All collections' : category.label}</option>)}
                                </select>
                            </>
                        ) : null}
                    </div>

                    {controller.mode === 'unsplash' && unsplashConfigured ? (
                        <form className="mt-2 flex h-9 items-center gap-1.5 rounded-md border border-[var(--surface-divider)] px-2 focus-within:border-[var(--accent-primary)]" onSubmit={(event) => { event.preventDefault(); searchUnsplash() }}>
                            <Search size={12} className="shrink-0 text-sparkle-text-muted" />
                            <input type="text" inputMode="search" value={unsplashQuery} onChange={(event) => setUnsplashQuery(event.target.value)} className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[11px] text-sparkle-text outline-none placeholder:text-sparkle-text-muted" placeholder="Search Unsplash or paste a photo link" aria-label="Search Unsplash backgrounds" />
                            {unsplashQuery ? <button type="button" onClick={clearUnsplashSearch} className="inline-flex size-7 items-center justify-center rounded-[5px] text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Clear Unsplash search"><X size={11} /></button> : null}
                            <button type="submit" disabled={!unsplashQuery.trim() || controller.loading} className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent-primary)]/14 px-2.5 text-[10px] font-semibold text-sparkle-text transition-colors hover:bg-[var(--accent-primary)]/20 disabled:opacity-40">{controller.loading ? <LoaderCircle size={10} className="animate-spin" /> : <Search size={10} />}Search</button>
                        </form>
                    ) : null}

                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
                    {showUnsplashSettings ? (
                        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-[var(--surface-divider)] p-3">
                            <div className="min-w-32 flex-1">
                                <p className="text-[10px] font-medium text-sparkle-text-secondary">{unsplashConfigured ? 'Replace access key' : 'Connect Unsplash'}</p>
                                <p className="text-[10px] text-sparkle-text-muted">Encrypted on this device.</p>
                            </div>
                            <input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveKey() }} className="h-8 min-w-44 flex-[2] rounded-[6px] border border-[var(--surface-divider)] bg-transparent px-2.5 text-[10px] text-sparkle-text-secondary outline-none focus:border-[var(--accent-primary)]/40" placeholder="Unsplash Access Key" aria-label={unsplashConfigured ? 'Replacement Unsplash Access Key' : 'Unsplash Access Key'} autoComplete="off" />
                            {unsplashConfigured ? <button type="button" onClick={() => void removeKey()} disabled={savingKey} className="h-8 rounded-[5px] px-2 text-[10px] text-red-300/80 transition-colors hover:bg-red-400/[0.07] hover:text-red-200 disabled:opacity-40">Remove</button> : null}
                            <button type="button" onClick={() => void saveKey()} disabled={!accessKey.trim() || savingKey} className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent-primary)]/14 px-3 text-[10px] font-semibold text-sparkle-text transition-colors hover:bg-[var(--accent-primary)]/20 disabled:opacity-40">{savingKey ? <LoaderCircle size={10} className="animate-spin" /> : null}{unsplashConfigured ? 'Replace' : 'Connect'}</button>
                            {keyError ? <p className="basis-full text-[10px] text-red-300">{keyError}</p> : null}
                        </div>
                    ) : null}
                    {controller.loading ? (
                        <div className="flex min-h-36 items-center justify-center gap-2 text-[10px] text-sparkle-text-muted"><LoaderCircle size={13} className="animate-spin" />Loading backgrounds…</div>
                    ) : controller.error ? (
                        <div role="status" className="flex min-h-28 items-center justify-center px-4 text-center text-[10px] text-red-200">{controller.error}</div>
                    ) : controller.mode === 'off' ? (
                        <div className="flex min-h-48 flex-col items-center justify-center text-center">
                            <ImageOff size={20} className="text-sparkle-text-muted/45" />
                            <p className="mt-2 text-[11px] font-medium text-sparkle-text-secondary">No background image</p>
                            <p className="mt-1 text-[10px] text-sparkle-text-muted/55">New tabs use the app background.</p>
                            <button type="button" onClick={() => controller.setMode('built-in')} className="mt-3 h-8 rounded-[5px] bg-[var(--surface-hover)] px-3 text-[10px] font-medium text-sparkle-text-secondary transition-colors hover:text-sparkle-text">Browse included images</button>
                        </div>
                    ) : controller.visibleBackgrounds.length === 0 ? (
                        <div className="flex min-h-36 items-center justify-center text-center text-[10px] text-sparkle-text-muted/60">{controller.mode === 'unsplash' && !unsplashConfigured ? 'Connect Unsplash to browse photos.' : 'No images in this category.'}</div>
                    ) : (
                        <div className="grid gap-x-3 gap-y-4 [grid-template-columns:repeat(auto-fit,minmax(min(100%,170px),1fr))]">
                            {controller.visibleBackgrounds.map((background) => {
                                const selected = controller.activeBackground?.id === background.id
                                const credit = background.provider === 'built-in' ? background.attributionText : remoteBackgroundAttribution(background)
                                const title = background.provider === 'built-in' ? background.title : background.alt || 'Unsplash photo'
                                const detail = background.provider === 'built-in' ? background.categoryLabel : background.photographer
                                return (
                                    <div key={`${background.provider}:${background.id}`} className="min-w-0">
                                        <button type="button" onClick={() => controller.selectBackground(background)} className="group block w-full min-w-0 rounded-md text-left outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]" aria-pressed={selected} title={credit}>
                                            <span className="relative block aspect-[16/10] overflow-hidden rounded-md bg-[var(--surface-hover)]">
                                                <img src={background.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-200 ease-out group-hover:scale-[1.025] motion-reduce:transition-none" />
                                                <span className={cn('pointer-events-none absolute inset-0 rounded-md ring-inset transition-shadow', selected ? 'ring-2 ring-[var(--accent-primary)]' : 'ring-1 ring-[var(--surface-divider)] group-hover:ring-[var(--accent-primary)]')} />
                                                {selected ? <span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-[5px] bg-[var(--accent-primary)] text-[var(--accent-contrast)] shadow" aria-hidden="true"><Check size={12} /></span> : null}
                                            </span>
                                            <span className="mt-2 block truncate text-[11px] font-medium text-sparkle-text">{title}</span>
                                        </button>
                                        {background.provider === 'unsplash' ? <span className="mt-0.5 block text-[10px] leading-relaxed text-sparkle-text-muted">Photo by <button type="button" onClick={() => void openDesktopLink(background.photographerUrl)} className="max-w-full truncate align-bottom hover:text-sparkle-text hover:underline">{background.photographer}</button> on <button type="button" onClick={() => void openDesktopLink('https://unsplash.com/?utm_source=zyra&utm_medium=referral')} className="hover:text-sparkle-text hover:underline">Unsplash</button></span> : <span className="mt-0.5 block truncate text-[10px] text-sparkle-text-muted">{detail}</span>}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
                {controller.mode !== 'off' ? (
                    <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--surface-divider)] px-3 py-2.5">
                        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1" role="group" aria-label="Background rotation">
                            <button type="button" onClick={() => controller.setRotation('every-tab')} aria-pressed={controller.rotation === 'every-tab'} title="Choose a different image whenever a New Tab opens" className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-medium hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]', controller.rotation === 'every-tab' ? 'bg-[var(--surface-hover)] text-sparkle-text' : 'text-sparkle-text-muted')}><Shuffle size={12} /><span>Every new tab</span></button>
                            <button type="button" onClick={() => controller.setRotation('fixed')} aria-pressed={controller.rotation === 'fixed'} title="Keep the current image on every New Tab" className={cn('inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[10px] font-medium hover:bg-[var(--surface-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]', controller.rotation === 'fixed' ? 'bg-[var(--surface-hover)] text-sparkle-text' : 'text-sparkle-text-muted')}><LockKeyhole size={12} /><span>Lock image</span></button>
                        </div>
                        <button type="button" onClick={controller.changeBackground} disabled={controller.loading || controller.visibleBackgrounds.length === 0} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)] disabled:opacity-40" title="Choose another background" aria-label="Choose another background"><RefreshCw size={13} /></button>
                    </footer>
                ) : null}
            </section>
        </div></AnchoredNativeOverlay>
    )
}
