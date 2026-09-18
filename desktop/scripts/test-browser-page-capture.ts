import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import type { NativeImage, WebContents } from 'electron'

mock.module('electron', () => ({ nativeImage: {} }))
const { captureBrowserTabPreview } = await import('../src/main/browser-page-capture')

function fixture() {
    let deliver: (image: NativeImage) => void = () => { throw new Error('No frame subscription') }
    let finishWake: () => void = () => { throw new Error('No wake request') }
    let failWake: (error: Error) => void = () => { throw new Error('No wake request') }
    let finishPaint: () => void = () => { throw new Error('No paint barrier') }
    const calls = { subscriptions: 0, captures: 0, paintBarriers: 0, releases: 0, resizes: [] as unknown[] }
    let destroyed = false
    const image = (label: string, empty = false) => ({
        isEmpty: () => empty,
        getSize: () => ({ width: 1600, height: 1000 }),
        resize: (options: unknown) => { calls.resizes.push(options); return { toJPEG: (quality: number) => { assert.equal(quality, 82); return Buffer.from(label) } } },
        toJPEG: () => { throw new Error('Large images must be resized before encoding') }
    }) as NativeImage
    const guest = {
        isDestroyed: () => destroyed,
        beginFrameSubscription: (onlyDirty: boolean, callback: (image: NativeImage) => void) => {
            assert.equal(onlyDirty, false)
            calls.subscriptions++
            deliver = callback
        },
        endFrameSubscription: () => { calls.releases++ },
        executeJavaScript: (source: string) => {
            assert.equal(source, 'new Promise(resolve => requestAnimationFrame(resolve))')
            calls.paintBarriers++
            return new Promise<void>(resolve => { finishPaint = resolve })
        },
        capturePage: (rect: unknown, options: unknown) => {
            assert.equal(rect, undefined)
            assert.deepEqual(options, { stayHidden: false, stayAwake: true })
            calls.captures++
            return new Promise<NativeImage>((resolve, reject) => {
                finishWake = () => resolve(image('stale'))
                failWake = reject
            })
        }
    } as unknown as WebContents
    return { guest, calls, image, deliver: (label: string, empty = false) => deliver(image(label, empty)),
        wake: () => finishWake(), paint: () => finishPaint(), fail: (error: Error) => failWake(error), destroy: () => { destroyed = true } }
}

async function flush() {
    for (let index = 0; index < 4; index++) await Promise.resolve()
}

const first = fixture()
const pending = captureBrowserTabPreview(first.guest)
assert.equal(captureBrowserTabPreview(first.guest), pending, 'concurrent preview requests share one subscription and capture')
let settled = false
void pending.then(() => { settled = true })
first.wake()
first.deliver('stale')
await flush()
assert.equal(settled, false, 'a first subscription frame before the renderer paint barrier cannot settle the thumbnail')
first.deliver('fresh')
assert.equal(settled, false, 'a frame scheduled by rAF waits for the renderer paint barrier')
first.paint()
assert.equal(await pending, `data:image/jpeg;base64,${Buffer.from('fresh').toString('base64')}`,
    'a compositor frame delivered before rAF completion IPC is retained')
assert.deepEqual(first.calls, { subscriptions: 1, captures: 1, paintBarriers: 1, releases: 1,
    resizes: [{ width: 768, height: 480, quality: 'best' }] })

const staticPage = fixture()
const staticPreview = captureBrowserTabPreview(staticPage.guest)
staticPage.wake()
staticPage.deliver('initial')
await flush()
staticPage.deliver('static')
staticPage.paint()
assert.equal(await staticPreview, `data:image/jpeg;base64,${Buffer.from('static').toString('base64')}`,
    'a static page completes from the frame scheduled after its paint barrier')

const second = captureBrowserTabPreview(first.guest)
assert.notEqual(second, pending, 'settled requests leave the per-tab deduplication map')
first.wake()
first.deliver('initial')
await flush()
first.deliver('next')
first.paint()
await second
assert.equal(first.calls.releases, 2, 'each settled capture releases its subscription')

const failed = fixture()
const failedRequest = captureBrowserTabPreview(failed.guest)
const rejection = assert.rejects(failedRequest, /capture failed/)
failed.fail(new Error('capture failed'))
await rejection
assert.equal(failed.calls.releases, 1, 'capture errors release the frame subscription')
const retry = captureBrowserTabPreview(failed.guest)
failed.wake(); failed.deliver('initial')
await flush()
failed.deliver('retry'); failed.paint()
await retry
assert.equal(failed.calls.subscriptions, 2, 'failed captures can be retried')

const empty = fixture()
const emptyRequest = captureBrowserTabPreview(empty.guest)
const emptyRejection = assert.rejects(emptyRequest, /preview is unavailable/)
empty.wake(); empty.deliver('initial')
await flush()
empty.deliver('empty', true); empty.paint()
await emptyRejection
assert.equal(empty.calls.releases, 1)

const closed = fixture()
closed.destroy()
await assert.rejects(captureBrowserTabPreview(closed.guest), /tab was closed/)
assert.equal(closed.calls.subscriptions, 0)

const lost = fixture()
const lostRequest = captureBrowserTabPreview(lost.guest)
const lostRejection = assert.rejects(lostRequest, /destroyed during capture/)
lost.destroy(); lost.fail(new Error('destroyed during capture'))
await lostRejection
assert.equal(lost.calls.releases, 0, 'cleanup must not call methods on destroyed contents')

const silent = fixture()
const silentRequest = captureBrowserTabPreview(silent.guest)
silent.wake()
silent.deliver('initial')
await flush()
silent.paint()
await assert.rejects(silentRequest, /screenshot timed out/)
assert.equal(silent.calls.releases, 1, 'no delivered frame is bounded and releases the subscription')

console.log('Browser thumbnails: paint-barrier fresh frames, static-page completion, deduplication, bounded size, wake completion, failure, retry, destruction and timeout cleanup passed.')
