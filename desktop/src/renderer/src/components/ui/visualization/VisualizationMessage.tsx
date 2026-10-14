import { Fragment, lazy, Suspense, useMemo, type ReactNode } from 'react'
import { parseVisualizationBlocks, type VisualizationBlock } from '@shared/visualization'
import { VisualizationPreview } from './VisualizationPreview'
import { parseVisualizationReferences } from '@shared/visualization-resources'
import { ArtifactCreationState } from '../ArtifactCreationState'
const VisualizationReferencePreview = lazy(() => import('./VisualizationReferencePreview').then(module => ({ default: module.VisualizationReferencePreview })))

export function VisualizationMessage({ content, streaming, renderMarkdown, timestamp, renderFooter }: {
    content: string
    streaming: boolean
    renderMarkdown: (content: string, key: string) => ReactNode
    timestamp?: ReactNode
    renderFooter?: (showTimestamp: boolean) => ReactNode
}) {
    const parts = useMemo(() => parseVisualizationBlocks(content).flatMap<VisualizationBlock | ReturnType<typeof parseVisualizationReferences>[number]>(part => {
        if (part.kind !== 'text') return [part]
        return parseVisualizationReferences(part.text).map(reference => ({ ...reference, start: part.start + reference.start }))
    }), [content])
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
        if (part.kind === 'reference') return <Suspense key={`reference:${part.start}`} fallback={<ArtifactCreationState kind="visualization" phase={streaming ? 'creating' : 'loading'}/>}><VisualizationReferencePreview id={part.id} version={part.version} complete={part.state === 'complete'} streaming={streaming}/></Suspense>
        if (part === lastPart && part.state === 'complete' && timestamp) timestampAtEnd = true
        return <VisualizationPreview key={`visualization:${part.start}`} block={part} streaming={streaming} timestamp={timestamp} />
    })}{renderFooter?.(!timestampAtEnd)}</>
}
