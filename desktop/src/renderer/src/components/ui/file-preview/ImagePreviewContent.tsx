import { useEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react'
import { Focus, Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getFileUrl } from './utils'

const MIN_SCALE = 0.1
const MAX_SCALE = 8
interface ImagePreviewContentProps {
    filePath: string
    fileName: string
    isExpanded?: boolean
}

type ImageDimensions = {
    width: number
    height: number
}

function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale))
}

export default function ImagePreviewContent({
    filePath,
    fileName,
    isExpanded = false
}: ImagePreviewContentProps) {
    const viewportRef = useRef<HTMLDivElement | null>(null)
    const [naturalSize, setNaturalSize] = useState<ImageDimensions>({ width: 0, height: 0 })
    const [viewportSize, setViewportSize] = useState<ImageDimensions>({ width: 0, height: 0 })
    const [customScale, setCustomScale] = useState(1)
    const [fitToViewport, setFitToViewport] = useState(true)

    useEffect(() => {
        const node = viewportRef.current
        if (!node || typeof ResizeObserver === 'undefined') return

        const observer = new ResizeObserver((entries) => {
            const entry = entries[0]
            if (!entry) return
            setViewportSize({
                width: entry.contentRect.width,
                height: entry.contentRect.height
            })
        })

        observer.observe(node)
        return () => observer.disconnect()
    }, [])

    useEffect(() => {
        setNaturalSize({ width: 0, height: 0 })
        setCustomScale(1)
        setFitToViewport(true)
        viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'auto' })
    }, [filePath])

    const fitScale = useMemo(() => {
        if (!naturalSize.width || !naturalSize.height || !viewportSize.width || !viewportSize.height) {
            return 1
        }

        return Math.min(
            viewportSize.width / naturalSize.width,
            viewportSize.height / naturalSize.height
        )
    }, [naturalSize.height, naturalSize.width, viewportSize.height, viewportSize.width])

    const activeScale = fitToViewport ? fitScale : customScale
    const zoomPercent = Math.max(10, Math.round(activeScale * 100))
    const scaledWidth = naturalSize.width > 0 ? naturalSize.width * activeScale : undefined
    const scaledHeight = naturalSize.height > 0 ? naturalSize.height * activeScale : undefined

    const applyScale = (nextScale: number) => {
        setFitToViewport(false)
        setCustomScale(clampScale(nextScale))
    }

    const resetToFit = () => {
        setFitToViewport(true)
        viewportRef.current?.scrollTo({ top: 0, left: 0, behavior: 'smooth' })
    }

    const handleViewportWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
        if (!event.ctrlKey && !event.metaKey) return
        event.preventDefault()
        const nextScale = event.deltaY < 0
            ? activeScale * 1.08
            : activeScale / 1.08
        applyScale(nextScale)
    }

    return (
        <div
            className={cn(
                'relative h-full w-full overflow-hidden',
                isExpanded ? 'bg-black/35' : 'bg-black/20'
            )}
        >
            <div
                ref={viewportRef}
                className={cn('h-full w-full', fitToViewport ? 'overflow-hidden' : 'overflow-auto')}
                onWheel={handleViewportWheel}
            >
                <div className={cn(
                    'flex items-center justify-center',
                    fitToViewport ? 'h-full w-full' : 'min-h-full min-w-full'
                )}>
                    <img
                        src={getFileUrl(filePath)}
                        alt={fileName}
                        onLoad={(event) => {
                            const target = event.currentTarget
                            setNaturalSize({
                                width: target.naturalWidth || 0,
                                height: target.naturalHeight || 0
                            })
                        }}
                        className={cn(
                            'select-none object-contain transition-[width,height] duration-150 ease-out',
                            isExpanded ? 'rounded-none shadow-none' : 'rounded-lg shadow-2xl'
                        )}
                        style={{
                            width: scaledWidth ? `${scaledWidth}px` : undefined,
                            height: scaledHeight ? `${scaledHeight}px` : undefined,
                            maxWidth: 'none',
                            maxHeight: 'none'
                        }}
                        draggable={false}
                    />
                </div>
            </div>

            <div className="pointer-events-none absolute bottom-4 right-4 z-10">
                <div className="pointer-events-auto inline-flex items-center gap-1 rounded-full border border-white/10 bg-black/65 p-1.5 text-white/85 shadow-lg backdrop-blur-md">
                    <button
                        type="button"
                        onClick={() => applyScale(activeScale / 1.15)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/[0.08] hover:text-white"
                        title="Zoom out"
                    >
                        <Minus size={14} />
                    </button>
                    <button
                        type="button"
                        onClick={resetToFit}
                        className={cn(
                            'inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                            fitToViewport ? 'bg-white/[0.08] text-white' : 'hover:bg-white/[0.08] hover:text-white'
                        )}
                        title="Fit image to view"
                    >
                        <Focus size={13} />
                        Fit
                    </button>
                    <button
                        type="button"
                        onClick={() => applyScale(1)}
                        className={cn(
                            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                            !fitToViewport && Math.abs(activeScale - 1) < 0.01
                                ? 'bg-white/[0.08] text-white'
                                : 'hover:bg-white/[0.08] hover:text-white'
                        )}
                        title="Actual size"
                    >
                        1:1
                    </button>
                    <button
                        type="button"
                        onClick={() => applyScale(activeScale * 1.15)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/[0.08] hover:text-white"
                        title="Zoom in"
                    >
                        <Plus size={14} />
                    </button>
                    <div className="min-w-[54px] pr-2 text-right text-[11px] font-semibold tracking-[0.08em] text-white/70">
                        {zoomPercent}%
                    </div>
                </div>
            </div>
        </div>
    )
}
