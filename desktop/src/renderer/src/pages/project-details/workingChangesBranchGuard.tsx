import { RefreshCw } from 'lucide-react'
import { Checkbox, Input } from '@/components/ui/FormControls'

function slugifyBranchSegment(value: string) {
    return String(value || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 40)
}

function buildBranchSeed(commitMessage: string) {
    const fromCommit = slugifyBranchSegment(commitMessage)
    if (fromCommit) return fromCommit

    const now = new Date()
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    return `update-${yyyy}${mm}${dd}-${hh}${min}`
}

export function buildProposedBranchName(commitMessage: string, branchNames: string[]) {
    const existing = new Set(branchNames.map((name) => String(name || '').trim().toLowerCase()).filter(Boolean))
    const seed = buildBranchSeed(commitMessage)
    const base = `feature/${seed}`
    if (!existing.has(base.toLowerCase())) return base

    for (let index = 2; index < 100; index += 1) {
        const next = `${base}-${index}`
        if (!existing.has(next.toLowerCase())) return next
    }

    return `${base}-${Date.now()}`
}

export function BranchGuardModal({
    isOpen,
    isCreating,
    currentBranch,
    proposedBranchName,
    setProposedBranchName,
    autoCreateNextTime,
    setAutoCreateNextTime,
    branchGuardError,
    onCancel,
    onConfirm
}: {
    isOpen: boolean
    isCreating: boolean
    currentBranch: string
    proposedBranchName: string
    setProposedBranchName: (value: string) => void
    autoCreateNextTime: boolean
    setAutoCreateNextTime: (value: boolean) => void
    branchGuardError: string
    onCancel: () => void
    onConfirm: () => void
}) {
    if (!isOpen) return null

    return (
        <div
            className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-md animate-fadeIn"
            onClick={() => {
                if (isCreating) return
                onCancel()
            }}
        >
            <div
                className="m-4 w-full max-w-lg rounded-2xl border border-white/10 bg-sparkle-card p-5 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start gap-3">
                    <div className="rounded-xl border border-amber-500/25 bg-amber-500/12 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-200">
                        Same branch
                    </div>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-white">Create a branch first?</h3>
                <p className="mt-2 text-sm text-white/62">
                    Current branch and target branch are both <span className="font-medium text-white">{currentBranch}</span>.
                </p>
                <div className="mt-4 space-y-3">
                    <div>
                        <div className="mb-2 text-xs uppercase tracking-wide text-white/42">Proposed branch</div>
                        <Input
                            value={proposedBranchName}
                            onChange={setProposedBranchName}
                            placeholder="feature/my-change"
                            disabled={isCreating}
                        />
                    </div>
                    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                        <Checkbox
                            checked={autoCreateNextTime}
                            onChange={setAutoCreateNextTime}
                            label="Don't show again"
                            description="Next time Zyra will create a branch automatically."
                            size="sm"
                            disabled={isCreating}
                        />
                    </div>
                    {branchGuardError ? (
                        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                            {branchGuardError}
                        </div>
                    ) : null}
                </div>
                <div className="mt-5 flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={isCreating}
                        className="rounded-lg border border-white/10 px-3 py-2 text-sm text-white/70 transition-all hover:border-white/20 hover:bg-white/[0.04] hover:text-white disabled:opacity-50"
                    >
                        Deny
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={isCreating}
                        className="inline-flex items-center gap-2 rounded-lg border border-violet-500/30 bg-violet-500/15 px-3.5 py-2 text-sm font-medium text-violet-100 transition-all hover:bg-violet-500/22 disabled:opacity-50"
                    >
                        {isCreating ? <RefreshCw size={14} className="animate-spin" /> : null}
                        Accept
                    </button>
                </div>
            </div>
        </div>
    )
}
