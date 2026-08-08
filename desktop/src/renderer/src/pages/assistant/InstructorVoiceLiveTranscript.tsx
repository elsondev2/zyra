import { ArrowDown } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import {
    shouldSnapRendererPresentation,
    useRendererVisibilitySnapshot
} from '@/lib/renderer-visibility'
import type { InstructorTranscriptEntry } from './instructor-voice-transcript'
import './InstructorVoiceLiveTranscript.css'

const WORD_STAGGER_MS = 28
const MAX_STAGGERED_WORDS = 14
const REFLOW_ANIMATION_ID = 'instructor-transcript-reflow'
const REFLOW_DURATION_MS = 560
const AUTO_SCROLL_SETTLE_MS = 520
const BOTTOM_LOCK_THRESHOLD_PX = 4

type WordPosition = {
    left: number
    right: number
    top: number
}

function splitInstructorTranscriptWords(text: string): string[] {
    return text.trim().split(/\s+/u).filter(Boolean)
}

function readTransformOffset(element: HTMLElement): { x: number; y: number } {
    const transform = window.getComputedStyle(element).transform
    if (!transform || transform === 'none') return { x: 0, y: 0 }
    try {
        const matrix = new DOMMatrixReadOnly(transform)
        return { x: matrix.m41, y: matrix.m42 }
    } catch {
        return { x: 0, y: 0 }
    }
}

function setInstantScrollTop(element: HTMLElement, top: number): void {
    const previousBehavior = element.style.scrollBehavior
    element.style.scrollBehavior = 'auto'
    element.scrollTop = top
    void element.offsetHeight
    element.style.scrollBehavior = previousBehavior
}

function setViewportEdgeState(viewport: HTMLElement): {
    atBottom: boolean
    overflowing: boolean
} {
    const distanceFromBottom = Math.max(0, viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop)
    const overflowing = viewport.scrollHeight - viewport.clientHeight > 1
    viewport.toggleAttribute('data-overflowing', overflowing)
    viewport.toggleAttribute('data-content-above', viewport.scrollTop > 1)
    viewport.toggleAttribute('data-content-below', distanceFromBottom > 1)
    return {
        atBottom: !overflowing || distanceFromBottom <= BOTTOM_LOCK_THRESHOLD_PX,
        overflowing
    }
}

