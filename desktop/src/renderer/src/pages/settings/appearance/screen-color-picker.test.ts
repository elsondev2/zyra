import { pickScreenColor } from './screen-color-picker'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

let opened = 0
const overlayWindow = {
    EyeDropper: class {
        open() {
            opened += 1
            return Promise.resolve({ sRGBHex: '#A1B2C3' })
        }
    }
} as unknown as Window
const picked = pickScreenColor(overlayWindow)
assert(opened === 1, 'The eyedropper opens synchronously in the clicked window to preserve user activation.')
const result = await picked
assert(result.status === 'picked' && result.color === '#a1b2c3', 'The picked color is normalized.')

const cancelled = await pickScreenColor({ EyeDropper: class { open() { return Promise.reject({ name: 'AbortError' }) } } } as unknown as Window)
assert(cancelled.status === 'cancelled', 'Cancelling in another window realm is not reported as a failure.')

const unavailable = await pickScreenColor({} as Window)
assert(unavailable.status === 'error', 'An unsupported overlay window reports why picking is unavailable.')

console.log('Screen color picker window activation and results: ok')
