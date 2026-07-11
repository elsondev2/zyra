import { useEffect, useRef, useState } from 'react'
import type { AssistantTextStreamingMode } from '@/lib/settings'

const STREAM_FLUSH_MS = 72
const CHUNKED_STREAM_FLUSH_MS = 140

function hasActiveDocumentSelection(): boolean {
    if (typeof window === 'undefined' || typeof window.getSelection !== 'function') return false
    const selection = window.getSelection()
    return Boolean(selection && selection.rangeCount > 0 && !selection.isCollapsed)
}

export function useAssistantVisibleText(text: string, streaming: boolean, mode: AssistantTextStreamingMode): string {
    const [visibleText, setVisibleText] = useState(text)
    const latestTextRef = useRef(text)
    const flushTimeoutRef = useRef<number | null>(null)
    const selectionActiveRef = useRef(false)
    const visibleTextRef = useRef(text)

    useEffect(() => {
        visibleTextRef.current = visibleText
    }, [visibleText])

    useEffect(() => {
        if (!streaming) {
            selectionActiveRef.current = false
            return
        }

        const syncSelectionState = () => {
            const nextSelectionActive = hasActiveDocumentSelection()
            const previousSelectionActive = selectionActiveRef.current
            selectionActiveRef.current = nextSelectionActive

            if (previousSelectionActive && !nextSelectionActive) {
                const nextVisibleText = latestTextRef.current
                if (visibleTextRef.current !== nextVisibleText) {
                    visibleTextRef.current = nextVisibleText
                    setVisibleText(nextVisibleText)
                }
            }
        }

        syncSelectionState()
        document.addEventListener('selectionchange', syncSelectionState)
        return () => {
            document.removeEventListener('selectionchange', syncSelectionState)
        }
    }, [streaming])

    useEffect(() => {
        latestTextRef.current = text

        if (!streaming) {
            if (flushTimeoutRef.current !== null) {
                window.clearTimeout(flushTimeoutRef.current)
                flushTimeoutRef.current = null
            }
            setVisibleText(text)
            return
        }

        if (selectionActiveRef.current) {
            if (flushTimeoutRef.current !== null) {
                window.clearTimeout(flushTimeoutRef.current)
                flushTimeoutRef.current = null
            }
            return
        }

        const flushDelayMs = mode === 'chunks' ? CHUNKED_STREAM_FLUSH_MS : STREAM_FLUSH_MS
        if (flushTimeoutRef.current !== null) return

        flushTimeoutRef.current = window.setTimeout(() => {
            flushTimeoutRef.current = null
            if (selectionActiveRef.current) return
            setVisibleText((current) => current === latestTextRef.current ? current : latestTextRef.current)
        }, flushDelayMs)
    }, [mode, streaming, text])

    useEffect(() => {
        return () => {
            if (flushTimeoutRef.current !== null) {
                window.clearTimeout(flushTimeoutRef.current)
            }
        }
    }, [])

    return streaming ? visibleText : text
}
