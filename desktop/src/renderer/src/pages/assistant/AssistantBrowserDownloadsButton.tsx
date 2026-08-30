import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    AlertTriangle,
    Download,
    Ellipsis,
    ExternalLink,
    FileSearch2,
    FolderOpen,
    Pause,
    Play,
    RotateCcw,
    Trash2,
    X
} from 'lucide-react'
import type { BrowserDownloadAction, BrowserDownloadActionResult, BrowserDownloadRecord } from '@shared/browser-downloads'
import type { DevScopeResult } from '@shared/contracts/devscope-api'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { FileEntryIcon } from '@/components/ui/FileEntryIcon'
import { resolvePreviewType } from '@/components/ui/file-preview/utils'
import { cn } from '@/lib/utils'
import { useThemeRevision } from '@/lib/use-theme-revision'

type DownloadOptionsMenu = {
    downloadId: string
    left: number
    top: number
}

export type BrowserDownloadsApi = {
    list: () => Promise<DevScopeResult<{ downloads: BrowserDownloadRecord[] }>>
    act: (action: BrowserDownloadAction) => Promise<DevScopeResult<BrowserDownloadActionResult>>
    subscribe: (callback: (downloads: BrowserDownloadRecord[]) => void) => () => void
}

function formatBytes(value: number): string {
    if (!Number.isFinite(value) || value <= 0) return '0 B'
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    const unit = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)))
    const amount = value / (1024 ** unit)
    return `${amount >= 10 || unit === 0 ? Math.round(amount) : amount.toFixed(1)} ${units[unit]}`
}

function downloadProgress(download: BrowserDownloadRecord): number | null {
    if (download.totalBytes <= 0) return null
    return Math.max(0, Math.min(1, download.receivedBytes / download.totalBytes))
}

function downloadDetail(download: BrowserDownloadRecord): string {
    if (download.status === 'cancelled') return 'Cancelled'
    if (download.status === 'blocked') return 'Blocked by Zyra'
    if (download.status === 'interrupted') return download.canResume ? 'Interrupted · Can resume' : 'Interrupted'
    if (download.status === 'completed' && download.risk === 'dangerous') {
        if (download.protectionStatus === 'failed') return 'Dangerous — Windows protection unavailable'
        if (download.protectionStatus === 'applied') return 'Dangerous — can run code · Windows protected'
        return 'Dangerous — can run code'
    }
    if (download.status === 'completed' && download.risk === 'archive') return 'Archive — inspect before opening'
    if (download.status === 'completed') return `${formatBytes(download.totalBytes || download.receivedBytes)} · Complete`
    if (download.status === 'paused') return `${formatBytes(download.receivedBytes)} of ${download.totalBytes > 0 ? formatBytes(download.totalBytes) : 'unknown'} · Paused`
    const size = download.totalBytes > 0
        ? `${formatBytes(download.receivedBytes)} of ${formatBytes(download.totalBytes)}`
        : formatBytes(download.receivedBytes)
    const detail = download.bytesPerSecond > 0 ? `${size} · ${formatBytes(download.bytesPerSecond)}/s` : size
    if (download.risk === 'dangerous') return `Dangerous file · ${detail}`
    if (download.risk === 'archive') return `Archive · ${detail}`
    return detail
}

function dangerousProtectionMessage(download: BrowserDownloadRecord): string {
    if (download.protectionStatus === 'applied') return 'Windows security checks are attached.'
    if (download.protectionStatus === 'failed') return 'Windows internet protection could not be attached.'
    if (download.protectionStatus === 'pending') return 'Windows internet protection is still being applied.'
    return 'Your operating system may show another warning.'
}

