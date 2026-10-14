import type { CameraView } from './scene3d-runtime'

type Options = {
    read: () => CameraView
    apply: (view: CameraView) => void
    reducedMotion: () => boolean
    now: () => number
    requestFrame: (callback: FrameRequestCallback) => number
    cancelFrame: (id: number) => void
}
const clone = (view: CameraView): CameraView => ({ ...view, target: [...view.target] })
const mix = (from: number, to: number, progress: number) => from + (to - from) * progress

/** Only schedules frames during user-requested movement; never an idle render loop. */
export function createCameraMotion(options: Options) {
    let frame: number | null = null
    let destination = clone(options.read())
    const cancel = () => {
        if (frame !== null) options.cancelFrame(frame)
        frame = null
        destination = clone(options.read())
    }
    const moveTo = (view: CameraView, duration = 260) => {
        cancel()
        const from = clone(options.read())
        destination = clone(view)
        if (options.reducedMotion()) {
            options.apply(clone(destination))
            return
        }
        const started = options.now()
        const to = clone(destination)
        const yawDelta = Math.atan2(Math.sin(to.yaw - from.yaw), Math.cos(to.yaw - from.yaw))
        const step = (time: number) => {
            const fraction = Math.min(1, Math.max(0, (time - started) / duration))
            const progress = 1 - Math.pow(1 - fraction, 3)
            options.apply(
                fraction === 1
                    ? clone(to)
                    : {
                          yaw: from.yaw + yawDelta * progress,
                          pitch: mix(from.pitch, to.pitch, progress),
                          distance: Math.exp(mix(Math.log(from.distance), Math.log(to.distance), progress)),
                          panX: mix(from.panX, to.panX, progress),
                          panY: mix(from.panY, to.panY, progress),
                          target: from.target.map((value, i) => mix(value, to.target[i]!, progress)) as [
                              number,
                              number,
                              number,
                          ],
                      },
            )
            frame = fraction < 1 ? options.requestFrame(step) : null
        }
        frame = options.requestFrame(step)
    }
    return {
        get target() {
            return clone(frame !== null ? destination : options.read())
        },
        cancel,
        moveTo,
        zoom(factor: number) {
            const base = frame !== null ? destination : options.read()
            moveTo({ ...base, distance: Math.max(0.05, Math.min(50000, base.distance * factor)) }, 220)
        },
    }
}
export type CameraMotion = ReturnType<typeof createCameraMotion>
