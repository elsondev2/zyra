import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
    AlertTriangle,
    Download,
    Ellipsis,
    ExternalLink,
    FileSearch2,
    FolderOpen,
    LoaderCircle,
    Pause,
    Play,
    RefreshCw,
    RotateCcw,
    Search,
    Trash2,
    X
} from 'lucide-react'
import type { BrowserDownloadAction, BrowserDownloadActionResult, BrowserDownloadRecord, BrowserDownloadsFolderAction, BrowserDownloadsFolderActionResult, BrowserDownloadsFolderEntry } from '@shared/browser-downloads'
import type { DevScopeResult } from '@shared/contracts/devscope-api'
import { ConfirmModal } from '@/components/ui/ConfirmModal'
import { FileEntryIcon } from '@/components/ui/FileEntryIcon'
import { resolvePreviewType } from '@/components/ui/file-preview/utils'
import { cn } from '@/lib/utils'
import { useThemeRevision } from '@/lib/use-theme-revision'
import type { BrowserDownloadsApi } from './AssistantBrowserDownloadsButton'

type DownloadOptionsMenu = {
    downloadId: string
    left: number
    top: number
}

type DownloadGroup = {
    id: string
    label: string
    downloads: BrowserDownloadRecord[]
}

type FolderEntryGroup = {
    id: string
    label: string
    entries: BrowserDownloadsFolderEntry[]
}

