import assert from 'node:assert/strict'
import { createCameraMotion } from '../src/renderer/src/components/ui/scene3d/scene3d-camera-motion'
import type { CameraView } from '../src/renderer/src/components/ui/scene3d/scene3d-runtime'

let time = 0,
    nextId = 0,
    draws = 0,
    reduced = false
const queued = new Map<number, FrameRequestCallback>()
let view: CameraView = {
    yaw: Math.PI * 2 - 0.1,
    pitch: 0.4,
    distance: 10,
    panX: 2,
    panY: 1,
    target: [0, 0, 0],
}
const motion = createCameraMotion({
    read: () => view,
    apply: (value) => {
        view = value
        draws++
    },
    now: () => time,
    reducedMotion: () => reduced,
    requestFrame: (callback) => {
        const id = ++nextId
        queued.set(id, callback)
        return id
    },
    cancelFrame: (id) => {
        queued.delete(id)
    },
})
const tick = (milliseconds: number) => {
    time += milliseconds
    const callbacks = [...queued.values()]
    queued.clear()
    callbacks.forEach((callback) => callback(time))
}
motion.zoom(0.5)
assert.equal(view.distance, 10, 'zoom does not jump immediately to its endpoint')
tick(100)
assert.ok(view.distance < 10 && view.distance > 5, 'zoom paints an intermediate camera position')
motion.zoom(0.5)
assert.equal(motion.target.distance, 2.5, 'repeated inputs accumulate against the intended destination')
tick(300)
assert.equal(view.distance, 2.5)
assert.equal(queued.size, 0, 'the draw loop stops after settling')
motion.moveTo({ ...view, yaw: 0.1, panX: 0, target: [1, 2, 3] })
tick(100)
assert.ok(view.yaw > Math.PI * 2 - 0.1, 'reset takes the shortest orbit path')
assert.ok(view.target[0] > 0 && view.target[0] < 1)
motion.cancel()
const interrupted = draws
tick(300)
assert.equal(draws, interrupted, 'direct drag or disposal cancels pending motion')
reduced = true
motion.moveTo({ ...view, distance: 12 })
assert.equal(view.distance, 12)
assert.equal(queued.size, 0, 'reduced motion applies without animation')
console.log(
    'Scene camera motion: intermediate frames, accumulated zoom, shortest reset, cancellation, finite lifetime and reduced motion passed',
)
