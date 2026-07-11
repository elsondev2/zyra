import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Download,
    ExternalLink,
    RefreshCw,
    Rocket,
    X
} from 'lucide-react'
import { getUpdateActionLabel, useAppUpdates } from '@/lib/app-updates'
import { cn } from '@/lib/utils'

function formatCheckedAt(checkedAt: string | null): string | null {
    if (!checkedAt) return null

    const parsed = new Date(checkedAt)
    if (Number.isNaN(parsed.getTime())) return null

    return parsed.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit'
    })
}

function resolveStatusAccent(statusTone: ReturnType<typeof useAppUpdates>['statusTone']): string {
    switch (statusTone) {
        case 'checking':
        case 'downloading':
            return 'text-sky-300'
        case 'available':
            return 'text-amber-300'
        case 'downloaded':
            return 'text-emerald-300'
        case 'up-to-date':
            return 'text-emerald-200'
        case 'error':
            return 'text-red-300'
        default:
            return 'text-white/80'
    }
}

function resolveStatusOrb(statusTone: ReturnType<typeof useAppUpdates>['statusTone']): string {
    switch (statusTone) {
        case 'checking':
        case 'downloading':
            return 'bg-sky-400'
        case 'available':
            return 'bg-amber-400'
        case 'downloaded':
            return 'bg-emerald-400'
        case 'up-to-date':
            return 'bg-emerald-300'
        case 'error':
            return 'bg-red-400'
        default:
            return 'bg-white/35'
    }
}

function ExternalReleaseButton({
    href,
    label,
    className
}: {
    href: string
    label: string
    className?: string
}) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
                'inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06]',
                className
            )}
        >
            <ExternalLink size={15} />
            {label}
        </a>
    )
}

function UpdateActionRow() {
    const {
        updateState,
        pendingAction,
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        skipAvailableVersion,
        remindLater,
        clearSkippedVersion
    } = useAppUpdates()

    if (!updateState) return null

    const isBusy = pendingAction !== null

    switch (updateState.status) {
        case 'disabled':
            return (
                <ExternalReleaseButton
                    href={updateState.releasePageUrl}
                    label="Open latest release"
                />
            )
        case 'available':
            return (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={skipAvailableVersion}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
                    >
                        Skip
                    </button>
                    <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => { void downloadUpdate() }}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200 transition-colors hover:border-white/20 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Download size={15} />
                        {pendingAction === 'download' ? 'Downloading...' : 'Download update'}
                    </button>
                    <ExternalReleaseButton
                        href={updateState.releasePageUrl}
                        label="Release page"
                    />
                </div>
            )
        case 'downloading':
            return (
                <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200">
                    <RefreshCw size={15} className="animate-spin" />
                    Downloading...
                </div>
            )
        case 'downloaded':
            return (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={remindLater}
                        className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
                    >
                        Later
                    </button>
                    <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => { void installUpdate() }}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200 transition-colors hover:border-white/20 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Rocket size={15} />
                        {pendingAction === 'install' ? 'Restarting...' : 'Install & restart'}
                    </button>
                </div>
            )
        case 'checking':
            return (
                <div className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-sky-500/10 px-3 py-1.5 text-sm text-sky-200">
                    <RefreshCw size={15} className="animate-spin" />
                    Checking for updates...
                </div>
            )
        case 'error':
            return (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    {updateState.availableVersion && (
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => { void downloadUpdate() }}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Download again
                        </button>
                    )}
                    {updateState.downloadedVersion && (
                        <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => { void installUpdate() }}
                            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            Install again
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => {
                            clearSkippedVersion()
                            void checkForUpdates()
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-red-500/12 px-3 py-1.5 text-sm text-red-200 transition-colors hover:border-white/20 hover:bg-red-500/18 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={cn(pendingAction === 'check' && 'animate-spin')} />
                        Check again
                    </button>
                    <ExternalReleaseButton
                        href={updateState.releasePageUrl}
                        label="Open latest release"
                    />
                </div>
            )
        default:
            return (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <button
                        type="button"
                        disabled={isBusy || !updateState.enabled}
                        onClick={() => {
                            clearSkippedVersion()
                            void checkForUpdates()
                        }}
                        className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.06] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <RefreshCw size={15} className={cn(pendingAction === 'check' && 'animate-spin')} />
                        {updateState.status === 'up-to-date' ? 'Check again' : 'Check for updates'}
                    </button>
                    <ExternalReleaseButton
                        href={updateState.releasePageUrl}
                        label="Release page"
                    />
                </div>
            )
    }
}