function DownloadFileIcon({ download, size, theme }: { download: BrowserDownloadRecord; size: number; theme: 'light' | 'dark' }) {
    const [failedDataUrl, setFailedDataUrl] = useState<string | null>(null)
    if (download.systemIconDataUrl && failedDataUrl !== download.systemIconDataUrl) {
        return (
            <img
                src={download.systemIconDataUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="shrink-0 select-none object-contain"
                style={{ width: size, height: size }}
                onError={() => setFailedDataUrl(download.systemIconDataUrl)}
            />
        )
    }
    return <FileEntryIcon pathValue={download.filename} kind="file" theme={theme} size={size} />
}

function DownloadProgressRing({ progress, active }: { progress: number | null; active: boolean }) {
    const radius = 8
    const circumference = 2 * Math.PI * radius
    return (
        <span className="relative inline-flex size-7 items-center justify-center" aria-hidden="true">
            <Download size={13} className={cn('relative z-10', active && 'browser-download-arrow-active')} />
            {active ? (
                <svg className="pointer-events-none absolute inset-0 size-7 -rotate-90" viewBox="0 0 20 20">
                    <circle cx="10" cy="10" r={radius} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="1.5" />
                    <circle
                        cx="10"
                        cy="10"
                        r={radius}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeDasharray={progress === null ? `${circumference * 0.22} ${circumference}` : circumference}
                        strokeDashoffset={progress === null ? 0 : circumference * (1 - progress)}
                        className={progress === null ? 'browser-download-ring-indeterminate' : 'transition-[stroke-dashoffset] duration-150 ease-out'}
                    />
                </svg>
            ) : null}
        </span>
    )
}

export function AssistantBrowserDownloadsButton({
    api,
    className,
    onOpenHere,
    onBeforeOverlayOpen,
    onOverlayChange
}: {
    api: BrowserDownloadsApi
    className?: string
    onOpenHere?: (download: BrowserDownloadRecord) => Promise<void>
    onBeforeOverlayOpen?: () => Promise<unknown>
    onOverlayChange?: (open: boolean) => void
}) {
    useThemeRevision()
    const iconTheme = typeof document !== 'undefined' && document.body.classList.contains('light') ? 'light' : 'dark'
    const rootRef = useRef<HTMLDivElement | null>(null)
    const knownIdsRef = useRef(new Set<string>())
    const autoCloseTimerRef = useRef(0)
    const overlayOpenRequestRef = useRef(0)
    const overlayOpeningRef = useRef(false)
    const openRef = useRef(false)
    const [downloads, setDownloads] = useState<BrowserDownloadRecord[]>([])
    const [open, setOpen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [newDownloadId, setNewDownloadId] = useState<string | null>(null)
    const [pendingDelete, setPendingDelete] = useState<BrowserDownloadRecord | null>(null)
    const [pendingOpen, setPendingOpen] = useState<{ download: BrowserDownloadRecord; token: string } | null>(null)
    const [optionsMenu, setOptionsMenu] = useState<DownloadOptionsMenu | null>(null)
    openRef.current = open

    const requestOverlayOpen = useCallback(async () => {
        if (overlayOpeningRef.current || openRef.current) return
        overlayOpeningRef.current = true
        const request = ++overlayOpenRequestRef.current
        try {
            await onBeforeOverlayOpen?.()
        } catch {
            // A current page frame is preferred, but Downloads must remain reachable.
        } finally {
            overlayOpeningRef.current = false
        }
        if (request !== overlayOpenRequestRef.current) return
        onOverlayChange?.(true)
        openRef.current = true
        setOpen(true)
    }, [onBeforeOverlayOpen, onOverlayChange])

    useEffect(() => {
        onOverlayChange?.(open || Boolean(optionsMenu) || Boolean(pendingDelete) || Boolean(pendingOpen))
    }, [onOverlayChange, open, optionsMenu, pendingDelete, pendingOpen])
    useEffect(() => () => {
        overlayOpenRequestRef.current += 1
        onOverlayChange?.(false)
    }, [onOverlayChange])

    const applyDownloads = useCallback((nextDownloads: BrowserDownloadRecord[], announceNew = true) => {
        const nextIds = new Set(nextDownloads.map((download) => download.id))
        const started = announceNew
            ? nextDownloads.find((download) => !knownIdsRef.current.has(download.id) && (download.status === 'progressing' || download.status === 'paused'))
            : null
        knownIdsRef.current = nextIds
        setDownloads(nextDownloads)
        if (!started) return
        setNewDownloadId(started.id)
        void requestOverlayOpen()
        window.clearTimeout(autoCloseTimerRef.current)
        autoCloseTimerRef.current = window.setTimeout(() => setOpen(false), 4_500)
        window.setTimeout(() => setNewDownloadId((current) => current === started.id ? null : current), 800)
    }, [requestOverlayOpen])

    useEffect(() => {
        let disposed = false
        void api.list().then((result) => {
            if (!disposed && result.success) applyDownloads(result.downloads, false)
        }).catch(() => undefined)
        const unsubscribe = api.subscribe((nextDownloads) => {
            if (!disposed) applyDownloads(nextDownloads)
        })
        return () => {
            disposed = true
            unsubscribe()
            window.clearTimeout(autoCloseTimerRef.current)
        }
    }, [api, applyDownloads])

    useEffect(() => {
        if (!open) return
        const close = (event: PointerEvent) => {
            if (event.target instanceof Node && rootRef.current?.contains(event.target)) return
            if (event.target instanceof Element && event.target.closest('[data-browser-download-options]')) return
            setOptionsMenu(null)
            setOpen(false)
        }
        document.addEventListener('pointerdown', close, true)
        return () => document.removeEventListener('pointerdown', close, true)
    }, [open])

    const act = useCallback(async (action: BrowserDownloadAction): Promise<BrowserDownloadActionResult | null> => {
        setError(null)
        try {
            const result = await api.act(action)
            if (!result.success) {
                setError(result.error)
                return null
            }
            applyDownloads(result.downloads, false)
            return result
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'The download action failed.')
            return null
        }
    }, [api, applyDownloads])

    useEffect(() => {
        if (!open) setOptionsMenu(null)
    }, [open])

    useEffect(() => {
        if (!optionsMenu) return
        const closeOptions = (event: PointerEvent) => {
            if (event.target instanceof Element && event.target.closest('[data-browser-download-options]')) return
            setOptionsMenu(null)
        }
        const closeOnEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOptionsMenu(null)
        }
        const closeOnViewportChange = () => setOptionsMenu(null)
        document.addEventListener('pointerdown', closeOptions, true)
        document.addEventListener('keydown', closeOnEscape)
        window.addEventListener('resize', closeOnViewportChange)
        window.addEventListener('scroll', closeOnViewportChange, true)
        return () => {
            document.removeEventListener('pointerdown', closeOptions, true)
            document.removeEventListener('keydown', closeOnEscape)
            window.removeEventListener('resize', closeOnViewportChange)
            window.removeEventListener('scroll', closeOnViewportChange, true)
        }
    }, [optionsMenu])

    const openHere = useCallback(async (download: BrowserDownloadRecord) => {
        if (!onOpenHere) return
        setError(null)
        setOptionsMenu(null)
        setOpen(false)
        try {
            await onOpenHere(download)
        } catch (openError) {
            setError(openError instanceof Error ? openError.message : 'This file could not be opened in Zyra.')
        }
    }, [onOpenHere])

    const openDownload = useCallback((download: BrowserDownloadRecord) => {
        const dotIndex = download.filename.lastIndexOf('.')
        const extension = dotIndex >= 0 ? download.filename.slice(dotIndex + 1).toLowerCase() : ''
        if (onOpenHere && resolvePreviewType(download.filename, extension)) {
            void openHere(download)
            return
        }
        void (async () => {
            const result = await act({ type: 'open', id: download.id })
            if (!result?.openConfirmation) return
            const currentDownload = result.downloads.find((candidate) => candidate.id === download.id) || download
            setOpen(false)
            setPendingOpen({ download: currentDownload, token: result.openConfirmation.token })
        })()
    }, [act, onOpenHere, openHere])

    const activeDownloads = useMemo(
        () => downloads.filter((download) => download.status === 'progressing' || download.status === 'paused'),
        [downloads]
    )
    const aggregateProgress = useMemo(() => {
        if (activeDownloads.length === 0) return null
        const total = activeDownloads.reduce((sum, download) => sum + download.totalBytes, 0)
        if (total <= 0) return null
        return activeDownloads.reduce((sum, download) => sum + download.receivedBytes, 0) / total
    }, [activeDownloads])
    const optionsDownload = optionsMenu
        ? downloads.find((download) => download.id === optionsMenu.downloadId) || null
        : null
    const optionsExtension = optionsDownload
        ? optionsDownload.filename.slice(Math.max(0, optionsDownload.filename.lastIndexOf('.') + 1)).toLowerCase()
        : ''
    const optionsCanOpenHere = Boolean(optionsDownload && onOpenHere && resolvePreviewType(optionsDownload.filename, optionsExtension))

    if (downloads.length === 0) return null

    return (
        <div ref={rootRef} className={cn('relative shrink-0', className)} onPointerDown={() => window.clearTimeout(autoCloseTimerRef.current)}>
            <button
                type="button"
                onClick={() => {
                    window.clearTimeout(autoCloseTimerRef.current)
                    setOptionsMenu(null)
                    if (open) {
                        overlayOpenRequestRef.current += 1
                        openRef.current = false
                        setOpen(false)
                    } else {
                        void requestOverlayOpen()
                    }
                }}
                className={cn(
                    'inline-flex size-7 items-center justify-center rounded-md text-sparkle-text-muted/60 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text',
                    open && 'bg-[var(--surface-hover)] text-[var(--accent-primary)]',
                    newDownloadId && 'browser-download-button-arrive'
                )}
                title={activeDownloads.length > 0 ? `${activeDownloads.length} active download${activeDownloads.length === 1 ? '' : 's'}` : 'Downloads'}
                aria-label="Downloads"
                aria-expanded={open}
            >
                <DownloadProgressRing progress={aggregateProgress} active={activeDownloads.length > 0} />
            </button>

            {open ? (
                <section className="absolute right-0 top-8 z-[430] flex max-h-[min(390px,calc(100vh-64px))] w-[306px] flex-col overflow-hidden rounded-[7px] border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_97%,var(--color-bg))] shadow-[0_14px_34px_rgba(0,0,0,0.34)]" aria-label="Browser downloads">
                    <header className="flex h-9 shrink-0 items-center border-b border-[var(--surface-divider)] px-2.5">
                        <h3 className="min-w-0 flex-1 text-[11px] font-semibold text-sparkle-text">Downloads</h3>
                        <button type="button" onClick={() => void act({ type: 'open-folder' })} className="inline-flex size-6 items-center justify-center rounded-[4px] text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Open Downloads folder" aria-label="Open Downloads folder"><FolderOpen size={13} /></button>
                        <button type="button" onClick={() => setOpen(false)} className="inline-flex size-6 items-center justify-center rounded-[4px] text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Close downloads" aria-label="Close downloads"><X size={13} /></button>
                    </header>
                    <div className="min-h-0 flex-1 overflow-y-auto p-1 custom-scrollbar">
                        {downloads.map((download) => {
                            const progress = downloadProgress(download)
                            const active = download.status === 'progressing' || download.status === 'paused'
                            const hasOptions = !active && (download.exists || download.canRetry)
                            return (
                                <article key={download.id} className={cn(
                                    'group/download relative overflow-hidden rounded-[4px] border border-transparent px-2 py-1.5 transition-colors hover:bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)]',
                                    download.risk === 'dangerous' && 'border-red-400/15 bg-red-500/[0.055] hover:bg-red-500/[0.075]',
                                    download.risk === 'archive' && 'border-amber-400/10 bg-amber-400/[0.035]',
                                    newDownloadId === download.id && 'browser-download-row-arrive'
                                )}>
                                    <div className="flex min-h-8 items-center gap-2">
                                        <button type="button" disabled={!download.exists} onClick={() => openDownload(download)} className="inline-flex size-6 shrink-0 items-center justify-center opacity-90 hover:opacity-100 disabled:opacity-40" title={download.exists ? `Open ${download.filename}` : download.filename}><DownloadFileIcon download={download} size={16} theme={iconTheme} /></button>
                                        <button type="button" disabled={!download.exists} onClick={() => openDownload(download)} className="min-w-0 flex-1 text-left disabled:pointer-events-none">
                                            <span className="flex min-w-0 items-center gap-1 text-[10px] font-medium leading-4 text-sparkle-text" title={download.filename}>
                                                <span className="truncate">{download.filename}</span>
                                                {download.risk === 'dangerous' ? <AlertTriangle size={9} className="shrink-0 text-red-300" aria-label="Dangerous file" /> : null}
                                            </span>
                                            <span className={cn('block truncate text-[8px] leading-3 text-sparkle-text-muted/58', download.risk === 'dangerous' && 'text-red-200/80', download.risk === 'archive' && 'text-amber-200/70')}>{downloadDetail(download)}</span>
                                        </button>
                                        <div className="flex shrink-0 items-center">
                                            {download.status === 'progressing' ? <button type="button" onClick={() => void act({ type: 'pause', id: download.id })} className="inline-flex size-5 items-center justify-center rounded-[3px] text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Pause download" aria-label={`Pause ${download.filename}`}><Pause size={11} /></button> : null}
                                            {(download.status === 'paused' || download.status === 'interrupted') && download.canResume ? <button type="button" onClick={() => void act({ type: 'resume', id: download.id })} className="inline-flex size-5 items-center justify-center rounded-[3px] text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Resume download" aria-label={`Resume ${download.filename}`}><Play size={11} /></button> : null}
                                            {active ? <button type="button" onClick={() => void act({ type: 'cancel', id: download.id })} className="inline-flex size-5 items-center justify-center rounded-[3px] text-sparkle-text-muted/55 hover:bg-red-400/[0.10] hover:text-red-200" title="Cancel download" aria-label={`Cancel ${download.filename}`}><X size={11} /></button> : null}
                                            {hasOptions ? <button type="button" data-browser-download-options onClick={(event) => {
                                                const rect = event.currentTarget.getBoundingClientRect()
                                                const estimatedHeight = download.exists ? 126 : 38
                                                const top = rect.bottom + 4 + estimatedHeight <= window.innerHeight
                                                    ? rect.bottom + 4
                                                    : Math.max(4, rect.top - estimatedHeight - 4)
                                                setOptionsMenu((current) => current?.downloadId === download.id ? null : {
                                                    downloadId: download.id,
                                                    left: Math.max(4, Math.min(window.innerWidth - 160, rect.right - 156)),
                                                    top
                                                })
                                            }} className="inline-flex size-5 items-center justify-center rounded-[3px] text-sparkle-text-muted/50 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Download options" aria-label={`Options for ${download.filename}`} aria-expanded={optionsMenu?.downloadId === download.id}><Ellipsis size={12} /></button> : null}
                                        </div>
                                    </div>
                                    {active ? (
                                        <div className="absolute inset-x-2 bottom-0 h-px overflow-hidden bg-[color-mix(in_srgb,var(--color-text)_9%,transparent)]">
                                            <span
                                                className={cn('block h-full bg-[var(--accent-primary)] transition-[width] duration-150 ease-out', progress === null && 'browser-download-progress-indeterminate')}
                                                style={{ width: progress === null ? '35%' : `${Math.max(2, progress * 100)}%` }}
                                            />
                                        </div>
                                    ) : null}
                                </article>
                            )
                        })}
                    </div>
                    {error ? <div className="shrink-0 border-t border-red-400/15 bg-red-400/[0.06] px-2.5 py-1.5 text-[8px] text-red-200">{error}</div> : null}
                </section>
            ) : null}
            {optionsMenu && optionsDownload ? createPortal((
                <div
                    data-browser-download-options
                    role="menu"
                    aria-label={`Options for ${optionsDownload.filename}`}
                    className="fixed z-[520] w-[156px] overflow-hidden rounded-[6px] border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 shadow-[0_12px_30px_rgba(0,0,0,0.32)]"
                    style={{ left: optionsMenu.left, top: optionsMenu.top }}
                >
                    {optionsCanOpenHere ? <button type="button" role="menuitem" onClick={() => void openHere(optionsDownload)} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><FileSearch2 size={12} /><span>Open here</span></button> : null}
                    {optionsDownload.exists ? <button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); openDownload(optionsDownload) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><ExternalLink size={12} /><span>Open</span></button> : null}
                    {optionsDownload.canRetry ? <button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); void act({ type: 'retry', id: optionsDownload.id }) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><RotateCcw size={12} /><span>Retry</span></button> : null}
                    {optionsDownload.exists ? <button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); setOpen(false); void act({ type: 'reveal', id: optionsDownload.id }) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><FolderOpen size={12} /><span>Show in folder</span></button> : null}
                    {optionsDownload.exists ? <><div className="my-1 h-px bg-[var(--surface-divider)]" /><button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); setOpen(false); setPendingDelete(optionsDownload) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-red-200/85 hover:bg-red-400/[0.10] hover:text-red-100"><Trash2 size={12} /><span>Delete</span></button></> : null}
                </div>
            ), document.body) : null}
            <ConfirmModal
                isOpen={pendingOpen !== null}
                title="This file can run code"
                message={pendingOpen ? `“${pendingOpen.download.filename}” can run code or change files on this PC. Open it only if you trust ${pendingOpen.download.sourceOrigin || 'its source'}. ${dangerousProtectionMessage(pendingOpen.download)}` : ''}
                confirmLabel="Open anyway"
                cancelLabel="Keep closed"
                variant="danger"
                visual={pendingOpen ? (
                    <span className="inline-flex size-12 items-center justify-center rounded-[9px] border border-red-400/20 bg-red-500/[0.08]">
                        <DownloadFileIcon download={pendingOpen.download} size={32} theme={iconTheme} />
                    </span>
                ) : null}
                onCancel={() => setPendingOpen(null)}
                onConfirm={() => {
                    if (!pendingOpen) return
                    const { download, token } = pendingOpen
                    setPendingOpen(null)
                    void act({ type: 'confirm-open', id: download.id, token })
                }}
            />
            <ConfirmModal
                isOpen={pendingDelete !== null}
                title="Delete downloaded file?"
                message={pendingDelete ? `This permanently deletes “${pendingDelete.filename}” from your Downloads folder.` : ''}
                confirmLabel="Delete file"
                variant="danger"
                onCancel={() => setPendingDelete(null)}
                onConfirm={() => {
                    if (!pendingDelete) return
                    const id = pendingDelete.id
                    setPendingDelete(null)
                    void act({ type: 'delete', id })
                }}
            />
        </div>
    )
}
