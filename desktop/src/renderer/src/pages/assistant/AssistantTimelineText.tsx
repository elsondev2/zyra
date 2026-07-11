import { memo, useEffect, useMemo, useState } from 'react'
import { useObservedElementWidth } from '@/lib/text-layout/useObservedElementWidth'
import {
    getUserMessageBodyWidth,
    measureTimelinePlainTextHeight,
    TIMELINE_TEXT_LINE_HEIGHT,
    USER_MESSAGE_COLLAPSED_LINE_COUNT
} from './assistant-timeline-text-metrics'

type StreamingAssistantTextProps = {
    content: string
    className?: string
}

type CollapsibleUserMessageBodyProps = {
    content: string
}

export const StreamingAssistantText = memo(function StreamingAssistantText({
    content,
    className
}: StreamingAssistantTextProps) {
    return (
        <div className={className || 'whitespace-pre-wrap break-words text-[13px] leading-6 text-sparkle-text [overflow-wrap:anywhere]'}>
            {content || ' '}
        </div>
    )
})

export const CollapsibleUserMessageBody = memo(function CollapsibleUserMessageBody({
    content
}: CollapsibleUserMessageBodyProps) {
    const { elementRef, width } = useObservedElementWidth<HTMLDivElement>()
    const [showFullUserBody, setShowFullUserBody] = useState(false)

    useEffect(() => {
        setShowFullUserBody(false)
    }, [content])

    const bodyMetrics = useMemo(
        () => measureTimelinePlainTextHeight(
            content,
            width > 0 ? width : getUserMessageBodyWidth(),
            'pre-wrap'
        ),
        [content, width]
    )

    const shouldCollapseUserBody = bodyMetrics.lineCount > USER_MESSAGE_COLLAPSED_LINE_COUNT
    const collapsedUserBodyMaxHeight = USER_MESSAGE_COLLAPSED_LINE_COUNT * TIMELINE_TEXT_LINE_HEIGHT

    return (
        <div ref={elementRef}>
            <p
                className="whitespace-pre-wrap break-words text-[13px] leading-6 text-sparkle-text [overflow-wrap:anywhere] motion-reduce:transition-none"
                style={shouldCollapseUserBody
                    ? {
                        maxHeight: `${showFullUserBody ? bodyMetrics.height : collapsedUserBodyMaxHeight}px`,
                        overflow: 'hidden',
                        transition: 'max-height 240ms cubic-bezier(0.16, 1, 0.3, 1)'
                    }
                    : undefined}
            >
                {content}
            </p>
            {shouldCollapseUserBody ? (
                <button
                    type="button"
                    onClick={() => setShowFullUserBody((current) => !current)}
                    className="mt-2 text-[12px] text-sparkle-text-muted transition-colors hover:text-sparkle-text"
                >
                    {showFullUserBody ? 'Show less' : 'Show more'}
                </button>
            ) : null}
        </div>
    )
})