type BrowserDownloadsPanelApi = BrowserDownloadsApi & {
    listFolder: () => Promise<DevScopeResult<{ entries: BrowserDownloadsFolderEntry[] }>>
    actOnFolderEntry: (action: BrowserDownloadsFolderAction) => Promise<DevScopeResult<BrowserDownloadsFolderActionResult>>
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

function DownloadFileIcon({ download, theme }: { download: BrowserDownloadRecord; theme: 'light' | 'dark' }) {
    const [failedDataUrl, setFailedDataUrl] = useState<string | null>(null)
    if (download.systemIconDataUrl && failedDataUrl !== download.systemIconDataUrl) {
        return (
            <img
                src={download.systemIconDataUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="size-6 shrink-0 select-none object-contain"
                onError={() => setFailedDataUrl(download.systemIconDataUrl)}
            />
        )
    }
    return <FileEntryIcon pathValue={download.filename} kind="file" theme={theme} size={24} />
}

function FolderFileIcon({ entry, theme }: { entry: BrowserDownloadsFolderEntry; theme: 'light' | 'dark' }) {
    const [failedDataUrl, setFailedDataUrl] = useState<string | null>(null)
    if (entry.systemIconDataUrl && failedDataUrl !== entry.systemIconDataUrl) {
        return (
            <img
                src={entry.systemIconDataUrl}
                alt=""
                aria-hidden="true"
                draggable={false}
                className="size-6 shrink-0 select-none object-contain"
                onError={() => setFailedDataUrl(entry.systemIconDataUrl)}
            />
        )
    }
    return <FileEntryIcon pathValue={entry.filename} kind="file" theme={theme} size={24} />
}

function startOfLocalDay(value: Date): number {
    return new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime()
}

function groupDownloadsByDay(downloads: BrowserDownloadRecord[]): DownloadGroup[] {
    const today = startOfLocalDay(new Date())
    const groups = new Map<string, DownloadGroup>()
    for (const download of downloads) {
        const startedAt = new Date(download.startedAt)
        const day = Number.isNaN(startedAt.getTime()) ? new Date(0) : startedAt
        const dayStart = startOfLocalDay(day)
        const id = new Date(dayStart).toISOString()
        const dayOffset = Math.round((today - dayStart) / 86_400_000)
        const label = dayOffset === 0
            ? 'Today'
            : dayOffset === 1
                ? 'Yesterday'
                : day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: day.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
        const group = groups.get(id)
        if (group) group.downloads.push(download)
        else groups.set(id, { id, label, downloads: [download] })
    }
    return [...groups.values()]
}

function groupFolderEntriesByDay(entries: BrowserDownloadsFolderEntry[]): FolderEntryGroup[] {
    const today = startOfLocalDay(new Date())
    const groups = new Map<string, FolderEntryGroup>()
    for (const entry of entries) {
        const modifiedAt = new Date(entry.modifiedAt)
        const day = Number.isNaN(modifiedAt.getTime()) ? new Date(0) : modifiedAt
        const dayStart = startOfLocalDay(day)
        const id = new Date(dayStart).toISOString()
        const dayOffset = Math.round((today - dayStart) / 86_400_000)
        const label = dayOffset === 0
            ? 'Today'
            : dayOffset === 1
                ? 'Yesterday'
                : day.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: day.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
        const group = groups.get(id)
        if (group) group.entries.push(entry)
        else groups.set(id, { id, label, entries: [entry] })
    }
    return [...groups.values()]
}

function formatDownloadTime(download: BrowserDownloadRecord): string {
    const startedAt = new Date(download.startedAt)
    return Number.isNaN(startedAt.getTime())
        ? ''
        : startedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

function formatFolderEntryTime(entry: BrowserDownloadsFolderEntry): string {
    const modifiedAt = new Date(entry.modifiedAt)
    return Number.isNaN(modifiedAt.getTime())
        ? ''
        : modifiedAt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export function AssistantBrowserDownloadsPanel({
    api,
    onOpenHere,
    onClose
}: {
    api: BrowserDownloadsPanelApi
    onOpenHere?: (download: BrowserDownloadRecord) => Promise<void>
    onClose: () => void
}) {
    useThemeRevision()
    const iconTheme = typeof document !== 'undefined' && document.body.classList.contains('light') ? 'light' : 'dark'
    const panelRef = useRef<HTMLElement | null>(null)
    const previousFocusRef = useRef<HTMLElement | null>(null)
    const closingRef = useRef(false)
    const closeTimerRef = useRef(0)
    const [downloads, setDownloads] = useState<BrowserDownloadRecord[]>([])
    const [folderEntries, setFolderEntries] = useState<BrowserDownloadsFolderEntry[]>([])
    const [view, setView] = useState<'zyra' | 'folder'>('zyra')
    const [query, setQuery] = useState('')
    const [loading, setLoading] = useState(true)
    const [folderLoading, setFolderLoading] = useState(false)
    const [folderLoaded, setFolderLoaded] = useState(false)
    const [closing, setClosing] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [pendingDelete, setPendingDelete] = useState<BrowserDownloadRecord | null>(null)
    const [pendingOpen, setPendingOpen] = useState<{ download: BrowserDownloadRecord; token: string } | null>(null)
    const [pendingFolderOpen, setPendingFolderOpen] = useState<{ entry: BrowserDownloadsFolderEntry; token: string } | null>(null)
    const [optionsMenu, setOptionsMenu] = useState<DownloadOptionsMenu | null>(null)

    const visibleDownloads = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        if (!normalizedQuery) return downloads
        return downloads.filter((download) => (
            download.filename.toLowerCase().includes(normalizedQuery)
            || download.sourceOrigin.toLowerCase().includes(normalizedQuery)
            || download.status.toLowerCase().includes(normalizedQuery)
        ))
    }, [downloads, query])
    const downloadGroups = useMemo(() => groupDownloadsByDay(visibleDownloads), [visibleDownloads])
    const visibleFolderEntries = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase()
        if (!normalizedQuery) return folderEntries
        return folderEntries.filter((entry) => entry.filename.toLowerCase().includes(normalizedQuery))
    }, [folderEntries, query])
    const folderGroups = useMemo(() => groupFolderEntriesByDay(visibleFolderEntries), [visibleFolderEntries])
    const optionsDownload = optionsMenu
        ? downloads.find((download) => download.id === optionsMenu.downloadId) || null
        : null
    const optionsExtension = optionsDownload
        ? optionsDownload.filename.slice(Math.max(0, optionsDownload.filename.lastIndexOf('.') + 1)).toLowerCase()
        : ''
    const optionsCanOpenHere = Boolean(optionsDownload && onOpenHere && resolvePreviewType(optionsDownload.filename, optionsExtension))

    useLayoutEffect(() => {
        previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
        const frame = window.requestAnimationFrame(() => panelRef.current?.querySelector<HTMLInputElement>('input')?.focus())
        return () => {
            window.cancelAnimationFrame(frame)
            window.requestAnimationFrame(() => previousFocusRef.current?.focus())
        }
    }, [])

    useEffect(() => {
        let disposed = false
        void api.list().then((result) => {
            if (disposed) return
            if (result.success) setDownloads(result.downloads)
            else setError(result.error)
            setLoading(false)
        }).catch((loadError) => {
            if (disposed) return
            setError(loadError instanceof Error ? loadError.message : 'Download history could not be loaded.')
            setLoading(false)
        })
        const unsubscribe = api.subscribe((nextDownloads) => {
            if (!disposed) {
                setDownloads(nextDownloads)
                setLoading(false)
            }
        })
        return () => {
            disposed = true
            unsubscribe()
        }
    }, [api])

    const loadFolderEntries = useCallback(async () => {
        setFolderLoading(true)
        setError(null)
        try {
            const result = await api.listFolder()
            if (!result.success) {
                setError(result.error)
                return
            }
            setFolderEntries(result.entries)
        } catch (loadError) {
            setError(loadError instanceof Error ? loadError.message : 'The Downloads folder could not be read.')
        } finally {
            setFolderLoaded(true)
            setFolderLoading(false)
        }
    }, [api])

    useEffect(() => {
        if (view !== 'folder' || folderLoaded || folderLoading) return
        void loadFolderEntries()
    }, [folderLoaded, folderLoading, loadFolderEntries, view])

    const exitWith = useCallback((action: () => void) => {
        if (closingRef.current) return
        closingRef.current = true
        setClosing(true)
        setOptionsMenu(null)
        const duration = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 220
        closeTimerRef.current = window.setTimeout(action, duration)
    }, [])

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                if (optionsMenu) {
                    setOptionsMenu(null)
                    return
                }
                if (pendingDelete || pendingOpen || pendingFolderOpen) return
                exitWith(onClose)
                return
            }
            if (event.key !== 'Tab' || !panelRef.current) return
            const focusable = [...panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
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
        window.addEventListener('keydown', handleEscape)
        return () => window.removeEventListener('keydown', handleEscape)
    }, [exitWith, onClose, optionsMenu, pendingDelete, pendingFolderOpen, pendingOpen])

    useEffect(() => () => window.clearTimeout(closeTimerRef.current), [])

    useEffect(() => {
        if (!optionsMenu) return
        const dismiss = (event: PointerEvent) => {
            if (event.target instanceof Element && event.target.closest('[data-browser-download-history-options]')) return
            setOptionsMenu(null)
        }
        const dismissOnViewportChange = () => setOptionsMenu(null)
        document.addEventListener('pointerdown', dismiss, true)
        window.addEventListener('resize', dismissOnViewportChange)
        window.addEventListener('scroll', dismissOnViewportChange, true)
        return () => {
            document.removeEventListener('pointerdown', dismiss, true)
            window.removeEventListener('resize', dismissOnViewportChange)
            window.removeEventListener('scroll', dismissOnViewportChange, true)
        }
    }, [optionsMenu])

    const act = useCallback(async (action: BrowserDownloadAction): Promise<BrowserDownloadActionResult | null> => {
        setError(null)
        try {
            const result = await api.act(action)
            if (!result.success) {
                setError(result.error)
                return null
            }
            setDownloads(result.downloads)
            return result
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'The download action failed.')
            return null
        }
    }, [api])

    const actOnFolderEntry = useCallback(async (action: BrowserDownloadsFolderAction): Promise<BrowserDownloadsFolderActionResult | null> => {
        setError(null)
        try {
            const result = await api.actOnFolderEntry(action)
            if (!result.success) {
                setError(result.error)
                return null
            }
            return result
        } catch (actionError) {
            setError(actionError instanceof Error ? actionError.message : 'The Downloads-folder action failed.')
            return null
        }
    }, [api])

    const openHere = useCallback(async (download: BrowserDownloadRecord) => {
        if (!onOpenHere) return
        setError(null)
        setOptionsMenu(null)
        try {
            await onOpenHere(download)
            previousFocusRef.current = null
            exitWith(onClose)
        } catch (openError) {
            setError(openError instanceof Error ? openError.message : 'This file could not be opened in Zyra.')
        }
    }, [exitWith, onClose, onOpenHere])

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
            setPendingOpen({ download: currentDownload, token: result.openConfirmation.token })
        })()
    }, [act, onOpenHere, openHere])

    const openFolderEntry = useCallback((entry: BrowserDownloadsFolderEntry) => {
        void (async () => {
            const result = await actOnFolderEntry({ type: 'open', filename: entry.filename })
            if (result?.openConfirmation) setPendingFolderOpen({ entry, token: result.openConfirmation.token })
        })()
    }, [actOnFolderEntry])

    return (
        <div className="absolute inset-0 z-[80]" onPointerDown={(event) => {
            if (event.target === event.currentTarget) exitWith(onClose)
        }}>
            <section ref={panelRef} tabIndex={-1} className={cn('absolute bottom-3 right-3 top-3 flex w-[min(440px,calc(100%-24px))] flex-col overflow-hidden rounded-xl border border-[color-mix(in_srgb,var(--color-text)_12%,transparent)] bg-[color-mix(in_srgb,var(--color-card)_97%,var(--color-bg))] shadow-[0_24px_70px_rgba(0,0,0,0.38)] transition-transform duration-[220ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none', closing ? 'translate-x-[calc(100%+16px)]' : 'translate-x-0 animate-[assistant-browser-history-panel-in_180ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none')} aria-label="Browser downloads" role="dialog" aria-modal="true">
                <header className="flex h-12 shrink-0 items-center gap-2 border-b border-[var(--surface-divider)] px-3">
                    <Download size={14} className="text-[var(--accent-primary)]/80" />
                    <h3 className="text-[12px] font-semibold text-sparkle-text">Downloads</h3>
                    <button type="button" onClick={() => void act({ type: 'open-folder' })} className="ml-auto inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Open Downloads folder" aria-label="Open Downloads folder"><FolderOpen size={13} /></button>
                    {view === 'folder' ? (
                        <button type="button" onClick={() => void loadFolderEntries()} disabled={folderLoading} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text disabled:opacity-30" title="Refresh Downloads folder" aria-label="Refresh Downloads folder"><RefreshCw size={12} className={folderLoading ? 'animate-spin' : ''} /></button>
                    ) : (
                        <button type="button" onClick={() => void act({ type: 'clear-history' })} disabled={downloads.every((download) => download.status === 'progressing' || download.status === 'paused')} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-red-300 disabled:opacity-30" title="Clear download history" aria-label="Clear download history"><Trash2 size={12} /></button>
                    )}
                    <button type="button" onClick={() => exitWith(onClose)} className="inline-flex size-8 items-center justify-center rounded-md text-sparkle-text-muted/55 transition-colors hover:bg-[var(--surface-hover)] hover:text-sparkle-text" aria-label="Close downloads"><X size={13} /></button>
                </header>

                <div className="shrink-0 p-2.5">
                    <div role="tablist" aria-label="Downloads source" className="mb-2 flex h-7 items-center rounded-md bg-[color-mix(in_srgb,var(--color-text)_5%,transparent)] p-0.5">
                        <button type="button" role="tab" aria-selected={view === 'zyra'} onClick={() => setView('zyra')} className={cn('h-full flex-1 rounded-[4px] text-[9px] font-medium text-sparkle-text-muted transition-[background-color,color,box-shadow] duration-150 hover:text-sparkle-text', view === 'zyra' && 'bg-[var(--color-card)] text-sparkle-text shadow-sm')}>Zyra</button>
                        <button type="button" role="tab" aria-selected={view === 'folder'} onClick={() => setView('folder')} className={cn('h-full flex-1 rounded-[4px] text-[9px] font-medium text-sparkle-text-muted transition-[background-color,color,box-shadow] duration-150 hover:text-sparkle-text', view === 'folder' && 'bg-[var(--color-card)] text-sparkle-text shadow-sm')}>Folder</button>
                    </div>
                    <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--surface-divider)] bg-[color-mix(in_srgb,var(--color-text)_3%,transparent)] px-2.5 focus-within:border-[var(--accent-primary)]/35">
                        <Search size={12} className="text-sparkle-text-muted/45" />
                        <input value={query} onChange={(event) => setQuery(event.target.value)} aria-label="Search downloads" className="min-w-0 flex-1 bg-transparent text-[10px] text-[var(--color-text)] outline-none placeholder:text-[color-mix(in_srgb,var(--color-text)_42%,transparent)]" placeholder={view === 'folder' ? 'Search Downloads folder' : 'Search Zyra downloads'} />
                        {(view === 'folder' ? folderLoading : loading) ? <LoaderCircle size={11} className="animate-spin text-sparkle-text-muted/50" /> : null}
                    </label>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 custom-scrollbar">
                    {view === 'folder' ? folderGroups.length === 0 ? (
                        <div className="flex min-h-32 items-center justify-center text-[10px] text-sparkle-text-muted/55">
                            {folderLoading ? 'Reading Downloads folder…' : query ? 'No matching files.' : 'The Downloads folder is empty.'}
                        </div>
                    ) : folderGroups.map((group) => (
                        <section key={group.id} className="mb-3" aria-label={group.label}>
                            <div className="flex h-7 items-center px-1.5 text-[10px] font-medium text-[var(--color-text)]">{group.label}</div>
                            <div className="divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                                {group.entries.map((entry) => (
                                    <article key={entry.filename} className={cn('group/folder-file flex min-h-14 items-center gap-2.5 px-2 py-1.5 transition-colors hover:bg-[var(--surface-hover)]', entry.risk === 'dangerous' && 'bg-red-500/[0.045] hover:bg-red-500/[0.07]', entry.risk === 'archive' && 'bg-amber-400/[0.025] hover:bg-amber-400/[0.05]')}>
                                        <button type="button" onClick={() => openFolderEntry(entry)} className="inline-flex size-8 shrink-0 items-center justify-center opacity-90 hover:opacity-100" title={`Open ${entry.filename}`}><FolderFileIcon entry={entry} theme={iconTheme} /></button>
                                        <button type="button" onClick={() => openFolderEntry(entry)} className="min-w-0 flex-1 text-left">
                                            <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium leading-4 text-sparkle-text" title={entry.filename}>
                                                <span className="truncate">{entry.filename}</span>
                                                {entry.risk === 'dangerous' ? <AlertTriangle size={10} className="shrink-0 text-red-300" aria-label="Dangerous file" /> : null}
                                            </span>
                                            <span className={cn('block truncate text-[9px] leading-3.5 text-sparkle-text-muted/60', entry.risk === 'dangerous' && 'text-red-200/80', entry.risk === 'archive' && 'text-amber-200/70')}>{formatBytes(entry.size)}{entry.risk === 'dangerous' ? ' · Can run code' : entry.risk === 'archive' ? ' · Archive' : ''}</span>
                                            <span className="block truncate text-[8px] leading-3 text-sparkle-text-muted/40">Modified {formatFolderEntryTime(entry)}</span>
                                        </button>
                                        <button type="button" onClick={() => void actOnFolderEntry({ type: 'reveal', filename: entry.filename })} className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-sparkle-text-muted/50 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title={`Show ${entry.filename} in folder`} aria-label={`Show ${entry.filename} in folder`}><FolderOpen size={12} /></button>
                                    </article>
                                ))}
                            </div>
                        </section>
                    )) : downloadGroups.length === 0 ? (
                        <div className="flex min-h-32 items-center justify-center text-[10px] text-sparkle-text-muted/55">
                            {loading ? 'Loading downloads…' : query ? 'No matching downloads.' : 'No downloads yet.'}
                        </div>
                    ) : downloadGroups.map((group) => (
                        <section key={group.id} className="mb-3" aria-label={group.label}>
                            <div className="flex h-7 items-center px-1.5 text-[10px] font-medium text-[var(--color-text)]">{group.label}</div>
                            <div className="divide-y divide-[var(--surface-divider)] border-y border-[var(--surface-divider)]">
                                {group.downloads.map((download) => {
                                    const progress = downloadProgress(download)
                                    const active = download.status === 'progressing' || download.status === 'paused'
                                    const hasOptions = !active && (download.exists || download.canRetry)
                                    return (
                                        <article key={download.id} className={cn('group/download relative flex min-h-14 items-center gap-2.5 px-2 py-1.5 transition-colors hover:bg-[var(--surface-hover)]', download.risk === 'dangerous' && 'bg-red-500/[0.045] hover:bg-red-500/[0.07]', download.risk === 'archive' && 'bg-amber-400/[0.025] hover:bg-amber-400/[0.05]')}>
                                            <button type="button" disabled={!download.exists} onClick={() => openDownload(download)} className="inline-flex size-8 shrink-0 items-center justify-center opacity-90 hover:opacity-100 disabled:opacity-40" title={download.exists ? `Open ${download.filename}` : download.filename}><DownloadFileIcon download={download} theme={iconTheme} /></button>
                                            <button type="button" disabled={!download.exists} onClick={() => openDownload(download)} className="min-w-0 flex-1 text-left disabled:pointer-events-none">
                                                <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium leading-4 text-sparkle-text" title={download.filename}>
                                                    <span className="truncate">{download.filename}</span>
                                                    {download.risk === 'dangerous' ? <AlertTriangle size={10} className="shrink-0 text-red-300" aria-label="Dangerous file" /> : null}
                                                </span>
                                                <span className={cn('block truncate text-[9px] leading-3.5 text-sparkle-text-muted/60', download.risk === 'dangerous' && 'text-red-200/80', download.risk === 'archive' && 'text-amber-200/70')}>{downloadDetail(download)}</span>
                                                <span className="block truncate text-[8px] leading-3 text-sparkle-text-muted/40">{download.sourceOrigin || 'Unknown source'}{formatDownloadTime(download) ? ` · ${formatDownloadTime(download)}` : ''}</span>
                                            </button>
                                            <div className="flex shrink-0 items-center">
                                                {download.status === 'progressing' ? <button type="button" onClick={() => void act({ type: 'pause', id: download.id })} className="inline-flex size-7 items-center justify-center rounded-md text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Pause download" aria-label={`Pause ${download.filename}`}><Pause size={12} /></button> : null}
                                                {(download.status === 'paused' || download.status === 'interrupted') && download.canResume ? <button type="button" onClick={() => void act({ type: 'resume', id: download.id })} className="inline-flex size-7 items-center justify-center rounded-md text-sparkle-text-muted/55 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Resume download" aria-label={`Resume ${download.filename}`}><Play size={12} /></button> : null}
                                                {active ? <button type="button" onClick={() => void act({ type: 'cancel', id: download.id })} className="inline-flex size-7 items-center justify-center rounded-md text-sparkle-text-muted/55 hover:bg-red-400/[0.10] hover:text-red-200" title="Cancel download" aria-label={`Cancel ${download.filename}`}><X size={12} /></button> : null}
                                                {hasOptions ? <button type="button" data-browser-download-history-options onClick={(event) => {
                                                    const rect = event.currentTarget.getBoundingClientRect()
                                                    const estimatedHeight = download.exists ? 126 : 38
                                                    const top = rect.bottom + 4 + estimatedHeight <= window.innerHeight
                                                        ? rect.bottom + 4
                                                        : Math.max(4, rect.top - estimatedHeight - 4)
                                                    setOptionsMenu((current) => current?.downloadId === download.id ? null : {
                                                        downloadId: download.id,
                                                        left: Math.max(4, Math.min(window.innerWidth - 176, rect.right - 172)),
                                                        top
                                                    })
                                                }} className="inline-flex size-7 items-center justify-center rounded-md text-sparkle-text-muted/50 hover:bg-[var(--surface-hover)] hover:text-sparkle-text" title="Download options" aria-label={`Options for ${download.filename}`} aria-expanded={optionsMenu?.downloadId === download.id}><Ellipsis size={13} /></button> : null}
                                            </div>
                                            {active ? (
                                                <div className="absolute inset-x-2 bottom-0 h-px overflow-hidden bg-[color-mix(in_srgb,var(--color-text)_9%,transparent)]">
                                                    <span className={cn('block h-full bg-[var(--accent-primary)] transition-[width] duration-150 ease-out', progress === null && 'browser-download-progress-indeterminate')} style={{ width: progress === null ? '35%' : `${Math.max(2, progress * 100)}%` }} />
                                                </div>
                                            ) : null}
                                        </article>
                                    )
                                })}
                            </div>
                        </section>
                    ))}
                </div>
                {error ? <div role="status" className="shrink-0 border-t border-red-400/15 bg-red-400/[0.06] px-3 py-2 text-[9px] text-red-200">{error}</div> : null}
            </section>

            {optionsMenu && optionsDownload ? createPortal((
                <div data-browser-download-history-options role="menu" aria-label={`Options for ${optionsDownload.filename}`} className="fixed z-[520] w-[172px] overflow-hidden rounded-[6px] border border-[var(--surface-divider)] bg-[var(--surface-floating)] p-1 shadow-[0_12px_30px_rgba(0,0,0,0.32)]" style={{ left: optionsMenu.left, top: optionsMenu.top }}>
                    {optionsCanOpenHere ? <button type="button" role="menuitem" onClick={() => void openHere(optionsDownload)} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><FileSearch2 size={12} /><span>Open here</span></button> : null}
                    {optionsDownload.exists ? <button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); openDownload(optionsDownload) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><ExternalLink size={12} /><span>Open</span></button> : null}
                    {optionsDownload.canRetry ? <button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); void act({ type: 'retry', id: optionsDownload.id }) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><RotateCcw size={12} /><span>Retry</span></button> : null}
                    {optionsDownload.exists ? <button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); void act({ type: 'reveal', id: optionsDownload.id }) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-sparkle-text-secondary hover:bg-[var(--surface-hover)] hover:text-sparkle-text"><FolderOpen size={12} /><span>Show in folder</span></button> : null}
                    {optionsDownload.exists ? <><div className="my-1 h-px bg-[var(--surface-divider)]" /><button type="button" role="menuitem" onClick={() => { setOptionsMenu(null); setPendingDelete(optionsDownload) }} className="flex h-7 w-full items-center gap-2 rounded-[3px] px-2 text-left text-[10px] text-red-200/85 hover:bg-red-400/[0.10] hover:text-red-100"><Trash2 size={12} /><span>Delete</span></button></> : null}
                </div>
            ), document.body) : null}

            <ConfirmModal
                isOpen={pendingOpen !== null}
                title="This file can run code"
                message={pendingOpen ? `“${pendingOpen.download.filename}” can run code or change files on this PC. Open it only if you trust ${pendingOpen.download.sourceOrigin || 'its source'}. ${dangerousProtectionMessage(pendingOpen.download)}` : ''}
                confirmLabel="Open anyway"
                cancelLabel="Keep closed"
                variant="danger"
                visual={pendingOpen ? <span className="inline-flex size-12 items-center justify-center rounded-[9px] border border-red-400/20 bg-red-500/[0.08]"><DownloadFileIcon download={pendingOpen.download} theme={iconTheme} /></span> : null}
                onCancel={() => setPendingOpen(null)}
                onConfirm={() => {
                    if (!pendingOpen) return
                    const { download, token } = pendingOpen
                    setPendingOpen(null)
                    void act({ type: 'confirm-open', id: download.id, token })
                }}
            />
            <ConfirmModal
                isOpen={pendingFolderOpen !== null}
                title="This file can run code"
                message={pendingFolderOpen ? `“${pendingFolderOpen.entry.filename}” can run code or change files on this PC. Open it only if you trust where it came from.` : ''}
                confirmLabel="Open anyway"
                cancelLabel="Keep closed"
                variant="danger"
                visual={pendingFolderOpen ? <span className="inline-flex size-12 items-center justify-center rounded-[9px] border border-red-400/20 bg-red-500/[0.08]"><FolderFileIcon entry={pendingFolderOpen.entry} theme={iconTheme} /></span> : null}
                onCancel={() => setPendingFolderOpen(null)}
                onConfirm={() => {
                    if (!pendingFolderOpen) return
                    const { entry, token } = pendingFolderOpen
                    setPendingFolderOpen(null)
                    void actOnFolderEntry({ type: 'confirm-open', filename: entry.filename, token })
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