export function UpdatePromptCenter() {
    const {
        updateState,
        isModalOpen,
        shouldShowPrompt,
        pendingAction,
        closeModal,
        openModal,
        downloadUpdate,
        installUpdate,
        remindLater,
        skipAvailableVersion,
        updateSuccessToast,
        dismissUpdateSuccessToast,
        statusTone
    } = useAppUpdates()

    useEffect(() => {
        if (!isModalOpen) return
        const originalOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = originalOverflow
        }
    }, [isModalOpen])

    if (!updateState) return null

    const checkedAtLabel = formatCheckedAt(updateState.checkedAt)
    const statusLabel = getUpdateActionLabel(updateState)
    const statusAccent = resolveStatusAccent(statusTone)
    const statusOrb = resolveStatusOrb(statusTone)
    const downloadPercent = Math.max(0, Math.min(100, updateState.downloadPercent ?? 0))
    const detailMessage = updateState.message && updateState.message !== updateState.disabledReason
        ? updateState.message
        : null

    const prompt = shouldShowPrompt ? (
        <div className="fixed bottom-4 right-4 z-[140] w-full max-w-md rounded-2xl border border-white/10 bg-sparkle-card/95 p-4 shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-3">
                <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03]', statusAccent)}>
                    {updateState.status === 'downloaded' ? (
                        <CheckCircle2 size={18} />
                    ) : updateState.status === 'available' ? (
                        <Rocket size={18} />
                    ) : (
                        <RefreshCw size={18} className="animate-spin" />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                    <button
                        type="button"
                        onClick={openModal}
                        className="w-full text-left"
                    >
                        <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-sparkle-text">
                                {updateState.status === 'downloaded'
                                    ? 'Download ready'
                                    : updateState.status === 'available'
                                        ? 'Update available'
                                        : 'Downloading update'}
                            </p>
                            <span className={cn('h-2 w-2 rounded-full', statusOrb)} />
                        </div>
                        <p className="mt-1 text-sm text-sparkle-text-secondary">
                            {statusLabel}
                        </p>
                    </button>

                    {updateState.status === 'downloading' && (
                        <div className="mt-3">
                            <div className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                <div
                                    className="h-full bg-sky-400 transition-[width] duration-300"
                                    style={{ width: `${downloadPercent}%` }}
                                />
                            </div>
                            <p className="mt-2 text-xs text-sparkle-text-muted">
                                {Math.round(downloadPercent)}% downloaded
                            </p>
                        </div>
                    )}

                    {updateState.status === 'available' && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={skipAvailableVersion}
                                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
                            >
                                Skip
                            </button>
                            <button
                                type="button"
                                disabled={pendingAction === 'download'}
                                onClick={() => { void downloadUpdate() }}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-amber-500/15 px-3 py-1.5 text-sm text-amber-200 transition-colors hover:border-white/20 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Download size={15} />
                                {pendingAction === 'download' ? 'Downloading...' : 'Download'}
                            </button>
                        </div>
                    )}

                    {updateState.status === 'downloaded' && (
                        <div className="mt-3 flex items-center justify-end gap-2">
                            <button
                                type="button"
                                onClick={remindLater}
                                className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
                            >
                                Later
                            </button>
                            <button
                                type="button"
                                disabled={pendingAction === 'install'}
                                onClick={() => { void installUpdate() }}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-emerald-500/15 px-3 py-1.5 text-sm text-emerald-200 transition-colors hover:border-white/20 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Rocket size={15} />
                                {pendingAction === 'install' ? 'Restarting...' : 'Install & restart'}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    ) : null

    const successToast = updateSuccessToast ? (
        <div
            className={cn(
                'fixed bottom-4 right-4 z-[145] w-full max-w-sm rounded-xl border border-emerald-400/20 bg-sparkle-card/95 p-3 shadow-2xl backdrop-blur-xl transition-all duration-150',
                updateSuccessToast.isVisible
                    ? 'translate-y-0 opacity-100'
                    : 'translate-y-2 opacity-0'
            )}
        >
            <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-500/12 text-emerald-200">
                    <CheckCircle2 size={17} />
                </div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-sparkle-text">
                        Update successful
                    </p>
                    <p className="mt-0.5 truncate text-sm text-sparkle-text-secondary">
                        Running {updateSuccessToast.versionLabel}
                    </p>
                </div>
                <button
                    type="button"
                    onClick={dismissUpdateSuccessToast}
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/[0.05] hover:text-white"
                    aria-label="Dismiss update success"
                >
                    <X size={15} />
                </button>
            </div>
        </div>
    ) : null

    const modal = isModalOpen && typeof document !== 'undefined'
        ? createPortal(
            <div
                className="fixed inset-0 z-[150] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn"
                onClick={closeModal}
            >
                <div
                    className="m-4 w-full max-w-2xl max-h-[95vh] overflow-hidden rounded-2xl border border-white/10 bg-sparkle-card shadow-2xl flex flex-col"
                    onClick={(event) => event.stopPropagation()}
                >
                    <div className="flex items-start justify-between gap-4 border-b border-white/10 px-6 py-5 flex-shrink-0">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className={cn('h-2.5 w-2.5 rounded-full', statusOrb)} />
                                <p className={cn('text-xs font-semibold uppercase tracking-[0.18em]', statusAccent)}>
                                    Update Center
                                </p>
                            </div>
                            <h2 className="mt-2 text-xl font-semibold text-sparkle-text">
                                {statusLabel}
                            </h2>
                            <p className="mt-2 text-sm text-sparkle-text-secondary">
                                Current version {updateState.currentDisplayVersion}
                                {updateState.channel ? ` on the ${updateState.channel} channel` : ''}.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={closeModal}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-white/65 transition-colors hover:border-white/20 hover:bg-white/[0.03] hover:text-white"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="space-y-5 px-6 py-5">
                        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                            <div className="flex items-start gap-3">
                                <div className={cn('mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-black/20', statusAccent)}>
                                    {updateState.status === 'error' ? (
                                        <AlertTriangle size={18} />
                                    ) : updateState.status === 'downloaded' ? (
                                        <CheckCircle2 size={18} />
                                    ) : updateState.status === 'up-to-date' ? (
                                        <CheckCircle2 size={18} />
                                    ) : updateState.status === 'available' ? (
                                        <Rocket size={18} />
                                    ) : updateState.status === 'checking' || updateState.status === 'downloading' ? (
                                        <RefreshCw size={18} className="animate-spin" />
                                    ) : (
                                        <Clock3 size={18} />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm font-semibold text-sparkle-text">
                                        {updateState.status === 'disabled'
                                            ? 'Automatic updates are unavailable in this build.'
                                            : updateState.status === 'downloaded'
                                            ? 'The update package is ready on this machine.'
                                            : updateState.status === 'available'
                                                ? 'A newer build is available for download.'
                                                : updateState.status === 'downloading'
                                                    ? 'The new release is downloading in the background.'
                                                    : updateState.status === 'up-to-date'
                                                        ? 'This app is already on the latest published build.'
                                                        : updateState.status === 'checking'
                                                            ? 'Checking GitHub Releases for a newer build.'
                                                            : updateState.status === 'error'
                                                                ? 'The updater hit an error.'
                                                                : 'Check GitHub Releases for new builds from here.'}
                                    </p>
                                    {updateState.disabledReason && (
                                        <p className="mt-2 text-sm text-amber-300">
                                            {updateState.disabledReason}
                                        </p>
                                    )}
                                    {detailMessage && (
                                        <p className="mt-2 text-sm text-amber-300">
                                            {detailMessage}
                                        </p>
                                    )}
                                    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-sparkle-text-muted">
                                        <span>Repository: {updateState.repository}</span>
                                        {checkedAtLabel && (
                                            <span>Last checked: {checkedAtLabel}</span>
                                        )}
                                        {updateState.availableDisplayVersion && (
                                            <span>Available: {updateState.availableDisplayVersion}</span>
                                        )}
                                        {!updateState.enabled && (
                                            <span>Manual fallback available via GitHub Releases</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {updateState.status === 'downloading' && (
                            <div className="rounded-2xl border border-white/10 bg-sky-500/8 p-4">
                                <div className="flex items-center justify-between gap-3 text-sm text-sky-200">
                                    <span>Downloading update package</span>
                                    <span>{Math.round(downloadPercent)}%</span>
                                </div>
                                <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/[0.06]">
                                    <div
                                        className="h-full bg-sky-400 transition-[width] duration-300"
                                        style={{ width: `${downloadPercent}%` }}
                                    />
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2">
                            <UpdateActionRow />
                        </div>
                    </div>
                </div>
            </div>,
            document.body
        )
        : null

    return (
        <>
            {successToast}
            {prompt}
            {modal}
        </>
    )
}
