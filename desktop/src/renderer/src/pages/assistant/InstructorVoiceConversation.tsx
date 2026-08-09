import { ArrowDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { cn } from '@/lib/utils'
import {
    shouldSnapRendererPresentation,
    useRendererVisibilitySnapshot
} from '@/lib/renderer-visibility'
import type { InstructorTranscriptEntry } from './instructor-voice-transcript'
import './InstructorVoiceConversation.css'

const BOTTOM_THRESHOLD_PX = 8
const SCROLL_SETTLE_MS = 520

function setInstantScrollTop(element: HTMLElement, top: number): void {
    const previousBehavior = element.style.scrollBehavior
    element.style.scrollBehavior = 'auto'
    element.scrollTop = top
    void element.offsetHeight
    element.style.scrollBehavior = previousBehavior
}

export function InstructorVoiceConversation({
    open,
    transcript,
    accentColor
}: {
    open: boolean
    transcript: InstructorTranscriptEntry[]
    accentColor: string
}) {
    const visibilitySnapshot = useRendererVisibilitySnapshot()
    const scrollerRef = useRef<HTMLDivElement | null>(null)
    const followLatestRef = useRef(true)
    const autoScrollingRef = useRef(false)
    const settleTimerRef = useRef<number | null>(null)
    const handledResumeRevisionRef = useRef(visibilitySnapshot.resumeRevision)
    const [followingLatest, setFollowingLatest] = useState(true)

    const clearSettleTimer = useCallback(() => {
        if (settleTimerRef.current === null) return
        window.clearTimeout(settleTimerRef.current)
        settleTimerRef.current = null
    }, [])

    const readAtBottom = useCallback(() => {
        const scroller = scrollerRef.current
        if (!scroller) return true
        return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop <= BOTTOM_THRESHOLD_PX
    }, [])

    const syncFollowState = useCallback(() => {
        const atBottom = readAtBottom()
        followLatestRef.current = atBottom
        setFollowingLatest(atBottom)
    }, [readAtBottom])

    const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
        const scroller = scrollerRef.current
        if (!scroller) return
        clearSettleTimer()
        followLatestRef.current = true
        setFollowingLatest(true)
        autoScrollingRef.current = behavior === 'smooth'
        if (behavior === 'smooth') scroller.scrollTo({ top: scroller.scrollHeight, behavior })
        else setInstantScrollTop(scroller, scroller.scrollHeight)
        if (behavior === 'smooth') {
            settleTimerRef.current = window.setTimeout(() => {
                autoScrollingRef.current = false
                syncFollowState()
            }, SCROLL_SETTLE_MS)
        }
    }, [clearSettleTimer, syncFollowState])

    const releaseFollowLock = useCallback(() => {
        clearSettleTimer()
        autoScrollingRef.current = false
        const scroller = scrollerRef.current
        if (scroller) setInstantScrollTop(scroller, scroller.scrollTop)
    }, [clearSettleTimer])

    const handleScroll = useCallback(() => {
        if (autoScrollingRef.current) return
        syncFollowState()
    }, [syncFollowState])

    useEffect(() => clearSettleTimer, [clearSettleTimer])

    useLayoutEffect(() => {
        const shouldSnap = shouldSnapRendererPresentation(
            visibilitySnapshot,
            handledResumeRevisionRef.current
        )
        handledResumeRevisionRef.current = visibilitySnapshot.resumeRevision
        if (!open || !followLatestRef.current) return
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        scrollToLatest(reduceMotion || shouldSnap ? 'auto' : 'smooth')
    }, [
        open,
        scrollToLatest,
        transcript,
        visibilitySnapshot.resumeRevision,
        visibilitySnapshot.visible
    ])

    return (
        <section
            className={cn('instructor-voice-conversation', open && 'is-open')}
            aria-hidden={!open}
            style={{ '--voice-conversation-accent': accentColor } as CSSProperties}
        >
            <div
                ref={scrollerRef}
                onScroll={handleScroll}
                onWheel={releaseFollowLock}
                onPointerDown={releaseFollowLock}
                onTouchStart={releaseFollowLock}
                onKeyDown={(event) => {
                    if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) releaseFollowLock()
                }}
                tabIndex={open ? 0 : -1}
                role="log"
                aria-label="Voice conversation"
                aria-live="polite"
                className="instructor-voice-conversation-scroll"
            >
                <div className="instructor-voice-conversation-timeline">
                    {transcript.map((entry) => {
                        const userMessage = entry.role === 'user'
                        return (
                            <article
                                key={entry.id}
                                className={cn(
                                    'instructor-voice-conversation-message',
                                    userMessage ? 'is-user' : 'is-assistant',
                                    !entry.final && 'is-streaming'
                                )}
                            >
                                <span className="sr-only">{userMessage ? 'You' : 'Zyra'}:</span>
                                <div className={cn(
                                    'instructor-voice-conversation-content',
                                    userMessage && 'instructor-voice-conversation-user-bubble'
                                )}>
                                    {entry.images?.length ? (
                                        <div className="instructor-voice-conversation-images">
                                            {entry.images.map((image) => (
                                                <img
                                                    key={image.id}
                                                    src={image.dataUrl}
                                                    alt={image.name}
                                                />
                                            ))}
                                        </div>
                                    ) : null}
                                    {entry.text ? <p>{entry.text}</p> : null}
                                </div>
                            </article>
                        )
                    })}
                </div>
            </div>

            {open && !followingLatest && transcript.length > 0 ? (
                <button
                    type="button"
                    onClick={() => scrollToLatest('smooth')}
                    className="instructor-voice-conversation-latest"
                    aria-label="Return to the latest conversation message"
                >
                    Latest
                    <ArrowDown size={12} />
                </button>
            ) : null}
        </section>
    )
}
