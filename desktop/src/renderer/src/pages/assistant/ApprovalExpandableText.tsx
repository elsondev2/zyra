import { useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { cn } from '@/lib/utils'

export function ApprovalExpandableText({ text, command = false }: { text: string; command?: boolean }) {
    const [expanded, setExpanded] = useState(false)
    const [metrics, setMetrics] = useState({ overflow: false, collapsedHeight: 40 })
    const animate = useRef(false)
    const content = useRef<HTMLPreElement>(null)
    const contentId = useId()
    useLayoutEffect(() => {
        const element = content.current
        if (!element) return
        const measure = () => {
            const lineHeight = Number.parseFloat(element.ownerDocument.defaultView?.getComputedStyle(element).lineHeight || '') || 20
            const collapsedHeight = Math.ceil(lineHeight * 2)
            const overflow = element.scrollHeight > collapsedHeight + 1
            setMetrics(current => current.overflow === overflow && current.collapsedHeight === collapsedHeight ? current : { overflow, collapsedHeight })
        }
        measure()
        const observer = new ResizeObserver(measure)
        observer.observe(element)
        return () => observer.disconnect()
    }, [text])
    const open = expanded || !metrics.overflow
    const textClass = cn('m-0 whitespace-pre-wrap break-words text-[12px] leading-5 text-sparkle-text-secondary', command && 'font-mono')
    return <div>
        <div className="relative" style={{ minHeight: metrics.overflow ? metrics.collapsedHeight : undefined }}>
            {metrics.overflow ? <pre aria-hidden={expanded} className={cn(textClass, 'pointer-events-none absolute inset-x-0 top-0 line-clamp-2 transition-opacity duration-200 motion-reduce:transition-none', expanded ? 'opacity-0' : 'opacity-100')}>{text}</pre> : null}
            <AnimatedHeight isOpen={open} duration={animate.current ? 200 : 0}>
                <pre id={contentId} ref={content} className={textClass}>{command ? <code>{text}</code> : text}</pre>
            </AnimatedHeight>
        </div>
        {metrics.overflow ? <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => { animate.current = true; setExpanded(value => !value) }}
            className="mt-1 inline-flex items-center gap-1 py-1 text-[11px] text-sparkle-text-muted transition-colors hover:text-sparkle-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]">
            <ChevronDown size={12} className={cn('transition-transform duration-200 motion-reduce:transition-none', expanded && 'rotate-180')} aria-hidden="true" />
            {expanded ? 'Hide details' : 'Show details'}
        </button> : null}
    </div>
}
