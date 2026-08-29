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
        className: 'border-[color-mix(in_srgb,var(--status-warning)_26%,transparent)] bg-[color-mix(in_srgb,var(--status-warning)_10%,transparent)] text-[color-mix(in_srgb,var(--status-warning)_70%,var(--color-text))]'
    },
    untracked: {
        code: 'U',
        label: 'New / untracked',
        className: 'border-[color-mix(in_srgb,var(--status-success)_26%,transparent)] bg-[color-mix(in_srgb,var(--status-success)_10%,transparent)] text-[color-mix(in_srgb,var(--status-success)_70%,var(--color-text))]'
    },
    deleted: {
        code: 'D',
        label: 'Deleted',
        className: 'border-[color-mix(in_srgb,var(--status-danger)_26%,transparent)] bg-[color-mix(in_srgb,var(--status-danger)_10%,transparent)] text-[color-mix(in_srgb,var(--status-danger)_70%,var(--color-text))]'
    },
    renamed: {
        code: 'R',
        label: 'Renamed',
        className: 'border-[color-mix(in_srgb,var(--accent-primary)_26%,transparent)] bg-[color-mix(in_srgb,var(--accent-primary)_10%,transparent)] text-[color-mix(in_srgb,var(--accent-primary)_70%,var(--color-text))]'
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
