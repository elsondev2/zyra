/**
 * Loading state with timer and skeleton
 */

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'
import { ZyraLogoASCII } from './ZyraLogo'

interface LoadingStateProps {
    message?: string
    detail?: string
    className?: string
    minHeightClassName?: string
    affectsAppChrome?: boolean
}

let activeLoadingContentCount = 0
const loadingScreenListeners = new Set<() => void>()

function getLoadingScreenActive() {
    return activeLoadingContentCount > 0
}

function subscribeLoadingScreenState(listener: () => void) {
    loadingScreenListeners.add(listener)
    return () => loadingScreenListeners.delete(listener)
}

export function useLoadingScreenActive() {
    return useSyncExternalStore(subscribeLoadingScreenState, getLoadingScreenActive, () => false)
}

function emitLoadingScreenState(active: boolean) {
    const wasActive = getLoadingScreenActive()
    if (active) {
        activeLoadingContentCount += 1
    } else {
        activeLoadingContentCount = Math.max(0, activeLoadingContentCount - 1)
    }

    const isActive = getLoadingScreenActive()
    if (wasActive === isActive) return
    for (const listener of loadingScreenListeners) listener()
}

function useElapsedTime() {
    const [elapsed, setElapsed] = useState(0)

    useEffect(() => {
        const start = Date.now()
        const interval = window.setInterval(() => {
            setElapsed(Date.now() - start)
        }, 100)
        return () => window.clearInterval(interval)
    }, [])

    return elapsed
}

function formatTime(ms: number) {
    const seconds = Math.floor(ms / 1000)
    const tenths = Math.floor((ms % 1000) / 100)
    return `${seconds}.${tenths}s`
}

function LoadingContent({ label, affectsAppChrome = false }: { label: string; affectsAppChrome?: boolean }) {
    const elapsed = useElapsedTime()

    useLayoutEffect(() => {
        if (!affectsAppChrome) return
        emitLoadingScreenState(true)
        return () => emitLoadingScreenState(false)
    }, [affectsAppChrome])

    return (
        <div className="flex -translate-y-[5vh] flex-col items-center justify-center text-center" role="status" aria-label={label}>
            <ZyraLogoASCII shimmer size="lg" tone="neutral" variant="loading" className="opacity-100" />
            <div className="mt-5 rounded-full border border-[color-mix(in_srgb,var(--color-text)_7%,transparent)] bg-[color-mix(in_srgb,var(--color-text)_4%,transparent)] px-2.5 py-1 font-mono text-[11px] leading-none tabular-nums text-sparkle-text-muted/80">
                {formatTime(elapsed)}
            </div>
        </div>
    )
}

export function LoadingSpinner({
    message = 'Loading...',
    detail,
    className,
    minHeightClassName = 'min-h-[calc(100vh-34px)]',
    affectsAppChrome = false
}: LoadingStateProps) {
    return (
        <div className={cn('flex items-center justify-center px-4 py-0', minHeightClassName, className)}>
            <LoadingContent label={detail || message} affectsAppChrome={affectsAppChrome} />
        </div>
    )
}

export function LoadingOverlay({
    message = 'Loading...',
    detail,
    className,
    affectsAppChrome = false
}: LoadingStateProps) {
    return (
        <div className={cn('pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-4', className)}>
            <LoadingContent label={detail || message} affectsAppChrome={affectsAppChrome} />
        </div>
    )
}

export function CardSkeleton() {
    return (
        <div className="bg-sparkle-card/50 rounded-2xl p-8 border border-white/5 animate-pulse">
            <div className="flex items-center gap-4 mb-5">
                <div className="w-14 h-14 rounded-xl bg-white/5" />
                <div className="flex-1">
                    <div className="h-5 bg-white/5 rounded w-1/3 mb-3" />
                    <div className="h-4 bg-white/5 rounded w-1/2" />
                </div>
            </div>
            <div className="space-y-3">
                <div className="h-4 bg-white/5 rounded w-full" />
                <div className="h-4 bg-white/5 rounded w-2/3" />
            </div>
        </div>
    )
}

export function AnalyticsCardSkeleton() {
    return (
        <div className="bg-sparkle-card/80 backdrop-blur-sm rounded-3xl p-8 border border-white/5 animate-pulse min-h-[280px]">
            <div className="h-4 bg-white/5 rounded w-1/4 mb-8" />
            <div className="flex items-center gap-8">
                <div className="w-52 h-52 rounded-full bg-white/5" />
                <div className="flex-1 space-y-4">
                    <div className="h-4 bg-white/5 rounded w-full" />
                    <div className="h-4 bg-white/5 rounded w-3/4" />
                    <div className="h-4 bg-white/5 rounded w-1/2" />
                    <div className="h-4 bg-white/5 rounded w-2/3" />
                </div>
            </div>
        </div>
    )
}

export function ToolGridSkeleton({ count = 8 }: { count?: number }) {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {Array.from({ length: count }).map((_, i) => (
                <div key={i} className="bg-sparkle-card rounded-2xl p-7 border border-white/5 animate-pulse min-h-[160px]">
                    <div className="flex items-start justify-between mb-5">
                        <div className="w-14 h-14 rounded-xl bg-white/5" />
                        <div className="w-20 h-6 rounded-full bg-white/5" />
                    </div>
                    <div className="h-5 bg-white/5 rounded w-2/3 mb-3" />
                    <div className="h-4 bg-white/5 rounded w-1/3" />
                </div>
            ))}
        </div>
    )
}

export function SystemStatsSkeleton() {
    return (
        <div className="space-y-8">
            {/* Top stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="bg-sparkle-card/50 rounded-2xl p-6 border border-white/5 animate-pulse min-h-[130px]">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-white/5" />
                            <div className="h-3 bg-white/5 rounded w-20" />
                        </div>
                        <div className="h-10 bg-white/5 rounded w-1/2 mb-2" />
                        <div className="h-3 bg-white/5 rounded w-2/3" />
                    </div>
                ))}
            </div>

            {/* Main cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {Array.from({ length: 2 }).map((_, i) => (
                    <div key={i} className="bg-sparkle-card/50 rounded-2xl p-8 border border-white/5 animate-pulse min-h-[320px]">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="w-14 h-14 rounded-xl bg-white/5" />
                            <div>
                                <div className="h-5 bg-white/5 rounded w-28 mb-3" />
                                <div className="h-4 bg-white/5 rounded w-40" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-5">
                            {Array.from({ length: 4 }).map((_, j) => (
                                <div key={j} className="bg-white/5 rounded-xl p-5">
                                    <div className="h-3 bg-white/10 rounded w-1/2 mb-3" />
                                    <div className="h-6 bg-white/10 rounded w-3/4" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
