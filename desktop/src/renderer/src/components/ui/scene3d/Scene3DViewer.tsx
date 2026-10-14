import { useCallback, useEffect, useRef, useState } from 'react'
import { RotateCcw, ZoomIn, ZoomOut } from 'lucide-react'
import type { Scene3DObject, validateScene3D } from '@shared/visualization-resources'
import type { CameraView, Viewer } from './scene3d-runtime'
import { createCameraMotion, type CameraMotion } from './scene3d-camera-motion'
import { ArtifactCreationState } from '../ArtifactCreationState'

export type Scene3DViewerProps = { source: string; expanded?: boolean }
type SceneNode = Scene3DObject

/** Demand-loads the renderer and OGL only when a 3D scene is mounted. */
export function Scene3DViewer({ source, expanded = false }: Scene3DViewerProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const viewerRef = useRef<Viewer | null>(null)
    const motionRef = useRef<CameraMotion | null>(null)
    const cameraState = useRef<CameraView>({
        yaw: Math.PI / 4,
        pitch: 0.4,
        distance: Math.hypot(4, 3, 6),
        panX: 0,
        panY: 0,
        target: [0, 0, 0],
    })
    const initialCamera = useRef(cameraState.current)
    const [selected, setSelected] = useState<SceneNode | null>(null)
    const [error, setError] = useState('')
    const [contextLost, setContextLost] = useState(false)
    const [ready, setReady] = useState(false)
    const sourceRef = useRef(source)
    const cameraInitialized = useRef(false)
    sourceRef.current = source

    const reset = useCallback(() => {
        motionRef.current?.moveTo(initialCamera.current, 320)
    }, [])
    const adjustZoom = useCallback((factor: number) => {
        motionRef.current?.zoom(factor)
    }, [])

    useEffect(() => {
        let disposed = false
        let observer: ResizeObserver | undefined
        let resizeHandler: (() => void) | undefined
        let drag: { x: number; y: number; button: number } | null = null
        let pointerCleanup: (() => void) | undefined
        let activeViewer: Viewer | null = null
        const canvas = canvasRef.current
        if (!canvas) return
        setError('')
        setContextLost(false)
        setReady(false)
        setSelected(null)
        void (async () => {
            try {
                const [validator, runtime] = await Promise.all([
                    import('@shared/visualization-resources'),
                    import('./scene3d-runtime'),
                ])
                if (disposed) return
                const scene = (validator.validateScene3D as typeof validateScene3D)(sourceRef.current)
                if (!scene || !Array.isArray(scene.objects)) throw new Error('This scene file is invalid.')
                const viewer = runtime.createSceneViewer(canvas, scene, () => {
                    if (!disposed) setContextLost(true)
                })
                activeViewer = viewer
                viewerRef.current = viewer
                const applyCamera = () => {
                    const rect = canvas.getBoundingClientRect()
                    if (!rect.width || !rect.height) return
                    viewer.resize()
                    viewer.draw()
                }
                resizeHandler = applyCamera
                observer = new ResizeObserver(applyCamera)
                observer.observe(canvas.parentElement || canvas)
                window.addEventListener('resize', applyCamera)
                const pointerDown = (event: PointerEvent) => {
                    if (event.button !== 0 && event.button !== 2) return
                    event.preventDefault()
                    moved = false
                    motionRef.current?.cancel()
                    drag = { x: event.clientX, y: event.clientY, button: event.button }
                    canvas.focus({ preventScroll: true })
                    if (event.isTrusted) canvas.setPointerCapture(event.pointerId)
                }
                const pointerMove = (event: PointerEvent) => {
                    if (!drag) return
                    const dx = event.clientX - drag.x,
                        dy = event.clientY - drag.y
                    drag.x = event.clientX
                    drag.y = event.clientY
                    if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
                    const state = cameraState.current
                    if (drag.button === 2 || event.shiftKey) {
                        state.panX -= dx * 0.006 * state.distance
                        state.panY += dy * 0.006 * state.distance
                    } else {
                        state.yaw -= dx * 0.008
                        state.pitch = Math.max(-1.5, Math.min(1.5, state.pitch + dy * 0.008))
                    }
                    viewer.setView(state)
                    viewer.draw()
                }
                const pointerUp = () => {
                    drag = null
                }
                const contextMenu = (event: MouseEvent) => event.preventDefault()
                const wheel = (event: WheelEvent) => {
                    event.preventDefault()
                    const pixels =
                        event.deltaY *
                        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? canvas.clientHeight : 1)
                    adjustZoom(Math.exp(Math.max(-200, Math.min(200, pixels)) * 0.0015))
                }
                const keydown = (event: KeyboardEvent) => {
                    if (event.key === 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return
                    if (
                        event.key === '+' ||
                        event.key === '=' ||
                        event.key === '-' ||
                        event.key.toLowerCase() === 'r'
                    ) {
                        event.preventDefault()
                        if (event.key.toLowerCase() === 'r') reset()
                        else adjustZoom(event.key === '-' ? 1.1 : 0.9)
                        return
                    }
                    if (!event.key.startsWith('Arrow')) return
                    const state = motionRef.current?.target || { ...cameraState.current }
                    if (event.key === 'ArrowLeft')
                        event.shiftKey ? (state.panX -= 0.2 * state.distance) : (state.yaw += 0.08)
                    else if (event.key === 'ArrowRight')
                        event.shiftKey ? (state.panX += 0.2 * state.distance) : (state.yaw -= 0.08)
                    else if (event.key === 'ArrowUp')
                        event.shiftKey
                            ? (state.panY += 0.2 * state.distance)
                            : (state.pitch = Math.min(1.5, state.pitch + 0.08))
                    else if (event.key === 'ArrowDown')
                        event.shiftKey
                            ? (state.panY -= 0.2 * state.distance)
                            : (state.pitch = Math.max(-1.5, state.pitch - 0.08))
                    else return
                    event.preventDefault()
                    motionRef.current?.moveTo(state, 180)
                }
                let moved = false
                const click = (event: MouseEvent) => {
                    if (moved) {
                        moved = false
                        return
                    }
                    const hit = viewer.select(event.clientX, event.clientY)
                    setSelected(hit ?? null)
                }
                canvas.addEventListener('pointerdown', pointerDown)
                canvas.addEventListener('pointermove', pointerMove)
                canvas.addEventListener('pointerup', pointerUp)
                canvas.addEventListener('pointercancel', pointerUp)
                canvas.addEventListener('contextmenu', contextMenu)
                canvas.addEventListener('wheel', wheel, { passive: false })
                canvas.addEventListener('click', click)
                canvas.addEventListener('keydown', keydown)
                pointerCleanup = () => {
                    canvas.removeEventListener('pointerdown', pointerDown)
                    canvas.removeEventListener('pointermove', pointerMove)
                    canvas.removeEventListener('pointerup', pointerUp)
                    canvas.removeEventListener('pointercancel', pointerUp)
                    canvas.removeEventListener('contextmenu', contextMenu)
                    canvas.removeEventListener('wheel', wheel)
                    canvas.removeEventListener('click', click)
                    canvas.removeEventListener('keydown', keydown)
                }
                const [x, y, z] = scene.camera?.position ?? [4, 3, 6]
                const target = scene.camera?.target ?? [0, 0, 0]
                const [tx, ty, tz] = target
                const distance = Math.hypot(x - tx, y - ty, z - tz) || 8
                initialCamera.current = {
                    yaw: Math.atan2(x - tx, z - tz),
                    pitch: Math.asin((y - ty) / distance),
                    distance,
                    panX: 0,
                    panY: 0,
                    target,
                }
                if (!cameraInitialized.current) {
                    cameraState.current = { ...initialCamera.current }
                    cameraInitialized.current = true
                }
                viewer.setView(cameraState.current)
                viewer.draw()
                motionRef.current = createCameraMotion({
                    read: () => cameraState.current,
                    apply: (state) => {
                        cameraState.current = state
                        viewer.setView(state)
                        viewer.draw()
                    },
                    reducedMotion: () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
                    now: () => performance.now(),
                    requestFrame: (callback) => window.requestAnimationFrame(callback),
                    cancelFrame: (id) => window.cancelAnimationFrame(id),
                })
                setReady(true)
            } catch (cause) {
                if (!disposed)
                    setError(cause instanceof Error ? cause.message : 'Unable to render this scene.')
            }
        })()
        return () => {
            disposed = true
            observer?.disconnect()
            if (resizeHandler) window.removeEventListener('resize', resizeHandler)
            pointerCleanup?.()
            motionRef.current?.cancel()
            motionRef.current = null
            viewerRef.current = null
            activeViewer?.dispose()
        }
    }, [source, adjustZoom, reset])

    const toolbarButton = (label: string, action: () => void, icon: React.ReactNode) => (
        <button
            type="button"
            aria-label={label}
            title={label}
            onClick={action}
            disabled={!ready || Boolean(error) || contextLost}
            style={{
                display: 'grid',
                placeItems: 'center',
                width: 30,
                height: 30,
                border: '1px solid var(--surface-divider, #343b46)',
                borderRadius: 6,
                color: 'var(--color-text, #eef1f6)',
                background: 'var(--color-card, #181c22)',
                cursor: 'pointer',
            }}
        >
            {icon}
        </button>
    )
    return (
        <section
            aria-label="3D scene viewer"
            style={{
                position: 'relative',
                width: '100%',
                height: expanded ? '100%' : 320,
                minHeight: 260,
                overflow: 'hidden',
                background: 'var(--color-bg, #101318)',
            }}
        >
            <canvas
                key={source}
                ref={canvasRef}
                tabIndex={0}
                aria-label="Interactive 3D scene. Drag to orbit, right-drag or shift-drag to pan, scroll to zoom. Use arrow keys to orbit, Shift+arrow keys to pan, + or - to zoom, and R to reset."
                className="focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent-primary)]"
                style={{
                    display: 'block',
                    width: '100%',
                    height: '100%',
                    touchAction: 'none',
                    opacity: ready ? 1 : 0,
                    transition:
                        typeof window !== 'undefined' &&
                        window.matchMedia('(prefers-reduced-motion: reduce)').matches
                            ? 'none'
                            : 'opacity 220ms ease-out',
                }}
            />
            {!ready && !error && !contextLost && (
                <div className="absolute inset-0">
                    <ArtifactCreationState
                        kind="visualization"
                        phase="loading"
                        className="h-full !min-h-0 !rounded-none !border-0"
                    />
                </div>
            )}
            <div
                role="toolbar"
                aria-label="3D scene controls"
                style={{ position: 'absolute', top: 10, right: 10, display: 'flex', gap: 5 }}
            >
                {toolbarButton('Zoom in', () => adjustZoom(0.8), <ZoomIn size={15} />)}
                {toolbarButton('Zoom out', () => adjustZoom(1.25), <ZoomOut size={15} />)}
                {toolbarButton('Reset camera', () => reset(), <RotateCcw size={15} />)}
            </div>
            <div
                aria-live="polite"
                style={{
                    position: 'absolute',
                    left: 10,
                    bottom: 8,
                    color: 'var(--color-text-muted, #a8b0bd)',
                    fontSize: 12,
                    pointerEvents: 'none',
                }}
            >
                {error
                    ? `Scene error: ${error}`
                    : contextLost
                      ? '3D graphics context was lost. Reopen this preview to try again.'
                      : selected
                        ? selected.name || selected.id
                        : ready
                          ? 'Drag to orbit · Shift/right-drag to pan · Scroll to zoom'
                          : ''}
            </div>
        </section>
    )
}
