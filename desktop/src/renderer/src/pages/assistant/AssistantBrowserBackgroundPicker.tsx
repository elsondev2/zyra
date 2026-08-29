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
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 180
        closeTimerRef.current = window.setTimeout(onClose, duration)
    }, [onClose])

    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
        dialogRef.current?.focus()
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault()
                exit()
                return
            }
            if (event.key !== 'Tab' || !dialogRef.current) return
            const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
            if (focusable.length === 0) return
            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault()
                last.focus()
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault()
                first.focus()
            }
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => {
            window.removeEventListener('keydown', handleKeyDown)
            window.requestAnimationFrame(() => previous?.focus())
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
        <div className={cn('absolute inset-0 z-[90] flex items-center justify-center bg-slate-950/[0.58] p-[clamp(8px,1.8vw,18px)] backdrop-blur-[3px] transition-opacity duration-150 motion-reduce:transition-none', closing ? 'opacity-0' : 'animate-modal-backdrop opacity-100')} onPointerDown={(event) => {
            if (event.target === event.currentTarget) exit()
        }}>
            <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="New Tab backgrounds" className={cn('flex h-full max-h-[470px] w-full max-w-[600px] flex-col overflow-hidden rounded-[10px] border border-[color-mix(in_srgb,var(--color-text)_13%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_98%,var(--color-bg))] shadow-[0_28px_90px_rgba(0,0,0,0.48)] outline-none transition-[opacity,transform] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', closing ? 'translate-y-2 scale-[0.99] opacity-0' : 'animate-modal-in translate-y-0 scale-100 opacity-100')}>
                <header className="flex h-11 shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] px-3">
                    <Image size={14} className="text-[var(--accent-primary)]/85" />
                    <h3 className="text-[12px] font-semibold text-sparkle-text">Backgrounds</h3>
                    <span className="truncate text-[10px] text-sparkle-text-muted/55">New tab</span>
                    <button type="button" onClick={exit} className="ml-auto inline-flex size-7 items-center justify-center rounded-[5px] text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Close background picker"><X size={13} /></button>
                </header>

                <div className="shrink-0 border-b border-[var(--surface-divider)] px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex h-8 items-center rounded-[6px] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-0.5" role="tablist" aria-label="Background source">
                            {([
                                { mode: 'built-in' as const, label: 'Included' },
                                { mode: 'unsplash' as const, label: 'Unsplash' },
                                { mode: 'off' as const, label: 'None' }
                            ]).map((option) => (
                                <button key={option.mode} type="button" role="tab" aria-selected={controller.mode === option.mode} onClick={() => controller.setMode(option.mode)} className={cn('h-7 rounded-[4px] px-2.5 text-[10px] font-medium text-sparkle-text-muted/70 transition-[background-color,color,box-shadow] duration-150 hover:text-sparkle-text', controller.mode === option.mode && 'bg-[var(--color-card)] text-sparkle-text shadow-sm')}>{option.label}</button>
                            ))}
                        </div>

                        {controller.mode !== 'off' ? (
                            <>
                                <label className="sr-only" htmlFor="new-tab-background-category">Background category</label>
                                <select id="new-tab-background-category" value={controller.category} onChange={(event) => { setUnsplashQuery(''); controller.setCategory(event.target.value as typeof controller.category) }} className="h-8 min-w-36 flex-1 rounded-[6px] border border-[var(--surface-divider)] bg-transparent px-2 text-[10px] text-sparkle-text-secondary outline-none focus:border-[var(--accent-primary)]/35">
                                    {ASSISTANT_BROWSER_BACKGROUND_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
                                </select>
                                <div className="inline-flex h-8 items-center rounded-[6px] bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-0.5" role="group" aria-label="Background rotation">
                                    <button type="button" onClick={() => controller.setRotation('every-tab')} aria-pressed={controller.rotation === 'every-tab'} title="Choose a different image whenever a New Tab opens" className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-[10px] font-medium text-sparkle-text-muted/70 transition-colors hover:text-sparkle-text', controller.rotation === 'every-tab' && 'bg-[var(--color-card)] text-sparkle-text shadow-sm')}><Shuffle size={11} /><span>Every new tab</span></button>
                                    <button type="button" onClick={() => controller.setRotation('fixed')} aria-pressed={controller.rotation === 'fixed'} title="Keep the current image on every New Tab" className={cn('inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-[4px] px-2 text-[10px] font-medium text-sparkle-text-muted/70 transition-colors hover:text-sparkle-text', controller.rotation === 'fixed' && 'bg-[var(--color-card)] text-sparkle-text shadow-sm')}><LockKeyhole size={11} /><span>Lock image</span></button>
                                </div>
                                <button type="button" onClick={controller.changeBackground} className="inline-flex size-8 items-center justify-center rounded-[6px] text-sparkle-text-muted/60 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Choose another background" aria-label="Choose another background"><RefreshCw size={12} /></button>
                                {controller.mode === 'unsplash' && unsplashConfigured ? <button type="button" onClick={() => setUnsplashSettingsOpen((current) => !current)} aria-expanded={unsplashSettingsOpen} className={cn('inline-flex size-8 items-center justify-center rounded-[6px] text-sparkle-text-muted/60 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text', unsplashSettingsOpen && 'bg-[var(--surface-hover)] text-sparkle-text')} title="Manage Unsplash access key" aria-label="Manage Unsplash access key"><SlidersHorizontal size={12} /></button> : null}
                            </>
                        ) : null}
                    </div>

                    {controller.mode === 'unsplash' && unsplashConfigured ? (
                        <form className="mt-2 flex items-center gap-1.5 border-t border-[var(--surface-divider)] pt-2" onSubmit={(event) => { event.preventDefault(); searchUnsplash() }}>
                            <Search size={12} className="ml-1 shrink-0 text-sparkle-text-muted/55" />
                            <input type="text" inputMode="search" value={unsplashQuery} onChange={(event) => setUnsplashQuery(event.target.value)} className="h-8 min-w-0 flex-1 bg-transparent px-1 text-[10px] text-sparkle-text-secondary outline-none placeholder:text-sparkle-text-muted/45" placeholder="Search Unsplash or paste a photo link" aria-label="Search Unsplash backgrounds" />
                            {unsplashQuery ? <button type="button" onClick={clearUnsplashSearch} className="inline-flex size-7 items-center justify-center rounded-[5px] text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Clear Unsplash search"><X size={11} /></button> : null}
                            <button type="submit" disabled={!unsplashQuery.trim() || controller.loading} className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent-primary)]/14 px-2.5 text-[10px] font-semibold text-sparkle-text transition-colors hover:bg-[var(--accent-primary)]/20 disabled:opacity-40">{controller.loading ? <LoaderCircle size={10} className="animate-spin" /> : <Search size={10} />}Search</button>
                        </form>
                    ) : null}

                    {showUnsplashSettings ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-[var(--surface-divider)] pt-2">
                            <div className="min-w-32 flex-1">
                                <p className="text-[10px] font-medium text-sparkle-text-secondary">{unsplashConfigured ? 'Replace access key' : 'Connect Unsplash'}</p>
                                <p className="text-[10px] text-sparkle-text-muted/55">Encrypted on this device.</p>
                            </div>
                            <input type="password" value={accessKey} onChange={(event) => setAccessKey(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void saveKey() }} className="h-8 min-w-44 flex-[2] rounded-[6px] border border-[var(--surface-divider)] bg-transparent px-2.5 text-[10px] text-sparkle-text-secondary outline-none focus:border-[var(--accent-primary)]/40" placeholder="Unsplash Access Key" aria-label={unsplashConfigured ? 'Replacement Unsplash Access Key' : 'Unsplash Access Key'} autoComplete="off" />
                            {unsplashConfigured ? <button type="button" onClick={() => void removeKey()} disabled={savingKey} className="h-8 rounded-[5px] px-2 text-[10px] text-red-300/80 transition-colors hover:bg-red-400/[0.07] hover:text-red-200 disabled:opacity-40">Remove</button> : null}
                            <button type="button" onClick={() => void saveKey()} disabled={!accessKey.trim() || savingKey} className="inline-flex h-8 items-center gap-1.5 rounded-[5px] bg-[var(--accent-primary)]/14 px-3 text-[10px] font-semibold text-sparkle-text transition-colors hover:bg-[var(--accent-primary)]/20 disabled:opacity-40">{savingKey ? <LoaderCircle size={10} className="animate-spin" /> : null}{unsplashConfigured ? 'Replace' : 'Connect'}</button>
                            {keyError ? <p className="basis-full text-[10px] text-red-300">{keyError}</p> : null}
                        </div>
                    ) : null}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 custom-scrollbar">
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
                        <div className="grid gap-x-2.5 gap-y-3 [grid-template-columns:repeat(auto-fill,minmax(130px,1fr))]">
                            {controller.visibleBackgrounds.map((background) => {
                                const selected = controller.activeBackground?.id === background.id
                                const credit = background.provider === 'built-in' ? background.attributionText : remoteBackgroundAttribution(background)
                                const title = background.provider === 'built-in' ? background.title : background.alt || 'Unsplash photo'
                                const detail = background.provider === 'built-in' ? background.categoryLabel : background.photographer
                                return (
                                    <div key={`${background.provider}:${background.id}`} className="min-w-0">
                                        <button type="button" onClick={() => controller.selectBackground(background)} className="group relative block aspect-[16/10] w-full min-w-0 overflow-hidden rounded-[6px] bg-[var(--surface-hover)] text-left outline-none" aria-pressed={selected} title={credit}>
                                            <img src={background.thumbnailUrl} alt="" loading="lazy" className="size-full object-cover transition-[transform,filter] duration-200 ease-out group-hover:scale-[1.015] group-hover:brightness-105 motion-reduce:transition-none" />
                                            <span className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/80 via-black/5 to-transparent opacity-85" />
                                            <span className={cn('pointer-events-none absolute inset-0 rounded-[6px] ring-1 ring-inset transition-colors', selected ? 'ring-2 ring-[var(--accent-primary)]' : 'ring-white/10 group-hover:ring-white/25')} />
                                            <span className="absolute inset-x-2 bottom-1.5 min-w-0 text-white">
                                                <span className="block truncate text-[10px] font-semibold drop-shadow">{title}</span>
                                                <span className="block truncate text-[10px] text-white/65 drop-shadow">{detail}</span>
                                            </span>
                                            {selected ? <span className="absolute right-2 top-2 inline-flex size-5 items-center justify-center rounded-[5px] bg-[var(--accent-primary)] text-[var(--accent-contrast)] shadow"><Check size={11} /></span> : null}
                                        </button>
                                        {background.provider === 'unsplash' ? <span className="mt-1 block truncate text-[10px] text-sparkle-text-muted/65">Photo by <button type="button" onClick={() => void window.devscope.openBrowserPreviewExternal(background.photographerUrl)} className="hover:text-sparkle-text hover:underline">{background.photographer}</button> on <button type="button" onClick={() => void window.devscope.openBrowserPreviewExternal('https://unsplash.com/?utm_source=zyra&utm_medium=referral')} className="hover:text-sparkle-text hover:underline">Unsplash</button></span> : null}
                                    </div>
                                )
                            })}
                        </div>
                    )}
                </div>
            </section>
        </div>
    )
}
