import { Folder, FolderTree, Settings as SettingsIcon } from 'lucide-react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/ui/LoadingState'

export function FolderBrowseEmptyState(input: {
    emptyStateDescription: string
    emptyStateTitle: string
    isExplorerMode: boolean
    isResolvingExplorerHomePath: boolean
    onSelectExplorerHome: () => void
    settingsButtonLabel: string
    settingsRoute: string
    surfaceTitle: string
}) {
    const {
        emptyStateDescription,
        emptyStateTitle,
        isExplorerMode,
        isResolvingExplorerHomePath,
        onSelectExplorerHome,
        settingsButtonLabel,
        settingsRoute,
        surfaceTitle
    } = input

    if (isResolvingExplorerHomePath) {
        return (
            <div className="animate-fadeIn">
                <div className="mb-8">
                    <div className="mb-2 flex items-center gap-3">
                        <div className="rounded-lg bg-amber-500/10 p-2">
                            <FolderTree className="text-amber-300" size={24} />
                        </div>
                        <h1 className="text-2xl font-semibold text-sparkle-text">{surfaceTitle}</h1>
                    </div>
                    <p className="text-sparkle-text-secondary">
                        A full-file browser layer for Zyra, available only when you opt in.
                    </p>
                </div>

                <LoadingSpinner
                    message="Loading"
                    minHeightClassName="min-h-[28vh]"
                />
            </div>
        )
    }

    return (
        <div className="animate-fadeIn">
            <div className="mb-8">
                <div className="mb-2 flex items-center gap-3">
                    <div className={cn(
                        'rounded-lg p-2',
                        isExplorerMode ? 'bg-amber-500/10' : 'bg-indigo-500/10'
                    )}>
                        <FolderTree className={isExplorerMode ? 'text-amber-300' : 'text-indigo-400'} size={24} />
                    </div>
                    <h1 className="text-2xl font-semibold text-sparkle-text">{surfaceTitle}</h1>
                </div>
                <p className="text-sparkle-text-secondary">
                    {isExplorerMode ? "A full-file browser layer for Zyra, available only when you opt in." : 'Your coding projects in one place'}
                </p>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl border border-white/10 bg-sparkle-card py-16">
                <Folder className="mb-4 text-sparkle-text-muted" size={48} />
                <h3 className="mb-2 text-lg font-medium text-sparkle-text">{emptyStateTitle}</h3>
                <p className="mb-6 max-w-md text-center text-sparkle-text-secondary">
                    {emptyStateDescription}
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                    {isExplorerMode && (
                        <button
                            type="button"
                            onClick={onSelectExplorerHome}
                            className="flex items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-white transition-colors hover:bg-[var(--accent-primary)]/90"
                        >
                            <FolderTree size={16} />
                            <span>Choose Explorer Home</span>
                        </button>
                    )}
                    <Link
                        to={settingsRoute}
                        className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-4 py-2 text-sparkle-text transition-colors hover:border-white/20 hover:bg-white/[0.05]"
                    >
                        <SettingsIcon size={16} />
                        <span>{settingsButtonLabel}</span>
                    </Link>
                </div>
            </div>
        </div>
    )
}
