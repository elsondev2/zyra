import { nativeImage, type NativeImage, type Rectangle, type WebContents } from 'electron'

const captures = new WeakMap<WebContents, Promise<NativeImage>>()
const previews = new WeakMap<WebContents, Promise<string>>()

/** Read the owned surface directly; avoid full-size PNG encoding and decoding on hover. */
export function captureBrowserTabPreview(guest: WebContents): Promise<string> {
    const pending = previews.get(guest)
    if (pending) return pending
    const capture = (async () => {
        if (guest.isDestroyed()) throw new Error('The Browser tab was closed.')
        const image = await bounded(guest.capturePage(undefined, { stayHidden: true, stayAwake: true }))
        if (image.isEmpty()) throw new Error('The Browser preview is unavailable.')
        const size = image.getSize()
        // 3x the card's display width preserves crisp text on high-DPI screens.
        const scale = Math.min(1, 768 / size.width, 480 / size.height)
        const thumbnail = scale < 1 ? image.resize({
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)), quality: 'best'
        }) : image
        const jpeg = thumbnail.toJPEG(82)
        return `data:image/jpeg;base64,${jpeg.toString('base64')}`
    })()
    previews.set(guest, capture)
    void capture.finally(() => { if (previews.get(guest) === capture) previews.delete(guest) }).catch(() => undefined)
    return capture
}

async function bounded<T>(operation: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
        return await Promise.race([operation, new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Browser screenshot timed out.')), 4_000)
        })])
    } finally { clearTimeout(timer) }
}

// Electron capturePage can return the last presented frame for an occluded native view.
// Ask Chromium for a fresh compositor frame first, including late canvas/app hydration.
export function captureBrowserPage(guest: WebContents, rect?: Rectangle, surfaceOnly = false): Promise<NativeImage> {
    const previous = captures.get(guest)
    const capture = (previous?.catch(() => undefined) || Promise.resolve()).then(async () => {
        if (guest.isDestroyed()) throw new Error('The Browser tab was closed.')
        const errors: string[] = []
        try {
            // Keep this page-owned transport until close, agent release or DevTools takes over.
            // Detaching a temporary connection can interrupt a concurrent agent attachment.
            if (!guest.debugger.isAttached()) guest.debugger.attach('1.3')
            const viewport = rect ? await bounded(guest.executeJavaScript('({ width: innerWidth, height: innerHeight })')) as { width: number; height: number } : undefined
            for (const fromSurface of surfaceOnly ? [true] : [true, false]) {
                try {
                    const result = await bounded(guest.debugger.sendCommand('Page.captureScreenshot', {
                        format: 'png', fromSurface, captureBeyondViewport: false
                    }))
                    const image = nativeImage.createFromBuffer(Buffer.from(result.data || '', 'base64'))
                    if (!image.isEmpty()) {
                        // Normalize device scale before cropping CSS viewport coordinates.
                        return rect && viewport ? image.resize({ width: viewport.width, height: viewport.height }).crop(rect) : image
                    }
                    errors.push('Chromium returned an empty frame.')
                } catch (error) { errors.push(error instanceof Error ? error.message : String(error)) }
            }
        } catch (error) { errors.push(error instanceof Error ? error.message : String(error)) }
        // Inactive previews must never fall back to the containing window's frame.
        if (surfaceOnly) throw new Error(`Could not capture the Browser tab surface: ${errors.join('; ')}`)
        // DevTools can own the debugger. Preserve ordinary screenshots in that case.
        try {
            const image = await bounded(guest.capturePage(rect))
            if (!image.isEmpty()) return image
        } catch (error) { errors.push(error instanceof Error ? error.message : String(error)) }
        throw new Error(`Could not capture the Browser tab: ${errors.join('; ')}`)
    })
    captures.set(guest, capture)
    void capture.finally(() => { if (captures.get(guest) === capture) captures.delete(guest) }).catch(() => undefined)
    return capture
}
