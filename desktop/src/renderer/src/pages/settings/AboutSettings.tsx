/**
 * Zyra - About Page
 */

import { Link } from 'react-router-dom'
import {
    ArrowLeft,
    Download,
    ExternalLink,
    Github,
    Heart,
    Info,
    RefreshCw,
    Rocket
} from 'lucide-react'
import { ZyraLogoASCII } from '@/components/ui/ZyraLogo'
import { getUpdateActionLabel, useAppUpdates } from '@/lib/app-updates'
import { cn } from '@/lib/utils'

export default function AboutSettings() {
    const {
        updateState,
        pendingAction,
        openModal,
        checkForUpdates,
        downloadUpdate,
        installUpdate,
        skipAvailableVersion,
        remindLater,
        clearSkippedVersion
    } = useAppUpdates()

    const isBusy = pendingAction !== null
    const updateSummary = getUpdateActionLabel(updateState)
    const updateTone = resolveUpdateTone(updateState?.status)

    return (
        <div className="animate-fadeIn">
            <div className="mb-6">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-emerald-500/10">
                            <Info className="text-emerald-400" size={24} />
                        </div>
                        <div>
                            <h1 className="text-xl font-semibold text-sparkle-text">About Zyra</h1>
                            <p className="text-sm text-sparkle-text-secondary">Version, channel, and release updates</p>
                        </div>
                    </div>
                    <Link
                        to="/settings"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm text-sparkle-text hover:text-[var(--accent-primary)] bg-sparkle-card hover:bg-white/[0.03] border border-white/10 hover:border-white/20 rounded-lg transition-all shrink-0"
                    >
                        <ArrowLeft size={16} />
                        Back to Settings
                    </Link>
                </div>
            </div>

            <div className="space-y-6">
                <div className="bg-sparkle-card rounded-xl border border-white/10 p-8 overflow-hidden">
                    <div className="flex flex-col items-center">
                        <div className="mb-6 overflow-x-auto max-w-full">
                            <ZyraLogoASCII />
                        </div>
                        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[var(--accent-primary)]/10 text-[var(--accent-primary)] text-sm font-medium">
                            {updateState?.currentDisplayVersion || 'v0.5.0'}
                        </div>

                        <p className="text-xs text-sparkle-text-muted mt-3">
                            {updateState?.currentVersion || '0.5.0'}
                            {updateState?.channel ? ` \u2022 ${updateState.channel} channel` : ''}
                        </p>
                        <a
                            href="https://github.com/justelson"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-2 text-xs text-sparkle-text-muted transition-colors hover:text-[var(--accent-primary)]"
                        >
                            by justelson
                        </a>
                    </div>
                </div>

                <div className="relative overflow-hidden rounded-xl border border-white/10 bg-sparkle-card">
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-[var(--accent-primary)]/12 via-white/[0.03] to-transparent" />
                    <div className="relative p-5 md:p-6">
                        <div className="flex flex-col gap-4 border-b border-white/5 pb-5 md:flex-row md:items-start md:justify-between">
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-3">
                                    <h3 className="font-semibold text-sparkle-text">App Updates</h3>
                                    <UpdateStatusPill
                                        label={updateSummary}
                                        tone={updateTone}
                                    />
                                </div>
                                <p className="mt-2 max-w-2xl text-sm text-sparkle-text-secondary">
                                    Manage update checks, downloads, and installs from one place without leaving the About page.
                                </p>
                            </div>

                            <div className="grid gap-2 sm:grid-cols-2 xl:min-w-[360px]">
                                <UpdateActionButton
                                    onClick={() => {
                                        clearSkippedVersion()
                                        void checkForUpdates()
                                    }}
                                    disabled={isBusy || !updateState?.enabled || updateState.status === 'checking'}
                                    icon={<RefreshCw size={16} className={cn(pendingAction === 'check' && 'animate-spin')} />}
                                    label={updateState?.status === 'checking' ? 'Checking...' : 'Check for updates'}
                                />
                                <UpdateActionButton
                                    onClick={() => { void downloadUpdate() }}
                                    disabled={isBusy || updateState?.status !== 'available'}
                                    icon={<Download size={16} />}
                                    label={pendingAction === 'download' ? 'Downloading...' : 'Download update'}
                                />
                                <UpdateActionButton
                                    onClick={() => { void installUpdate() }}
                                    disabled={isBusy || updateState?.status !== 'downloaded'}
                                    icon={<Rocket size={16} />}
                                    label={pendingAction === 'install' ? 'Restarting...' : 'Restart to install'}
                                    variant="accent"
                                />
                                <UpdateActionButton
                                    onClick={openModal}
                                    icon={<Rocket size={16} />}
                                    label="Open Update Center"
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <InfoCard label="Platform" value="Windows" />
                    <InfoCard label="Framework" value="Electron + React" />
                    <InfoCard label="Channel" value={updateState?.channel || 'alpha'} />
                    <InfoCard label="License" value="MIT" />
                </div>

                <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
                    <div className="space-y-4">
                        <div className="bg-sparkle-card rounded-xl border border-white/10 p-5">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
                                    <Heart size={20} className="text-white" />
                                </div>
                                <div>
                                    <p className="text-sm text-sparkle-text-secondary">Created by</p>
                                    <a
                                        href="https://github.com/justelson"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-semibold text-sparkle-text transition-colors hover:text-[var(--accent-primary)]"
                                    >
                                        justelson
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="bg-sparkle-card rounded-xl border border-white/10 p-5">
                            <h3 className="mb-4 font-semibold text-sparkle-text">Built With</h3>
                            <div className="flex flex-wrap gap-2">
                                {['Electron', 'React', 'TypeScript', 'Tailwind CSS', 'Vite', 'Lucide Icons'].map((tech) => (
                                    <span
                                        key={tech}
                                        className="px-3 py-1 rounded-full bg-sparkle-accent text-sm text-sparkle-text-secondary"
                                    >
                                        {tech}
                                    </span>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-sparkle-card rounded-xl border border-white/10 p-5">
                        <h3 className="mb-4 font-semibold text-sparkle-text">Links</h3>
                        <div className="space-y-2">
                            <LinkRow
                                icon={<Github size={18} />}
                                label="Creator GitHub"
                                href="https://github.com/justelson"
                            />
                            <LinkRow
                                icon={<Github size={18} />}
                                label="Source Code"
                                href="https://github.com/justelson/zyra"
                            />
                            <LinkRow
                                icon={<ExternalLink size={18} />}
                                label="Report an Issue"
                                href="https://github.com/justelson/zyra/issues"
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

function resolveUpdateTone(status: string | undefined): 'neutral' | 'checking' | 'available' | 'downloaded' | 'error' {
    switch (status) {
        case 'checking':
        case 'downloading':
            return 'checking'
        case 'available':
            return 'available'
        case 'downloaded':
            return 'downloaded'
        case 'error':
            return 'error'
        default:
            return 'neutral'
    }
}

function UpdateStatusPill({
    label,
    tone
}: {
    label: string
    tone: 'neutral' | 'checking' | 'available' | 'downloaded' | 'error'
}) {
    const toneClass = (() => {
        switch (tone) {
            case 'checking':
                return 'border-sky-400/25 bg-sky-400/10 text-sky-200'
            case 'available':
                return 'border-amber-400/25 bg-amber-400/10 text-amber-200'
            case 'downloaded':
                return 'border-emerald-400/25 bg-emerald-400/10 text-emerald-200'
            case 'error':
                return 'border-red-400/25 bg-red-400/10 text-red-200'
            default:
                return 'border-white/10 bg-white/[0.04] text-sparkle-text-secondary'
        }
    })()

    return (
        <span className={cn(
            'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
            toneClass
        )}>
            {label}
        </span>
    )
}

function UpdateActionButton({
    onClick,
    icon,
    label,
    disabled = false,
    variant = 'default'
}: {
    onClick: () => void
    icon: React.ReactNode
    label: string
    disabled?: boolean
    variant?: 'default' | 'accent'
}) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={cn(
                'inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50',
                variant === 'accent'
                    ? 'border-white/10 bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] hover:border-white/20 hover:bg-[var(--accent-primary)]/18'
                    : 'border-white/10 bg-white/[0.03] text-sparkle-text hover:border-white/20 hover:bg-white/[0.06]'
            )}
        >
            {icon}
            <span>{label}</span>
        </button>
    )
}

function InfoCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="bg-sparkle-card rounded-xl border border-white/10 p-4">
            <p className="text-xs text-sparkle-text-muted uppercase tracking-wide mb-1">{label}</p>
            <p className="font-semibold text-sparkle-text">{value}</p>
        </div>
    )
}

function LinkRow({ icon, label, href }: { icon: React.ReactNode; label: string; href: string }) {
    return (
        <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-white/10 hover:border-white/20 hover:bg-white/[0.03] transition-colors group"
        >
            <span className="text-sparkle-text-secondary group-hover:text-[var(--accent-primary)] transition-colors">
                {icon}
            </span>
            <span className="text-sm text-sparkle-text group-hover:text-[var(--accent-primary)] transition-colors">
                {label}
            </span>
            <ExternalLink size={14} className="ml-auto text-sparkle-text-muted" />
        </a>
    )
}