export function InstructorVoiceLiveTranscript({
    entry,
    error
}: {
    entry: InstructorTranscriptEntry | null
    error: string | null
}) {
    const visibilitySnapshot = useRendererVisibilitySnapshot()
    const transcriptViewportRef = useRef<HTMLDivElement | null>(null)
    const wordContainerRef = useRef<HTMLParagraphElement | null>(null)
    const previousRectsRef = useRef<Map<string, WordPosition>>(new Map())
    const animatedWordKeysRef = useRef<Set<string>>(new Set())
    const previousTurnRef = useRef<string | null>(null)
    const previousWordCountRef = useRef(0)
    const wordDelayRef = useRef<Map<string, number>>(new Map())
    const followLatestRef = useRef(true)
    const autoScrollingRef = useRef(false)
    const autoScrollTimerRef = useRef<number | null>(null)
    const handledResumeRevisionRef = useRef(visibilitySnapshot.resumeRevision)
    const [followingLatest, setFollowingLatest] = useState(true)
    const words = useMemo(
        () => splitInstructorTranscriptWords(entry?.text ?? ''),
        [entry?.text]
    )
    const previousWordCount = previousTurnRef.current === entry?.id
        ? previousWordCountRef.current
        : 0

    const renderedWords = useMemo(() => words.map((word, index) => {
        const key = `${entry?.id ?? 'empty'}:${index}`
        if (!wordDelayRef.current.has(key)) {
            const batchIndex = Math.max(0, index - previousWordCount)
            wordDelayRef.current.set(key, Math.min(batchIndex, MAX_STAGGERED_WORDS) * WORD_STAGGER_MS)
        }
        return {
            key,
            word,
            delay: wordDelayRef.current.get(key) ?? 0
        }
    }), [entry?.id, previousWordCount, words])

    const clearAutoScrollTimer = useCallback(() => {
        if (autoScrollTimerRef.current === null) return
        window.clearTimeout(autoScrollTimerRef.current)
        autoScrollTimerRef.current = null
    }, [])

    const finishAutoScroll = useCallback(() => {
        clearAutoScrollTimer()
        autoScrollingRef.current = false
        const viewport = transcriptViewportRef.current
        if (!viewport) return
        const { atBottom } = setViewportEdgeState(viewport)
        followLatestRef.current = atBottom
        setFollowingLatest(atBottom)
    }, [clearAutoScrollTimer])

    const scrollToLatest = useCallback((behavior: ScrollBehavior = 'smooth') => {
        const viewport = transcriptViewportRef.current
        if (!viewport) return
        followLatestRef.current = true
        setFollowingLatest(true)
        autoScrollingRef.current = behavior === 'smooth'
        clearAutoScrollTimer()
        const targetScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight)
        if (behavior === 'smooth') viewport.scrollTo({ top: targetScrollTop, behavior })
        else setInstantScrollTop(viewport, targetScrollTop)
        setViewportEdgeState(viewport)
        if (behavior === 'smooth') {
            autoScrollTimerRef.current = window.setTimeout(finishAutoScroll, AUTO_SCROLL_SETTLE_MS)
        } else {
            autoScrollingRef.current = false
        }
    }, [clearAutoScrollTimer, finishAutoScroll])

    const releaseFollowLock = useCallback(() => {
        clearAutoScrollTimer()
        autoScrollingRef.current = false
        const viewport = transcriptViewportRef.current
        if (viewport) setInstantScrollTop(viewport, viewport.scrollTop)
    }, [clearAutoScrollTimer])

    const handleViewportScroll = useCallback(() => {
        const viewport = transcriptViewportRef.current
        if (!viewport) return
        const { atBottom } = setViewportEdgeState(viewport)
        if (autoScrollingRef.current) return
        followLatestRef.current = atBottom
        setFollowingLatest(atBottom)
    }, [])

    useEffect(() => clearAutoScrollTimer, [clearAutoScrollTimer])

    useLayoutEffect(() => {
        const shouldSnap = shouldSnapRendererPresentation(
            visibilitySnapshot,
            handledResumeRevisionRef.current
        )
        handledResumeRevisionRef.current = visibilitySnapshot.resumeRevision
        const container = wordContainerRef.current
        const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const animatePresentation = !reduceMotion && !shouldSnap
        const elements = [...(container?.querySelectorAll<HTMLElement>('[data-transcript-word]') ?? [])]
        const currentWordKeys = new Set<string>()
        const visualPreviousPositions = new Map<string, WordPosition>()

        for (const element of elements) {
            const key = element.dataset.transcriptWord
            if (shouldSnap) {
                for (const animation of element.getAnimations()) animation.cancel()
            }
            const previous = key ? previousRectsRef.current.get(key) : null
            if (!key || !previous) continue
            const offset = readTransformOffset(element)
            visualPreviousPositions.set(key, {
                left: previous.left + offset.x,
                right: previous.right + offset.x,
                top: previous.top + offset.y
            })
            for (const animation of element.getAnimations()) {
                if (animation.id === REFLOW_ANIMATION_ID) animation.cancel()
            }
        }

        const nextRects = new Map<string, WordPosition>()
        const lastKey = renderedWords.at(-1)?.key ?? null
        const previousLastKey = previousRectsRef.current.size > 0
            ? [...previousRectsRef.current.keys()].at(-1) ?? null
            : null
        const previousLastPosition = previousLastKey
            ? visualPreviousPositions.get(previousLastKey) ?? previousRectsRef.current.get(previousLastKey)
            : null

        for (const element of elements) {
            const key = element.dataset.transcriptWord
            if (!key) continue
            currentWordKeys.add(key)
            const rect = element.getBoundingClientRect()
            const nextPosition = { left: rect.left, right: rect.right, top: rect.top }
            nextRects.set(key, nextPosition)

            const isNewWord = !animatedWordKeysRef.current.has(key)
            if (animatePresentation && isNewWord) {
                const delay = Number(element.dataset.transcriptDelay ?? 0)
                element.animate([
                    { opacity: 0, filter: 'blur(7px)' },
                    { opacity: 0.86, filter: 'blur(1.5px)', offset: 0.55 },
                    { opacity: 1, filter: 'blur(0)' }
                ], {
                    duration: 440,
                    delay,
                    easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
                    fill: 'both'
                })
            }

            if (!animatePresentation) continue

            const previousPosition = visualPreviousPositions.get(key) ?? previousRectsRef.current.get(key)
            let deltaX = previousPosition ? previousPosition.left - nextPosition.left : 0
            let deltaY = previousPosition && key === lastKey
                ? previousPosition.top - nextPosition.top
                : 0

            if (
                !previousPosition
                && key === lastKey
                && previousLastPosition
                && nextPosition.top > previousLastPosition.top + 1
            ) {
                deltaX = previousLastPosition.right - nextPosition.left
                deltaY = previousLastPosition.top - nextPosition.top
            }

            if (Math.abs(deltaX) > 0.5 || Math.abs(deltaY) > 0.5) {
                const animation = element.animate([
                    { transform: `translate3d(${deltaX}px, ${deltaY}px, 0)` },
                    { transform: 'translate3d(0, 0, 0)' }
                ], {
                    duration: REFLOW_DURATION_MS,
                    easing: 'cubic-bezier(0.2, 1.14, 0.32, 1)',
                    fill: 'both'
                })
                animation.id = REFLOW_ANIMATION_ID
            }
        }

        const viewport = transcriptViewportRef.current
        if (viewport) {
            const { overflowing } = setViewportEdgeState(viewport)
            if (!overflowing) {
                followLatestRef.current = true
                setFollowingLatest(true)
            } else if (followLatestRef.current) {
                scrollToLatest(animatePresentation ? 'smooth' : 'auto')
            }
        }

        previousRectsRef.current = nextRects
        animatedWordKeysRef.current = currentWordKeys
        previousTurnRef.current = entry?.id ?? null
        previousWordCountRef.current = words.length
        if (!entry) {
            wordDelayRef.current.clear()
            followLatestRef.current = true
            setFollowingLatest(true)
        }
    }, [
        entry?.id,
        renderedWords,
        scrollToLatest,
        visibilitySnapshot.resumeRevision,
        visibilitySnapshot.visible,
        words.length
    ])

    return (
        <div
            className="mt-1 flex h-[132px] w-full shrink-0 items-start justify-center overflow-hidden text-center"
            aria-live="polite"
            aria-relevant="additions text"
        >
            {error ? (
                <p role="alert" className="max-w-lg text-[11px] leading-5 text-rose-400">
                    {error}
                </p>
            ) : entry ? (
                <div className="relative w-full max-w-lg pt-1">
                    <span className="sr-only">
                        {entry.role === 'user' ? 'You' : 'Zyra'}: {entry.text}
                    </span>
                    <div
                        ref={transcriptViewportRef}
                        tabIndex={0}
                        onScroll={handleViewportScroll}
                        onWheel={releaseFollowLock}
                        onPointerDown={releaseFollowLock}
                        onTouchStart={releaseFollowLock}
                        onKeyDown={(event) => {
                            if (['ArrowUp', 'PageUp', 'Home'].includes(event.key)) releaseFollowLock()
                        }}
                        className="instructor-voice-transcript-viewport h-[60px] overflow-y-auto overflow-x-hidden"
                        aria-label="Live voice transcript"
                    >
                        <p
                            ref={wordContainerRef}
                            aria-hidden="true"
                            data-speaker={entry.role === 'user' ? 'user' : 'zyra'}
                            className={cn(
                                'instructor-voice-transcript-copy mx-auto w-full text-center leading-5',
                                entry.role === 'user'
                                    ? 'max-w-md text-[11px] font-medium tracking-[0.012em] text-sparkle-text'
                                    : 'max-w-lg text-[12px] font-normal tracking-[-0.005em] text-sparkle-text-secondary',
                                !entry.final && 'opacity-70'
                            )}
                        >
                            {renderedWords.map(({ key, word, delay }) => (
                                <span
                                    key={key}
                                    data-transcript-word={key}
                                    data-transcript-delay={delay}
                                    className="instructor-voice-transcript-word"
                                >
                                    {word}{'\u00a0'}
                                </span>
                            ))}
                        </p>
                    </div>
                    {!followingLatest ? (
                        <button
                            type="button"
                            onClick={() => scrollToLatest('smooth')}
                            className="absolute right-1 top-[66px] inline-flex h-6 items-center gap-1 rounded-full border border-sparkle-border bg-sparkle-bg-elevated px-2 text-[9px] font-medium text-sparkle-text-secondary shadow-sm transition-colors hover:text-sparkle-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sparkle-accent/35"
                            aria-label="Return to the latest transcript"
                        >
                            Latest
                            <ArrowDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
}
