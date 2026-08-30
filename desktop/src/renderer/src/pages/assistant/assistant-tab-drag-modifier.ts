import type { Modifier } from '@dnd-kit/core'

export const ASSISTANT_TAB_TEAR_OFF_THRESHOLD = 44

type TabDragBounds = { left: number; right: number; top: number; bottom: number }

export function isAssistantTabTearOff(dragged: TabDragBounds | null, container: TabDragBounds | null): boolean {
    if (!dragged || !container) return false
    return dragged.top < container.top - ASSISTANT_TAB_TEAR_OFF_THRESHOLD
        || dragged.bottom > container.bottom + ASSISTANT_TAB_TEAR_OFF_THRESHOLD
}

export function createAssistantTabDragWithTearOff(
    onTearOffChange: (tearingOff: boolean) => void = () => undefined
): Modifier {
    return ({ containerNodeRect, draggingNodeRect, transform, windowRect }) => {
        if (!draggingNodeRect || !containerNodeRect) {
            onTearOffChange(false)
            return { ...transform, y: 0 }
        }

        const movedLeft = draggingNodeRect.left + transform.x
        const movedRight = draggingNodeRect.right + transform.x
        const movedTop = draggingNodeRect.top + transform.y
        const movedBottom = draggingNodeRect.bottom + transform.y
        const tearingOff = isAssistantTabTearOff(
            { left: movedLeft, right: movedRight, top: movedTop, bottom: movedBottom },
            containerNodeRect
        )

        if (!tearingOff) {
            onTearOffChange(false)
            let x = transform.x
            if (movedLeft < containerNodeRect.left) x += containerNodeRect.left - movedLeft
            else if (movedRight > containerNodeRect.right) x -= movedRight - containerNodeRect.right
            return { ...transform, x, y: 0 }
        }

        onTearOffChange(true)
        let x = transform.x
        let y = transform.y
        if (movedTop < containerNodeRect.top - ASSISTANT_TAB_TEAR_OFF_THRESHOLD) {
            y += draggingNodeRect.top - containerNodeRect.top + ASSISTANT_TAB_TEAR_OFF_THRESHOLD
        } else if (movedBottom > containerNodeRect.bottom + ASSISTANT_TAB_TEAR_OFF_THRESHOLD) {
            y -= containerNodeRect.bottom - draggingNodeRect.bottom + ASSISTANT_TAB_TEAR_OFF_THRESHOLD
        } else {
            y = 0
        }

        if (!windowRect) return { ...transform, x, y }
        const margin = 4
        const releasedLeft = draggingNodeRect.left + x
        const releasedRight = draggingNodeRect.right + x
        const releasedTop = draggingNodeRect.top + y
        const releasedBottom = draggingNodeRect.bottom + y
        if (releasedLeft < windowRect.left + margin) x += windowRect.left + margin - releasedLeft
        else if (releasedRight > windowRect.right - margin) x -= releasedRight - (windowRect.right - margin)
        if (releasedTop < windowRect.top + margin) y += windowRect.top + margin - releasedTop
        else if (releasedBottom > windowRect.bottom - margin) y -= releasedBottom - (windowRect.bottom - margin)
        return { ...transform, x, y }
    }
}

export const assistantTabDragWithTearOff = createAssistantTabDragWithTearOff()
