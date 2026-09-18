import { Fragment, useMemo, type ReactNode } from 'react'
import { parseVisualizationBlocks } from '@shared/visualization'
import { VisualizationPreview } from './VisualizationPreview'

export function VisualizationMessage({ content, streaming, renderMarkdown, timestamp, renderFooter }: {
    content: string
    streaming: boolean
    renderMarkdown: (content: string, key: string) => ReactNode
    timestamp?: ReactNode
    renderFooter?: (showTimestamp: boolean) => ReactNode
}) {
    const parts = useMemo(() => parseVisualizationBlocks(content), [content])
    if (parts.every(part => part.kind === 'text')) return <>{renderMarkdown(content, '')}{renderFooter?.(true)}</>
    const lastPart = [...parts].reverse().find(part => part.kind !== 'text' || part.text.trim())
    let previews = 0
    let timestampAtEnd = false
    return <>{parts.map(part => {
        if (part.kind === 'text') return <Fragment key={`text:${part.start}`}>
            {renderMarkdown(part.text, `text:${part.start}`)}
            {previews > 0 && part.text.trim() && part !== lastPart && timestamp ? <div className="mt-2 text-[11px] text-sparkle-text-muted">{timestamp}</div> : null}
        </Fragment>
        if (++previews > 8) return <p key={`limit:${part.start}`} className="text-[12px] text-sparkle-text-muted">Additional visualization omitted. Split large galleries into separate messages.</p>
        if (part === lastPart && part.state === 'complete' && timestamp) timestampAtEnd = true
        return <VisualizationPreview key={`visualization:${part.start}`} block={part} streaming={streaming} timestamp={timestamp} />
    })}{renderFooter?.(!timestampAtEnd)}</>
}
