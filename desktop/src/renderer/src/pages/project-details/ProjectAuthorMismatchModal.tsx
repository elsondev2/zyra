import { AlertCircle } from 'lucide-react'

type ProjectAuthorMismatchModalProps = {
    gitUser: { name: string; email: string }
    repoOwner: string
    onConfirm: () => void
    onCancel: () => void
    dontShowAgain: boolean
    setDontShowAgain: (value: boolean) => void
}

export function ProjectAuthorMismatchModal({
    gitUser,
    repoOwner,
    onConfirm,
    onCancel,
    dontShowAgain,
    setDontShowAgain
}: ProjectAuthorMismatchModalProps) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn" onClick={onCancel}>
            <div
                className="bg-sparkle-card border border-yellow-500/30 rounded-2xl shadow-2xl w-full max-w-md m-4 overflow-hidden"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="p-6">
                    <div className="mb-4 flex items-start gap-4">
                        <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/10 p-3">
                            <AlertCircle size={24} className="text-yellow-500" />
                        </div>
                        <div className="flex-1">
                            <h3 className="mb-2 text-lg font-semibold text-white">
                                Author Mismatch Warning
                            </h3>
                            <p className="mb-4 text-sm text-white/60">
                                Your current Git user doesn't match the repository owner.
                            </p>

                            <div className="space-y-3 rounded-xl border border-white/5 bg-black/30 p-4">
                                <div>
                                    <p className="mb-1 text-xs text-white/40">Repository Owner:</p>
                                    <p className="text-sm font-mono text-white/80">{repoOwner}</p>
                                </div>
                                <div>
                                    <p className="mb-1 text-xs text-white/40">Current Git User:</p>
                                    <p className="text-sm font-mono text-white/80">{gitUser.name}</p>
                                    <p className="text-xs font-mono text-white/40">{gitUser.email}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    <label className="group mb-4 flex cursor-pointer items-center gap-2">
                        <input
                            type="checkbox"
                            checked={dontShowAgain}
                            onChange={(event) => setDontShowAgain(event.target.checked)}
                            className="h-4 w-4 rounded border-white/20 bg-white/5 text-[var(--accent-primary)] focus:ring-2 focus:ring-[var(--accent-primary)]/50"
                        />
                        <span className="text-sm text-white/60 transition-colors group-hover:text-white/80">
                            Don't show this warning again
                        </span>
                    </label>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={onCancel}
                            className="flex-1 rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white transition-all hover:bg-white/10"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={onConfirm}
                            className="flex-1 rounded-lg border border-yellow-500/30 bg-yellow-500/20 px-4 py-2.5 text-sm font-medium text-yellow-500 transition-all hover:bg-yellow-500/30 hover:text-yellow-400"
                        >
                            Commit Anyway
                        </button>
                    </div>
                </div>
            </div>
        </div>
    )
}
