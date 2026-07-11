import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, FolderTree, FolderOpen, Compass, ExternalLink } from 'lucide-react'
import { resolveExplorerHomePath, useDefaultExplorerHomePath } from '@/lib/explorerHome'
import { useSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { SettingsBetaBadge } from './SettingsBetaBadge'

export default function ExplorerSettings() {
    const { settings, updateSettings } = useSettings()
    const [selectingHome, setSelectingHome] = useState(false)
    const defaultExplorerHomePath = useDefaultExplorerHomePath()
    const resolvedExplorerHomePath = resolveExplorerHomePath(settings.explorerHomePath, defaultExplorerHomePath)

    const handleToggleExplorer = () => {
        if (settings.explorerTabEnabled) {
            updateSettings({ explorerTabEnabled: false })
            return
        }

        updateSettings({
            explorerTabEnabled: true,
            explorerHomePath: resolvedExplorerHomePath || settings.explorerHomePath
        })
    }

    const handleSelectHome = async () => {
        setSelectingHome(true)
        try {
            const result = await window.devscope.selectFolder()
            if (result.success && result.folderPath) {
                updateSettings({
                    explorerHomePath: result.folderPath,
                    explorerTabEnabled: true
                })
            }
        } catch (error) {
            console.error('Failed to choose explorer home folder:', error)
        } finally {
            setSelectingHome(false)
        }
    }

    return (
        <div className="animate-fadeIn">
            <div className="mb-8">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-amber-500/10 p-2">
                            <FolderTree className="text-amber-300" size={24} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h1 className="text-2xl font-semibold text-sparkle-text">Explorer</h1>
                                <SettingsBetaBadge />
                            </div>
                            <p className="text-sparkle-text-secondary">Turn Zyra into an opt-in file browser tab.</p>
                        </div>
                    </div>
                    <Link
                        to="/settings"
                        className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03] hover:text-[var(--accent-primary)]"
                    >
                        <ArrowLeft size={16} />
                        Back to Settings
                    </Link>
                </div>
            </div>

            <div className="mb-6 rounded-xl border border-amber-400/20 bg-gradient-to-br from-amber-500/12 via-amber-500/6 to-transparent p-5">
                <div className="flex items-start gap-3">
                    <div className="mt-0.5 rounded-lg border border-amber-400/20 bg-amber-500/10 p-2">
                        <Compass size={18} className="text-amber-300" />
                    </div>
                    <div className="min-w-0 flex-1">
                        <h2 className="font-semibold text-sparkle-text">Explorer is optional</h2>
                        <p className="mt-1 text-sm leading-relaxed text-sparkle-text-secondary">
                            When enabled, Explorer is available beside Projects. It remembers the last folder you visited and otherwise starts from your OS home folder, unless you override it here.
                        </p>
                    </div>
                </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
                <section className="rounded-xl border border-white/10 bg-sparkle-card p-6">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <h3 className="font-semibold text-sparkle-text">Explorer tab</h3>
                            <p className="mt-1 text-sm text-sparkle-text-secondary">
                                Add or remove the optional Explorer surface.
                            </p>
                        </div>
                        <button
                            type="button"
                            onClick={handleToggleExplorer}
                            className={cn(
                                'relative h-7 w-12 shrink-0 rounded-full transition-colors',
                                settings.explorerTabEnabled ? 'bg-[var(--accent-primary)]' : 'bg-white/10'
                            )}
                        >
                            <div
                                className={cn(
                                    'absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform',
                                    settings.explorerTabEnabled ? 'translate-x-6' : 'translate-x-1'
                                )}
                            />
                        </button>
                    </div>

                    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-sparkle-text">
                                    {settings.explorerTabEnabled ? 'Enabled' : 'Disabled by default'}
                                </p>
                                <p className="mt-1 text-xs text-sparkle-text-secondary">
                                    The tab only appears after you turn it on here.
                                </p>
                            </div>
                            <span className={cn(
                                'rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
                                settings.explorerTabEnabled
                                    ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                    : 'border-white/10 bg-white/[0.04] text-sparkle-text-muted'
                            )}>
                                {settings.explorerTabEnabled ? 'On' : 'Off'}
                            </span>
                        </div>
                    </div>
                </section>

                <section className="rounded-xl border border-white/10 bg-sparkle-card p-6">
                    <h3 className="font-semibold text-sparkle-text">Launch behavior</h3>
                    <p className="mt-1 text-sm text-sparkle-text-secondary">
                        Pick the folder Explorer should open first when there is no saved last location.
                    </p>

                    <div className="mt-5 rounded-xl border border-white/10 bg-white/[0.03] p-4">
                        <div className="flex items-start gap-3">
                            <div className="rounded-lg border border-white/10 bg-black/10 p-2">
                                <FolderOpen size={18} className="text-amber-300" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <p className="text-sm font-medium text-sparkle-text">Explorer home folder</p>
                                <p className="mt-1 break-all font-mono text-xs text-sparkle-text-secondary">
                                    {resolvedExplorerHomePath || 'Resolving your home folder...'}
                                </p>
                                <p className="mt-1 text-xs text-sparkle-text-muted">
                                    {settings.explorerHomePath ? 'Custom Explorer root' : 'Default root: your user home (~)'}
                                </p>
                            </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={handleSelectHome}
                                disabled={selectingHome}
                                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-sparkle-text transition-colors hover:border-white/20 hover:bg-white/[0.05] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <FolderOpen size={16} />
                                {selectingHome ? 'Choosing...' : settings.explorerHomePath ? 'Change home folder' : 'Choose home folder'}
                            </button>

                            {settings.explorerHomePath && (
                                <button
                                    type="button"
                                    onClick={() => updateSettings({ explorerHomePath: '' })}
                                    className="inline-flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/8 px-4 py-2 text-sm text-red-200 transition-colors hover:border-red-400/30 hover:bg-red-500/12"
                                >
                                    <Compass size={16} />
                                    Reset to default (~)
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4">
                        <p className="text-sm font-medium text-sparkle-text">How it behaves</p>
                        <ul className="mt-2 space-y-2 text-xs leading-relaxed text-sparkle-text-secondary">
                            <li>Explorer opens from your OS home folder when no previous Explorer location is saved.</li>
                            <li>The sidebar tab remembers the last Explorer folder you visited.</li>
                            <li>Projects stays separate. Explorer is an extra file-browser surface, not a replacement for the Projects tab.</li>
                            <li>Explorer never borrows the Projects root unless you explicitly point it there yourself.</li>
                        </ul>
                    </div>

                    {settings.explorerTabEnabled && resolvedExplorerHomePath && (
                        <Link
                            to="/explorer"
                            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/10 bg-[var(--accent-primary)]/12 px-4 py-2 text-sm text-[var(--accent-primary)] transition-colors hover:border-white/20 hover:bg-[var(--accent-primary)]/18"
                        >
                            <ExternalLink size={16} />
                            Open Explorer
                        </Link>
                    )}
                </section>
            </div>
        </div>
    )
}
