import { useEffect, type RefObject } from 'react'
import { subscribeAssistantComposerFocus } from './assistant-composer-focus'

/** Consume destination-bound focus only when its actual input is ready. */
export function useAssistantComposerFocus({ sessionId, inputRef, inputDisabled, recorderRef, recorderActive }: {
    sessionId?: string | null
    inputRef: RefObject<HTMLElement | null>
    inputDisabled: boolean
    recorderRef: RefObject<HTMLElement | null>
    recorderActive: boolean
}) {
    useEffect(() => subscribeAssistantComposerFocus(() => {
        if (recorderActive) {
            const recorder = recorderRef.current
            if (!recorder) return false
            recorder.focus({ preventScroll: true })
            return recorder.ownerDocument.activeElement === recorder
        }
        const textarea = inputRef.current
        if (!textarea || inputDisabled || !textarea.getClientRects().length) return false
        textarea.focus()
        return textarea.ownerDocument.activeElement === textarea
    }, sessionId), [sessionId, inputRef, inputDisabled, recorderRef, recorderActive])
}
