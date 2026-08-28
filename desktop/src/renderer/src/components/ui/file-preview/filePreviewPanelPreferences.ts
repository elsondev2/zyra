const STORAGE_KEY = 'zyra:file-preview-panel-layout:v1'
const LEFT_MIN = 256
const LEFT_MAX = 460
const RIGHT_MIN = 240
const RIGHT_MAX = 520

export type FilePreviewPanelPreferences = {
    leftWidth: number
    rightWidth: number
}

const defaults: FilePreviewPanelPreferences = {
    leftWidth: 256,
    rightWidth: 288
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
    const numeric = Number(value)
    if (!Number.isFinite(numeric)) return fallback
    return Math.min(max, Math.max(min, Math.round(numeric)))
}

export function readFilePreviewPanelPreferences(): FilePreviewPanelPreferences {
    if (typeof window === 'undefined' || !window.localStorage) return defaults
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}') as Partial<FilePreviewPanelPreferences>
        return {
            leftWidth: clamp(parsed.leftWidth, LEFT_MIN, LEFT_MAX, defaults.leftWidth),
            rightWidth: clamp(parsed.rightWidth, RIGHT_MIN, RIGHT_MAX, defaults.rightWidth)
        }
    } catch {
        return defaults
    }
}

export function writeFilePreviewPanelPreferences(patch: Partial<FilePreviewPanelPreferences>): void {
    if (typeof window === 'undefined' || !window.localStorage) return
    const current = readFilePreviewPanelPreferences()
    const next = {
        leftWidth: clamp(patch.leftWidth ?? current.leftWidth, LEFT_MIN, LEFT_MAX, current.leftWidth),
        rightWidth: clamp(patch.rightWidth ?? current.rightWidth, RIGHT_MIN, RIGHT_MAX, current.rightWidth)
    }
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
        // Keep resize behavior available when storage is unavailable.
    }
}
