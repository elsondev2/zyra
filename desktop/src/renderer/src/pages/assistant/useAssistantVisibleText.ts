import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { AssistantTextStreamingMode } from '@/lib/settings'
import {
    assistantStreamPresentation,
    type AssistantStreamPresentationChannel
} from '@/lib/assistant/assistant-stream-presentation'

const STREAM_FRAME_INTERVAL_MS = 32
const CHUNKED_FRAME_INTERVAL_MS = 72
const STREAM_TARGET_DRAIN_FRAMES = 10
const CHUNKED_TARGET_DRAIN_FRAMES = 5
const COMPLETION_TARGET_DRAIN_FRAMES = 5
const MAX_INITIAL_STREAM_REPLAY_CHARACTERS = 160

export type AssistantVisibleTextPresentation = {
    text: string
    presenting: boolean
    sourceStreaming: boolean
}

type AssistantVisibleTextOptions = {
    streamId: string
    channel: AssistantStreamPresentationChannel
    text: string
    streaming: boolean
    mode: AssistantTextStreamingMode
}

function hasActiveDocumentSelection(): boolean {
    if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return false
    const selection = window.getSelection()
    return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed)
}

function shouldAvoidAnimatedStreaming(): boolean {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return true
    return typeof window !== 'undefined'
        && typeof window.matchMedia === 'function'
        && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function getAssistantStreamRevealCount(
    backlogCharacters: number,
    mode: AssistantTextStreamingMode,
    completing: boolean
): number {
    if (backlogCharacters <= 0) return 0
    const targetFrames = completing
        ? COMPLETION_TARGET_DRAIN_FRAMES
        : mode === 'chunks'
            ? CHUNKED_TARGET_DRAIN_FRAMES
            : STREAM_TARGET_DRAIN_FRAMES
    const minimum = mode === 'chunks' ? 4 : 1
    return Math.min(backlogCharacters, Math.max(minimum, Math.ceil(backlogCharacters / targetFrames)))
}

function avoidSplittingSurrogatePair(text: string, end: number): number {
    if (end <= 0 || end >= text.length) return end
    const previous = text.charCodeAt(end - 1)
    const next = text.charCodeAt(end)
    return previous >= 0xD800 && previous <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF
        ? end + 1
        : end
}

export function getAssistantInitialVisibleText(text: string, streaming: boolean): string {
    if (!streaming) return text
    if (text.length <= MAX_INITIAL_STREAM_REPLAY_CHARACTERS) return ''
    const end = avoidSplittingSurrogatePair(text, text.length - MAX_INITIAL_STREAM_REPLAY_CHARACTERS)
    return text.slice(0, end)
}

export function revealAssistantStreamText(
    currentText: string,
    targetText: string,
    mode: AssistantTextStreamingMode,
    completing: boolean,
    minimumRevealCount = 0
): string {
    if (currentText === targetText) return currentText
    if (!targetText.startsWith(currentText)) return targetText

    const backlog = targetText.length - currentText.length
    const revealCount = Math.max(
        minimumRevealCount,
        getAssistantStreamRevealCount(backlog, mode, completing)
    )
    let end = Math.min(targetText.length, currentText.length + revealCount)

    if (mode === 'chunks' && end < targetText.length) {
        const searchEnd = Math.min(targetText.length, end + 28)
        while (end < searchEnd && !/[\s.,!?;:)}\]]/.test(targetText[end] || '')) end += 1
        if (end < targetText.length) end += 1
    }

    end = avoidSplittingSurrogatePair(targetText, end)
    return targetText.slice(0, end)
}

function resolvePresentationTarget(
    authoritativeText: string,
    streamText: string,
    streamRevision: number
): string {
    if (streamRevision === 0) return authoritativeText
    return streamText || authoritativeText
}

