import { useEffect, useState, useRef } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ScrollPreviewSampleItem = {
    id: number
    title: string
    status: string
    description: string
    timestamp: string
}

function createScrollPreviewSampleContent(): ScrollPreviewSampleItem[] {
    const categories = ['Project', 'Task', 'File', 'Component', 'Module', 'Service']
    const statuses = ['Active', 'Pending', 'Completed', 'In Progress', 'Review', 'Draft']

    return Array.from({ length: 30 }, (_, index) => {
        const category = categories[index % categories.length]
        const status = statuses[index % statuses.length]

        return {
            id: index + 1,
            title: `${category} #${index + 1}`,
            status,
            description: `${status} ${category.toLowerCase()} with various properties and metadata. Scroll through this list to compare how each scroll mode behaves.`,
            timestamp: `${Math.floor(Math.random() * 24)}h ago`
        }
    })
}

const SCROLL_PREVIEW_SAMPLE_CONTENT = createScrollPreviewSampleContent()

export function ScrollPreviewModal({
    currentMode,
    onClose,
    onApply
}: {
    currentMode: 'smooth' | 'native'
    onClose: () => void
    onApply: (mode: 'smooth' | 'native') => void
}) {
    const [previewMode, setPreviewMode] = useState<'smooth' | 'native'>(currentMode)
    const smoothScrollRef = useRef<HTMLDivElement>(null)
    const nativeScrollRef = useRef<HTMLDivElement>(null)

    useEffect(() => {
        const container = smoothScrollRef.current
        if (!container) return

        let targetScrollTop = container.scrollTop
        let currentScrollTop = container.scrollTop
        let animationFrameId: number

        const smoothScroll = () => {
            const diff = targetScrollTop - currentScrollTop
            if (Math.abs(diff) > 0.5) {
                currentScrollTop += diff * 0.1
                container.scrollTop = currentScrollTop
                animationFrameId = requestAnimationFrame(smoothScroll)
            }
        }

        const handleWheel = (event: WheelEvent) => {
            event.preventDefault()
            targetScrollTop = Math.max(
                0,
                Math.min(container.scrollHeight - container.clientHeight, targetScrollTop + event.deltaY)
            )
            cancelAnimationFrame(animationFrameId)
            animationFrameId = requestAnimationFrame(smoothScroll)
        }

        container.addEventListener('wheel', handleWheel, { passive: false })
        return () => {
            container.removeEventListener('wheel', handleWheel)
            cancelAnimationFrame(animationFrameId)
        }
    }, [])

    return (
        <div className="fixed inset-0 z-50 flex animate-fadeIn items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="relative mx-4 flex max-h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-white/10 bg-sparkle-bg shadow-2xl">
                <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
                    <div>
                        <h2 className="text-lg font-semibold text-sparkle-text">Scroll Behavior Preview</h2>
                        <p className="text-sm text-sparkle-text-secondary">Try scrolling in each panel to compare</p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg p-2 text-sparkle-text-secondary transition-colors hover:bg-white/[0.03] hover:text-sparkle-text"
                    >
                        <X size={20} />
                    </button>
                </div>

                <div className="p-6">
                    <div className="mb-6 flex flex-col items-center gap-3">
                        <span className="text-sm text-sparkle-text-secondary">Select mode to preview:</span>
                        <div className="inline-flex items-center rounded-lg border border-white/10 bg-sparkle-card p-1">
                            {(['smooth', 'native'] as const).map((mode) => (
                                <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setPreviewMode(mode)}
                                    className={cn(
                                        'rounded-md px-6 py-2 text-sm font-medium transition-colors',
                                        previewMode === mode
                                            ? 'bg-[var(--accent-primary)] text-white'
                                            : 'text-sparkle-text-secondary hover:bg-white/[0.03] hover:text-sparkle-text'
                                    )}
                                >
                                    {mode === 'smooth' ? 'Buttery' : 'Native'}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        {([
                            { key: 'smooth', title: 'Buttery Smooth', accent: 'purple', ref: smoothScrollRef, description: 'Eased, interpolated scrolling' },
                            { key: 'native', title: 'Native Platform', accent: 'blue', ref: nativeScrollRef, description: 'Direct, instant scrolling' }
                        ] as const).map((panel) => {
                            const active = previewMode === panel.key
                            const accentBorder = panel.accent === 'purple'
                                ? 'border-purple-500/50 shadow-lg shadow-purple-500/20 ring-2 ring-purple-500/30'
                                : 'border-blue-500/50 shadow-lg shadow-blue-500/20 ring-2 ring-blue-500/30'
                            const accentBg = panel.accent === 'purple'
                                ? 'border-purple-500/30 bg-gradient-to-br from-purple-500/20 to-purple-600/10'
                                : 'border-blue-500/30 bg-gradient-to-br from-blue-500/20 to-blue-600/10'
                            const accentDot = panel.accent === 'purple'
                                ? 'animate-pulse bg-purple-400 shadow-lg shadow-purple-400/50'
                                : 'animate-pulse bg-blue-400 shadow-lg shadow-blue-400/50'
                            const accentText = panel.accent === 'purple' ? 'text-purple-300' : 'text-blue-300'
                            const accentBody = panel.accent === 'purple' ? 'bg-purple-500/5' : 'bg-blue-500/5'
                            const accentCard = panel.accent === 'purple'
                                ? 'border-purple-500/20 bg-purple-500/5 hover:border-purple-500/30 hover:bg-purple-500/10'
                                : 'border-blue-500/20 bg-blue-500/5 hover:border-blue-500/30 hover:bg-blue-500/10'

                            return (
                                <div
                                    key={panel.key}
                                    className={cn(
                                        'overflow-hidden rounded-xl border transition-all duration-300',
                                        active ? accentBorder : 'border-white/10'
                                    )}
                                >
                                    <div className={cn('border-b p-3 transition-colors', active ? accentBg : 'border-white/10 bg-white/[0.03]')}>
                                        <div className="flex items-center gap-2">
                                            <div className={cn('h-2.5 w-2.5 rounded-full transition-all duration-300', active ? accentDot : 'bg-white/20')} />
                                            <h3 className={cn('text-sm font-semibold transition-colors', active ? accentText : 'text-sparkle-text')}>{panel.title}</h3>
                                        </div>
                                        <p className="mt-1 text-xs text-sparkle-text-secondary">{panel.description}</p>
                                    </div>
                                    <div
                                        ref={panel.ref}
                                        className={cn('h-[400px] space-y-3 overflow-y-auto p-4 transition-colors', active ? accentBody : 'bg-sparkle-card')}
                                        style={panel.key === 'smooth' ? { scrollBehavior: 'auto' } : undefined}
                                    >
                                        {SCROLL_PREVIEW_SAMPLE_CONTENT.map((item) => (
                                            <div
                                                key={`${panel.key}-${item.id}`}
                                                className={cn(
                                                    'rounded-lg border p-4 transition-all',
                                                    active ? accentCard : 'border-white/10 bg-white/[0.03] hover:bg-white/[0.05]'
                                                )}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0 flex-1">
                                                        <h4 className="text-sm font-semibold text-sparkle-text">{item.title}</h4>
                                                        <p className="mt-1.5 text-xs leading-relaxed text-sparkle-text-secondary">{item.description}</p>
                                                    </div>
                                                    <div className="flex shrink-0 flex-col items-end gap-1">
                                                        <span className={cn(
                                                            'rounded-full px-2 py-0.5 text-xs',
                                                            item.status === 'Active' && 'bg-green-500/20 text-green-400',
                                                            item.status === 'Pending' && 'bg-yellow-500/20 text-yellow-400',
                                                            item.status === 'Completed' && 'bg-blue-500/20 text-blue-400',
                                                            item.status === 'In Progress' && 'bg-purple-500/20 text-purple-400',
                                                            item.status === 'Review' && 'bg-orange-500/20 text-orange-400',
                                                            item.status === 'Draft' && 'bg-gray-500/20 text-gray-400'
                                                        )}>{item.status}</span>
                                                        <span className="text-xs text-sparkle-text-secondary">{item.timestamp}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </div>

                <div className="flex items-center justify-end gap-3 border-t border-white/10 p-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="rounded-lg border border-white/10 bg-sparkle-card px-4 py-2 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={() => onApply(previewMode)}
                        className="rounded-lg bg-[var(--accent-primary)] px-4 py-2 text-sm text-white transition-all hover:opacity-90"
                    >
                        Apply {previewMode === 'smooth' ? 'Buttery' : 'Native'} Mode
                    </button>
                </div>
            </div>
        </div>
    )
}
