export const ACCESSORY_BROWSER_TEAR_OFF_THRESHOLD = 44

type Bounds = { left: number; right: number; top: number; bottom: number }
type Point = { x: number; y: number }

export function movedAccessoryBrowserTabBounds(bounds: Bounds, delta: Point): Bounds {
    return {
        left: bounds.left + delta.x,
        right: bounds.right + delta.x,
        top: bounds.top + delta.y,
        bottom: bounds.bottom + delta.y
    }
}

export function isAccessoryBrowserTabTearOff(dragged: Bounds | null, strip: Bounds | null): boolean {
    if (!dragged || !strip) return false
    return dragged.top < strip.top - ACCESSORY_BROWSER_TEAR_OFF_THRESHOLD
        || dragged.bottom > strip.bottom + ACCESSORY_BROWSER_TEAR_OFF_THRESHOLD
        || dragged.right < strip.left - ACCESSORY_BROWSER_TEAR_OFF_THRESHOLD
        || dragged.left > strip.right + ACCESSORY_BROWSER_TEAR_OFF_THRESHOLD
}

export function accessoryBrowserGrabOffset(pointer: Point, windowOrigin: Point): Point {
    return {
        x: Math.max(0, Math.round(pointer.x - windowOrigin.x)),
        y: Math.max(0, Math.round(pointer.y - windowOrigin.y))
    }
}
