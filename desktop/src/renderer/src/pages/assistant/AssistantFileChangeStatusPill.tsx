import type { FileChangeKind } from '@shared/assistant/contracts'
import { cn } from '@/lib/utils'

export type AssistantFileChangeStatus = 'modified' | 'untracked' | 'deleted' | 'renamed'

const STATUS_PRESENTATION: Record<AssistantFileChangeStatus, {
    code: 'M' | 'U' | 'D' | 'R'
    label: string
    className: string
}> = {
    modified: {
        code: 'M',
        label: 'Modified',
        className: 'border-amber-400/25 bg-amber-500/[0.10] text-amber-200'
    },
    untracked: {
        code: 'U',
        label: 'New / untracked',
        className: 'border-emerald-400/25 bg-emerald-500/[0.10] text-emerald-200'
    },
    deleted: {
        code: 'D',
        label: 'Deleted',
        className: 'border-red-400/25 bg-red-500/[0.10] text-red-200'
    },
    renamed: {
        code: 'R',
        label: 'Renamed',
        className: 'border-violet-400/25 bg-violet-500/[0.10] text-violet-200'
    }
}

export function resolveAssistantFileChangeStatus(input: {
    kind?: FileChangeKind
    isNew?: boolean
    previousPath?: string
}): AssistantFileChangeStatus {
    if (input.previousPath || input.kind === 'move') return 'renamed'
    if (input.kind === 'delete') return 'deleted'
    if (input.isNew || input.kind === 'add') return 'untracked'
    return 'modified'
}

export function AssistantFileChangeStatusPill({
    status,
    className
}: {
    status: AssistantFileChangeStatus
    className?: string
}) {
    const presentation = STATUS_PRESENTATION[status]

    return (
        <span
            className={cn(
                'inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-md border px-1 font-mono text-[10px] font-bold leading-none',
                presentation.className,
                className
            )}
            title={presentation.label}
            aria-label={presentation.label}
        >
            {presentation.code}
        </span>
    )
}
