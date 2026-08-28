import assert from 'node:assert/strict'
import { sampleBrowserBackgroundForegroundTone } from '../src/renderer/src/pages/assistant/assistant-browser-background-contrast'

const width = 8
const height = 8
const pixels = new Uint8ClampedArray(width * height * 4)

for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
        const bright = y < height / 2
        const offset = ((y * width) + x) * 4
        pixels[offset] = bright ? 235 : 18
        pixels[offset + 1] = bright ? 240 : 22
        pixels[offset + 2] = bright ? 245 : 28
        pixels[offset + 3] = 255
    }
}

assert.equal(sampleBrowserBackgroundForegroundTone(pixels, width, height, { x: 0, y: 0, width: 1, height: 0.5 }), 'dark', 'bright photo regions need a dark foreground')
assert.equal(sampleBrowserBackgroundForegroundTone(pixels, width, height, { x: 0, y: 0.5, width: 1, height: 0.5 }), 'light', 'dark photo regions need a light foreground')

console.log('Browser background local contrast: ok')
