import type {
    DevScopeBrowserCaptureArtifact,
    DevScopeBrowserGuestTargetInput,
    DevScopeBrowserRecordingFrame
} from '@shared/contracts/devscope-api'

type ActiveRecording = {
    target: DevScopeBrowserGuestTargetInput
    canvas: HTMLCanvasElement
    context: CanvasRenderingContext2D
    recorder: MediaRecorder
    chunks: Blob[]
    mimeType: string
    startedAt: string
    unsubscribe: () => void
    stopping: Promise<DevScopeBrowserCaptureArtifact> | null
}

let active: ActiveRecording | null = null

function preferredMimeType(): string {
    const candidates = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm']
    return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) || 'video/webm'
}

function stopMediaRecorder(recorder: MediaRecorder): Promise<void> {
    if (recorder.state === 'inactive') return Promise.resolve()
    return new Promise((resolve, reject) => {
        recorder.addEventListener('stop', () => resolve(), { once: true })
        recorder.addEventListener('error', () => reject(new Error('The Browser video encoder stopped unexpectedly.')), { once: true })
        recorder.stop()
    })
}

function drawFrame(recording: ActiveRecording, frame: DevScopeBrowserRecordingFrame): void {
    if (active !== recording || frame.tabId !== recording.target.tabId) return
    const image = new Image()
    image.addEventListener('load', () => {
        if (active !== recording) return
        recording.context.drawImage(image, 0, 0, recording.canvas.width, recording.canvas.height)
    }, { once: true })
    image.src = `data:image/jpeg;base64,${frame.data}`
}

function clearRecording(recording: ActiveRecording): void {
    if (active !== recording) return
    recording.unsubscribe()
    active = null
}

export function readActiveAssistantBrowserRecordingTabId(): string | null {
    return active?.target.tabId || null
}

export async function startAssistantBrowserRecording(
    target: DevScopeBrowserGuestTargetInput,
    size: { width: number; height: number }
): Promise<string> {
    if (active) {
        if (active.target.tabId === target.tabId && active.target.guestWebContentsId === target.guestWebContentsId) {
            return active.startedAt
        }
        throw new Error('Another Browser tab is already recording.')
    }
    if (typeof MediaRecorder === 'undefined') throw new Error('Browser video recording is unavailable in this renderer.')
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.min(1600, Math.round(size.width)))
    canvas.height = Math.max(1, Math.min(1200, Math.round(size.height)))
    const context = canvas.getContext('2d', { alpha: false })
    if (!context) throw new Error('Could not create the Browser recording canvas.')
    const mimeType = preferredMimeType()
    const recorder = new MediaRecorder(canvas.captureStream(12), {
        mimeType,
        videoBitsPerSecond: 4_000_000
    })
    const chunks: Blob[] = []
    recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
    })
    const recording = {
        target,
        canvas,
        context,
        recorder,
        chunks,
        mimeType,
        startedAt: new Date().toISOString(),
        unsubscribe: () => {},
        stopping: null
    } satisfies ActiveRecording
    recording.unsubscribe = window.devscope.onBrowserPreviewRecordingFrame((frame) => drawFrame(recording, frame))
    active = recording
    try {
        recorder.start(1_000)
        const result = await window.devscope.startBrowserPreviewRecording(target)
        if (!result.success) throw new Error(result.error || 'Could not start Browser recording.')
        recording.startedAt = result.startedAt
        return result.startedAt
    } catch (error) {
        await stopMediaRecorder(recorder).catch(() => {})
        await window.devscope.stopBrowserPreviewRecording(target).catch(() => {})
        clearRecording(recording)
        throw error
    }
}

export function stopAssistantBrowserRecording(
    target: DevScopeBrowserGuestTargetInput
): Promise<DevScopeBrowserCaptureArtifact> {
    const recording = active
    if (!recording || recording.target.tabId !== target.tabId || recording.target.guestWebContentsId !== target.guestWebContentsId) {
        return Promise.reject(new Error('This Browser tab is not recording.'))
    }
    if (recording.stopping) return recording.stopping
    recording.stopping = (async () => {
        try {
            const stopped = await window.devscope.stopBrowserPreviewRecording(target)
            if (!stopped.success) throw new Error(stopped.error || 'Could not stop Browser recording.')
            await stopMediaRecorder(recording.recorder)
            const blob = new Blob(recording.chunks, { type: recording.mimeType })
            const result = await window.devscope.saveBrowserPreviewRecording({
                ...target,
                mimeType: recording.mimeType,
                data: new Uint8Array(await blob.arrayBuffer())
            })
            if (!result.success) throw new Error(result.error || 'Could not save Browser recording.')
            return result.artifact
        } finally {
            await stopMediaRecorder(recording.recorder).catch(() => {})
            clearRecording(recording)
        }
    })()
    return recording.stopping
}
