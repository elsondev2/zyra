export type BrowserControlPoint = { x: number; y: number }

export function buildBrowserPointerPath(
    from: BrowserControlPoint | undefined,
    to: BrowserControlPoint,
    durationMs: number
): BrowserControlPoint[] {
    if (!from || durationMs <= 0) return [to]
    const steps = Math.max(2, Math.min(16, Math.round(durationMs / 35)))
    return Array.from({ length: steps }, (_value, index) => {
        const progress = (index + 1) / steps
        return {
            x: from.x + (to.x - from.x) * progress,
            y: from.y + (to.y - from.y) * progress
        }
    })
}

export function browserCdpKeyDescriptor(value: string): {
    key: string
    code?: string
    windowsVirtualKeyCode?: number
    nativeVirtualKeyCode?: number
} {
    const alias = String(value || '').trim().toLowerCase()
    const special: Record<string, { key: string; code: string; virtualKey: number }> = {
        enter: { key: 'Enter', code: 'Enter', virtualKey: 13 },
        return: { key: 'Enter', code: 'Enter', virtualKey: 13 },
        esc: { key: 'Escape', code: 'Escape', virtualKey: 27 },
        escape: { key: 'Escape', code: 'Escape', virtualKey: 27 },
        backspace: { key: 'Backspace', code: 'Backspace', virtualKey: 8 },
        delete: { key: 'Delete', code: 'Delete', virtualKey: 46 },
        tab: { key: 'Tab', code: 'Tab', virtualKey: 9 },
        home: { key: 'Home', code: 'Home', virtualKey: 36 },
        end: { key: 'End', code: 'End', virtualKey: 35 },
        arrowleft: { key: 'ArrowLeft', code: 'ArrowLeft', virtualKey: 37 },
        arrowup: { key: 'ArrowUp', code: 'ArrowUp', virtualKey: 38 },
        arrowright: { key: 'ArrowRight', code: 'ArrowRight', virtualKey: 39 },
        arrowdown: { key: 'ArrowDown', code: 'ArrowDown', virtualKey: 40 },
        space: { key: ' ', code: 'Space', virtualKey: 32 }
    }
    const resolved = special[alias]
    if (resolved) {
        return {
            key: resolved.key,
            code: resolved.code,
            windowsVirtualKeyCode: resolved.virtualKey,
            nativeVirtualKeyCode: resolved.virtualKey
        }
    }
    if (value.length === 1) {
        const upper = value.toUpperCase()
        const letter = /^[A-Z]$/.test(upper)
        const digit = /^\d$/.test(value)
        const virtualKey = upper.charCodeAt(0)
        return {
            key: value,
            code: letter ? `Key${upper}` : digit ? `Digit${value}` : undefined,
            windowsVirtualKeyCode: virtualKey,
            nativeVirtualKeyCode: virtualKey
        }
    }
    return { key: value }
}
