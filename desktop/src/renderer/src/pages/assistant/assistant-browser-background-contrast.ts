export type AssistantBrowserForegroundTone = 'light' | 'dark'

export type AssistantBrowserContrastRegion = {
    x: number
    y: number
    width: number
    height: number
}

function clamp(value: number, minimum: number, maximum: number): number {
    return Math.min(maximum, Math.max(minimum, value))
}

function srgbChannelToLinear(value: number): number {
    const channel = clamp(value / 255, 0, 1)
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

export function sampleBrowserBackgroundForegroundTone(
    pixels: Uint8ClampedArray,
    canvasWidth: number,
    canvasHeight: number,
    region: AssistantBrowserContrastRegion
): AssistantBrowserForegroundTone {
    if (canvasWidth <= 0 || canvasHeight <= 0 || pixels.length < canvasWidth * canvasHeight * 4) return 'light'

    const left = clamp(Math.floor(region.x * canvasWidth), 0, canvasWidth - 1)
    const top = clamp(Math.floor(region.y * canvasHeight), 0, canvasHeight - 1)
    const right = clamp(Math.ceil((region.x + region.width) * canvasWidth), left + 1, canvasWidth)
    const bottom = clamp(Math.ceil((region.y + region.height) * canvasHeight), top + 1, canvasHeight)
    let luminanceTotal = 0
    let sampleCount = 0

    for (let y = top; y < bottom; y += 1) {
        for (let x = left; x < right; x += 1) {
            const offset = ((y * canvasWidth) + x) * 4
            if ((pixels[offset + 3] || 0) < 32) continue
            const red = srgbChannelToLinear(pixels[offset] || 0)
            const green = srgbChannelToLinear(pixels[offset + 1] || 0)
            const blue = srgbChannelToLinear(pixels[offset + 2] || 0)
            luminanceTotal += (0.2126 * red) + (0.7152 * green) + (0.0722 * blue)
            sampleCount += 1
        }
    }

    if (sampleCount === 0) return 'light'
    return luminanceTotal / sampleCount >= 0.42 ? 'dark' : 'light'
}
