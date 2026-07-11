import { memo, useEffect, useRef, useState } from 'react'
import mermaid from 'mermaid'

mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
        darkMode: true,
        primaryColor: '#6366f1',
        primaryTextColor: '#e2e8f0',
        primaryBorderColor: '#4f46e5',
        lineColor: '#64748b',
        secondaryColor: '#8b5cf6',
        tertiaryColor: '#ec4899',
        background: '#1e293b',
        mainBkg: '#1e293b',
        secondBkg: '#334155',
        textColor: '#e2e8f0',
        noteTextColor: '#333333',
        fontSize: '14px'
    }
})

const mermaidSvgCache = new Map<string, string>()
const mermaidRenderPromiseCache = new Map<string, Promise<string>>()

function hashString(input: string): string {
    let hash = 0
    for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) - hash) + input.charCodeAt(i)
        hash |= 0
    }
    return Math.abs(hash).toString(36)
}

export const MermaidDiagram = memo(function MermaidDiagram({ chart }: { chart: string }) {
    const containerRef = useRef<HTMLDivElement | null>(null)
    const [svg, setSvg] = useState<string>(() => mermaidSvgCache.get(chart) || '')
    const [error, setError] = useState('')

    useEffect(() => {
        const cachedSvg = mermaidSvgCache.get(chart)
        setSvg((previous) => (previous === (cachedSvg || '') ? previous : (cachedSvg || '')))
        setError((previous) => (previous ? '' : previous))

        if (cachedSvg) {
            return
        }

        let cancelled = false

        const renderDiagram = (): Promise<string> => {
            const existingPromise = mermaidRenderPromiseCache.get(chart)
            if (existingPromise) return existingPromise

            const renderPromise = mermaid.render(`mermaid-${hashString(chart)}`, chart)
                .then(({ svg: renderedSvg }) => {
                    mermaidSvgCache.set(chart, renderedSvg)
                    mermaidRenderPromiseCache.delete(chart)
                    return renderedSvg
                })
                .catch((renderError) => {
                    mermaidRenderPromiseCache.delete(chart)
                    throw renderError
                })

            mermaidRenderPromiseCache.set(chart, renderPromise)
            return renderPromise
        }

        void renderDiagram()
            .then((renderedSvg) => {
                if (cancelled) return
                setSvg((previous) => (previous === renderedSvg ? previous : renderedSvg))
            })
            .catch((renderError: any) => {
                if (cancelled) return
                console.error('Mermaid render error:', renderError)
                setError(renderError.message || 'Failed to render diagram')
            })

        return () => {
            cancelled = true
        }
    }, [chart])

    if (error) {
        return (
            <div ref={containerRef} className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                <strong>Mermaid Error:</strong> {error}
            </div>
        )
    }

    if (!svg) {
        return (
            <div
                ref={containerRef}
                className="flex min-h-[220px] items-center justify-center rounded-lg border border-white/10 bg-sparkle-card p-4 text-sm text-sparkle-text-secondary"
            >
                Rendering diagram...
            </div>
        )
    }

    return (
        <div
            ref={containerRef}
            className="mermaid-diagram flex items-center justify-center overflow-x-auto rounded-lg border border-white/10 bg-sparkle-card p-4"
            dangerouslySetInnerHTML={{ __html: svg }}
        />
    )
}, (previous, next) => previous.chart === next.chart)
