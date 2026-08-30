import { memo } from 'react'
import { cn } from '@/lib/utils'

export const AssistantSessionTitleText = memo(function AssistantSessionTitleText({
    title,
    generating = false,
    reveal = true,
    className
}: {
    title: string
    generating?: boolean
    reveal?: boolean
    className?: string
}) {
    return (
        <span className={cn('block min-w-0 truncate', className)} aria-busy={generating || undefined} aria-label={generating ? `${title}, refreshing title` : title}>
            <span key={`${title}:${generating ? 'generating' : 'ready'}`} className={cn('block truncate', generating ? 'assistant-title-shimmer' : reveal && 'assistant-title-reveal')}>
                {title}
            </span>
        </span>
    )
})
