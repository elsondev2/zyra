import { normalizeHex } from './zyra-color'

type EyeDropperWindow = Window & {
    EyeDropper?: new () => { open: () => Promise<{ sRGBHex: string }> }
}

export type ScreenColorPickResult =
    | { status: 'picked'; color: string }
    | { status: 'cancelled' }
    | { status: 'error'; message: string }

export async function pickScreenColor(ownerWindow: Window | null): Promise<ScreenColorPickResult> {
    const EyeDropper = (ownerWindow as EyeDropperWindow | null)?.EyeDropper
    if (!EyeDropper) return { status: 'error', message: 'Screen color picking is unavailable in this window.' }
    try {
        // open() runs before the first await, in the window that received the click.
        const result = await new EyeDropper().open()
        const color = normalizeHex(result.sRGBHex)
        return color
            ? { status: 'picked', color }
            : { status: 'error', message: 'The screen picker returned an invalid color.' }
    } catch (error) {
        const failure = error && typeof error === 'object' ? error as { name?: unknown; message?: unknown } : null
        if (failure?.name === 'AbortError') return { status: 'cancelled' }
        return { status: 'error', message: typeof failure?.message === 'string' && failure.message ? `Screen color picking failed: ${failure.message}` : 'Screen color picking failed.' }
    }
}
