import { useCallback, useEffect, useMemo, useState, type RefObject } from 'react'
import type { AssistantBrowserBackground } from './assistant-browser-backgrounds'
import {
    sampleBrowserBackgroundForegroundTone,
    type AssistantBrowserContrastRegion,
    type AssistantBrowserForegroundTone
} from './assistant-browser-background-contrast'

type AssistantBrowserNewTabContrast = {
    actions: AssistantBrowserForegroundTone
    attribution: AssistantBrowserForegroundTone
    clock: AssistantBrowserForegroundTone
}

const CONTRAST_SAMPLE_WIDTH = 256

const CONTRAST_REGIONS: Record<keyof AssistantBrowserNewTabContrast, AssistantBrowserContrastRegion> = {
    actions: { x: 0.87, y: 0, width: 0.13, height: 0.12 },
    attribution: { x: 0, y: 0.90, width: 0.42, height: 0.10 },
    clock: { x: 0.30, y: 0.20, width: 0.40, height: 0.24 }
}

function hexColorUsesDarkForeground(value: string | null | undefined): boolean {
    const match = /^#([0-9a-f]{6})$/i.exec(String(value || '').trim())
    if (!match) return false
    const color = match[1]!
    const red = Number.parseInt(color.slice(0, 2), 16)
    const green = Number.parseInt(color.slice(2, 4), 16)
    const blue = Number.parseInt(color.slice(4, 6), 16)
    return ((red * 299) + (green * 587) + (blue * 114)) / 1000 > 166
}

function fallbackTone(background: AssistantBrowserBackground | null): AssistantBrowserForegroundTone {
    if (!background) return 'light'
    if (background.provider === 'built-in') return background.textTone
    return hexColorUsesDarkForeground(background.color) ? 'dark' : 'light'
}

export function useAssistantBrowserNewTabContrast({
    background,
    imageRef,
    surfaceRef
}: {
    background: AssistantBrowserBackground | null
    imageRef: RefObject<HTMLImageElement | null>
    surfaceRef: RefObject<HTMLDivElement | null>
}): AssistantBrowserNewTabContrast {
    const fallback = useMemo<AssistantBrowserNewTabContrast>(() => {
        const tone = fallbackTone(background)
        return { actions: tone, attribution: tone, clock: tone }
    }, [background])
    const [contrast, setContrast] = useState(fallback)

    const measure = useCallback(() => {
        const image = imageRef.current
        const surface = surfaceRef.current
        if (!background || !image || !surface || !image.complete || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
            setContrast(fallback)
            return
        }

        const surfaceWidth = surface.clientWidth
        const surfaceHeight = surface.clientHeight
        if (surfaceWidth <= 0 || surfaceHeight <= 0) return

        try {
            const canvas = document.createElement('canvas')
            canvas.width = CONTRAST_SAMPLE_WIDTH
            canvas.height = Math.max(1, Math.round(CONTRAST_SAMPLE_WIDTH * (surfaceHeight / surfaceWidth)))
            const context = canvas.getContext('2d', { willReadFrequently: true })
            if (!context) return

            const coverScale = Math.max(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight)
            const drawnWidth = image.naturalWidth * coverScale
            const drawnHeight = image.naturalHeight * coverScale
            const focalPoint = background.provider === 'built-in' ? background.focalPoint : { x: 0.5, y: 0.5 }
            const offsetX = (canvas.width - drawnWidth) * focalPoint.x
            const offsetY = (canvas.height - drawnHeight) * focalPoint.y
            context.drawImage(image, offsetX, offsetY, drawnWidth, drawnHeight)
            const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
            const next: AssistantBrowserNewTabContrast = {
                actions: sampleBrowserBackgroundForegroundTone(pixels, canvas.width, canvas.height, CONTRAST_REGIONS.actions),
                attribution: sampleBrowserBackgroundForegroundTone(pixels, canvas.width, canvas.height, CONTRAST_REGIONS.attribution),
                clock: sampleBrowserBackgroundForegroundTone(pixels, canvas.width, canvas.height, CONTRAST_REGIONS.clock)
            }
            setContrast((current) => current.actions === next.actions && current.attribution === next.attribution && current.clock === next.clock ? current : next)
        } catch {
            // Cross-origin providers can refuse pixel access; their supplied color remains the fallback.
            setContrast(fallback)
        }
    }, [background, fallback, imageRef, surfaceRef])

    useEffect(() => {
        const image = imageRef.current
        const surface = surfaceRef.current
        if (!image || !surface) {
            setContrast(fallback)
            return
        }

        let animationFrame = 0
        const scheduleMeasurement = () => {
            window.cancelAnimationFrame(animationFrame)
            animationFrame = window.requestAnimationFrame(measure)
        }
        const resizeObserver = new ResizeObserver(scheduleMeasurement)
        image.addEventListener('load', scheduleMeasurement)
        resizeObserver.observe(surface)
        scheduleMeasurement()
        return () => {
            window.cancelAnimationFrame(animationFrame)
            image.removeEventListener('load', scheduleMeasurement)
            resizeObserver.disconnect()
        }
    }, [fallback, imageRef, measure, surfaceRef])

    return contrast
}
