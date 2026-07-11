import { useEffect, useRef, useState } from 'react'
import type { DevScopeGitCloneProgressEvent } from '@shared/contracts/devscope-api'
import { cn } from '@/lib/utils'

type CloneToastState = {
    event: DevScopeGitCloneProgressEvent
    visible: boolean
}

function getToastTone(status: DevScopeGitCloneProgressEvent['status']) {
    if (status === 'error') return 'error'
    if (status === 'success') return 'success'
    return 'info'
}

function getToastTitle(event: DevScopeGitCloneProgressEvent): string {
    if (event.status === 'success') return event.message || 'Cloning done'
    if (event.status === 'error') return 'Clone failed'
    return event.repoName ? `Cloning ${event.repoName}` : 'Cloning repository'
}

export function GitCloneProgressToast() {
    const [toast, setToast] = useState<CloneToastState | null>(null)
    const hideTimerRef = useRef<number | null>(null)
    const removeTimerRef = useRef<number | null>(null)

    useEffect(() => {
        return () => {
            if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
            if (removeTimerRef.current !== null) window.clearTimeout(removeTimerRef.current)
        }
    }, [])

    useEffect(() => {
        if (!window.devscope.onGitCloneProgress) return undefined

        return window.devscope.onGitCloneProgress((event) => {
            if (hideTimerRef.current !== null) {
                window.clearTimeout(hideTimerRef.current)
                hideTimerRef.current = null
            }
            if (removeTimerRef.current !== null) {
                window.clearTimeout(removeTimerRef.current)
                removeTimerRef.current = null
            }

            setToast({ event, visible: true })

            if (event.status === 'running') return

            hideTimerRef.current = window.setTimeout(() => {
                setToast((current) => current?.event.cloneId === event.cloneId ? { ...current, visible: false } : current)
            }, 3200)
            removeTimerRef.current = window.setTimeout(() => {
                setToast((current) => current?.event.cloneId === event.cloneId ? null : current)
            }, 3650)
        })
    }, [])

    if (!toast) return null

    const { event, visible } = toast
    const tone = getToastTone(event.status)
    const detail = event.status === 'error'
        ? event.error || event.message
        : event.status === 'success'
            ? event.clonePath
            : event.message
    const progress = typeof event.percent === 'number'
        ? Math.max(0, Math.min(100, event.percent))
        : undefined

    return (
        <div
            className={cn(
                'fixed bottom-4 right-4 z-[180] w-[min(24rem,calc(100vw-2rem))] rounded-xl px-4 py-3 text-sm shadow-2xl shadow-black/35 backdrop-blur-md transition-all duration-300',
                tone === 'error'
                    ? 'border border-red-500/30 bg-red-500/10 text-red-200'
                    : tone === 'info'
                        ? 'border border-sky-500/25 bg-sky-500/10 text-sky-100'
                        : 'border border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
                visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0'
            )}
            role="status"
            aria-live="polite"
        >
            <div className="font-medium">{getToastTitle(event)}</div>
            {detail && (
                <div className="mt-1 line-clamp-2 break-words text-xs opacity-75">{detail}</div>
            )}
            {typeof progress === 'number' && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                    <div
                        className={cn(
                            'h-full rounded-full transition-[width] duration-300',
                            tone === 'error' ? 'bg-red-300' : tone === 'info' ? 'bg-sky-300' : 'bg-emerald-300'
                        )}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            )}
        </div>
    )
}
