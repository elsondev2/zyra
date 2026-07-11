import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, GitBranch } from 'lucide-react'
import type { DevScopeGitBranchSummary } from '@shared/contracts/devscope-api'
import { cn } from '@/lib/utils'

function getDefaultBranchName(branches: DevScopeGitBranchSummary[]): string | null {
    return branches.find((branch) => branch.name === 'main')?.name
        || branches.find((branch) => branch.name === 'master')?.name
        || null
}

export function AssistantHeaderBranchChip(props: {
    projectPath: string | null
    refreshToken: string
}) {
    const { projectPath, refreshToken } = props
    const rootRef = useRef<HTMLDivElement | null>(null)
    const [branches, setBranches] = useState<DevScopeGitBranchSummary[]>([])
    const [open, setOpen] = useState(false)
    const [switchingBranch, setSwitchingBranch] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        const trimmedPath = String(projectPath || '').trim()
        if (!trimmedPath) {
            setBranches([])
            setOpen(false)
            return
        }

        let cancelled = false
        setError(null)
        void window.devscope.listBranches(trimmedPath).then((result) => {
            if (cancelled) return
            setBranches(result?.success ? (result.branches || []) : [])
        }).catch(() => {
            if (!cancelled) setBranches([])
        })

        return () => {
            cancelled = true
        }
    }, [projectPath, refreshToken])

    useEffect(() => {
        if (!open) return
        const handlePointerDown = (event: PointerEvent) => {
            if (rootRef.current?.contains(event.target as Node)) return
            setOpen(false)
        }
        window.addEventListener('pointerdown', handlePointerDown)
        return () => window.removeEventListener('pointerdown', handlePointerDown)
    }, [open])

    const currentBranch = branches.find((branch) => branch.current) || null
    const defaultBranchName = useMemo(() => getDefaultBranchName(branches), [branches])
    const visibleBranches = useMemo(() => (
        [...branches].sort((left, right) => {
            if (left.current !== right.current) return left.current ? -1 : 1
            if (left.name === defaultBranchName) return -1
            if (right.name === defaultBranchName) return 1
            return left.name.localeCompare(right.name)
        })
    ), [branches, defaultBranchName])

    if (!projectPath || !currentBranch) return null

    const switchBranch = async (branchName: string) => {
        const trimmedPath = String(projectPath || '').trim()
        const trimmedBranch = String(branchName || '').trim()
        if (!trimmedPath || !trimmedBranch || trimmedBranch === currentBranch.name || switchingBranch) return

        setSwitchingBranch(trimmedBranch)
        setError(null)
        try {
            const result = await window.devscope.checkoutBranch(trimmedPath, trimmedBranch, {
                autoStash: true,
                autoCleanupLock: true
            })
            if (!result?.success) throw new Error(result?.error || 'Failed to switch branch')
            setBranches((previous) => previous.map((branch) => ({ ...branch, current: branch.name === trimmedBranch })))
            setOpen(false)
        } catch (switchError) {
            setError(switchError instanceof Error ? switchError.message : 'Failed to switch branch')
        } finally {
            setSwitchingBranch(null)
        }
    }

    return (
        <div ref={rootRef} className="relative">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                className="inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-lg border border-sparkle-border bg-sparkle-bg px-2.5 text-[11px] font-medium text-sparkle-text-secondary transition-colors hover:bg-sparkle-card-hover hover:text-sparkle-text"
                title={`Current branch: ${currentBranch.name}`}
            >
                <GitBranch size={13} className="shrink-0" />
                <span className="truncate">{currentBranch.name}</span>
                <ChevronDown size={12} className={cn('shrink-0 opacity-60 transition-transform', open && 'rotate-180')} />
            </button>

            {open ? (
                <div className="absolute right-0 top-full z-[180] mt-2 w-72 overflow-hidden rounded-[10px] border border-sparkle-border bg-sparkle-card p-1 text-[12px] text-sparkle-text shadow-[0_18px_48px_rgba(0,0,0,0.38)]">
                    <div className="px-2.5 py-1.5 text-[12px] text-sparkle-text-muted">
                        Branch
                    </div>
                    <div className="max-h-64 space-y-0.5 overflow-y-auto [scrollbar-width:thin] [scrollbar-color:#3b3c40_transparent]">
                        {visibleBranches.map((branch) => {
                            const isCurrent = branch.current
                            const isDefault = branch.name === defaultBranchName
                            return (
                                <button
                                    key={`${branch.name}-${branch.commit}`}
                                    type="button"
                                    onClick={() => void switchBranch(branch.name)}
                                    disabled={Boolean(switchingBranch) || isCurrent}
                                    className={cn(
                                        'flex h-8 w-full min-w-0 items-center gap-2 rounded-md px-2.5 text-left transition-colors',
                                        isCurrent
                                            ? 'bg-sparkle-card-hover text-sparkle-text'
                                            : 'text-sparkle-text-secondary hover:bg-sparkle-card-hover hover:text-sparkle-text',
                                        (switchingBranch || isCurrent) && 'cursor-default'
                                    )}
                                >
                                    <span className="min-w-0 flex-1 truncate">{branch.name}</span>
                                    {isDefault ? <span className="rounded-md bg-sky-400/12 px-1.5 py-0.5 text-[10px] font-medium text-sky-200">Main</span> : null}
                                    {isCurrent ? <Check size={15} className="text-sparkle-text-secondary" /> : null}
                                </button>
                            )
                        })}
                    </div>
                    {error ? <div className="px-2.5 py-1.5 text-[11px] font-medium text-rose-300">{error}</div> : null}
                </div>
            ) : null}
        </div>
    )
}