export function useAssistantVisibleText({
    streamId,
    channel,
    text,
    streaming,
    mode
}: AssistantVisibleTextOptions): AssistantVisibleTextPresentation {
    const subscribe = useCallback(
        (listener: () => void) => assistantStreamPresentation.subscribe(channel, streamId, listener),
        [channel, streamId]
    )
    const getSnapshot = useCallback(
        () => assistantStreamPresentation.getSnapshot(channel, streamId),
        [channel, streamId]
    )
    const streamSnapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
    const targetText = useMemo(
        () => resolvePresentationTarget(
            text,
            streamSnapshot.text,
            streamSnapshot.revision
        ),
        [streamSnapshot.revision, streamSnapshot.text, text]
    )
    const sourceStreaming = streamSnapshot.revision > 0 ? streamSnapshot.streaming : streaming
    const shouldReplayInitialStream = streaming && streamSnapshot.revision > 0
    const initialVisibleText = getAssistantInitialVisibleText(text, shouldReplayInitialStream)
    const [visibleText, setVisibleText] = useState(initialVisibleText)
    const [selectionPaused, setSelectionPaused] = useState(false)
    const visibleTextRef = useRef(initialVisibleText)
    const lastRevealAtRef = useRef(0)
    const activeStreamKeyRef = useRef(`${channel}:${streamId}`)

    useEffect(() => {
        const nextStreamKey = `${channel}:${streamId}`
        if (activeStreamKeyRef.current === nextStreamKey) return
        activeStreamKeyRef.current = nextStreamKey
        const nextVisibleText = getAssistantInitialVisibleText(text, shouldReplayInitialStream)
        visibleTextRef.current = nextVisibleText
        lastRevealAtRef.current = 0
        setVisibleText(nextVisibleText)
    }, [channel, shouldReplayInitialStream, streamId, text])

    useEffect(() => {
        if (!streaming && streamSnapshot.revision === 0) return

        const syncSelectionState = () => setSelectionPaused(hasActiveDocumentSelection())
        syncSelectionState()
        document.addEventListener('selectionchange', syncSelectionState)
        return () => document.removeEventListener('selectionchange', syncSelectionState)
    }, [streamSnapshot.revision, streaming])

    useEffect(() => {
        if (selectionPaused) return
        if (shouldAvoidAnimatedStreaming()) {
            if (visibleTextRef.current !== targetText) {
                visibleTextRef.current = targetText
                setVisibleText(targetText)
            }
            return
        }
        if (visibleTextRef.current === targetText) return
        if (!targetText.startsWith(visibleTextRef.current)) {
            visibleTextRef.current = targetText
            setVisibleText(targetText)
            return
        }

        let cancelled = false
        let frameId = 0
        const frameInterval = mode === 'chunks' ? CHUNKED_FRAME_INTERVAL_MS : STREAM_FRAME_INTERVAL_MS
        const minimumRevealCount = getAssistantStreamRevealCount(
            targetText.length - visibleTextRef.current.length,
            mode,
            !sourceStreaming
        )
        const pump = (timestamp: number) => {
            if (cancelled) return
            const elapsed = timestamp - lastRevealAtRef.current
            if (lastRevealAtRef.current > 0 && elapsed < frameInterval) {
                frameId = window.requestAnimationFrame(pump)
                return
            }

            lastRevealAtRef.current = timestamp
            const nextText = revealAssistantStreamText(
                visibleTextRef.current,
                targetText,
                mode,
                !sourceStreaming,
                minimumRevealCount
            )
            if (nextText !== visibleTextRef.current) {
                visibleTextRef.current = nextText
                setVisibleText(nextText)
            }
            if (nextText !== targetText) frameId = window.requestAnimationFrame(pump)
        }
        frameId = window.requestAnimationFrame(pump)
        return () => {
            cancelled = true
            window.cancelAnimationFrame(frameId)
        }
    }, [mode, selectionPaused, sourceStreaming, targetText])

    return {
        text: visibleText,
        presenting: sourceStreaming || visibleText !== targetText,
        sourceStreaming
    }
}
