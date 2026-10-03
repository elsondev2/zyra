import { Box } from 'lucide-react'
import type { TimelineDisplayRow } from './assistant-timeline-helpers'
import { formatAssistantConversationTime } from './assistant-conversation-markers'
import { formatAssistantModelLabel } from './assistant-model-labels'

export function AssistantConversationMarker({ row }: {
    row: Extract<TimelineDisplayRow, { kind: 'model-change' | 'conversation-time' }>
}) {
    if (row.kind === 'conversation-time') return (
        <div className="py-1 text-center text-xs font-medium text-sparkle-text-muted" data-assistant-conversation-time>
            <time dateTime={row.createdAt}>{formatAssistantConversationTime(row.createdAt)}</time>
        </div>
    )
    return (
        <div className="flex items-center gap-3 py-1 text-xs text-sparkle-text-secondary" data-assistant-model-change>
            <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-[var(--surface-divider)]" />
            <span className="flex min-w-0 items-center justify-center gap-2 text-center">
                <Box size={14} className="shrink-0" aria-hidden="true" />
                <span>Model changed from {formatAssistantModelLabel(row.previousModel)} to {formatAssistantModelLabel(row.model)}</span>
            </span>
            <span aria-hidden="true" className="h-px min-w-4 flex-1 bg-[var(--surface-divider)]" />
        </div>
    )
}
