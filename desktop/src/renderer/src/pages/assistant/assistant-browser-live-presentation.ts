type LivePresentationOptions = {
    video: HTMLVideoElement
    acquire: (isCurrent: () => boolean) => Promise<MediaStream>
    release: () => void
    onReady: (ready: boolean) => void
    timeoutMs?: number
}

/** A temporary compositor feed for DOM overlays above a native browser page.
 * No encoding, pixel copies, audio, polling, or persisted media. */
export function createAssistantBrowserLivePresentation({ video, acquire, release, onReady, timeoutMs = 8_000 }: LivePresentationOptions) {
    let generation = 0
    let stream: MediaStream | null = null
    let pending: Promise<boolean> | null = null
    let settle: ((ready: boolean) => void) | null = null
    let ready = false
    let started = false
    let deadline: ReturnType<typeof setTimeout> | null = null
    let frame: number | null = null
    let loaded: (() => void) | null = null
    const finish = (value: boolean) => {
        if (deadline) clearTimeout(deadline)
        deadline = null
        const resolve = settle
        settle = null; pending = null
        resolve?.(value)
    }
    const stop = () => {
        if (!started) return
        started = false
        generation++
        if (frame !== null) video.cancelVideoFrameCallback?.(frame)
        frame = null
        if (loaded) video.removeEventListener('loadeddata', loaded)
        loaded = null
        stream?.getTracks().forEach(track => track.stop())
        stream = null
        video.pause(); video.srcObject = null
        ready = false; onReady(false)
        finish(false)
        release()
    }
    const start = (): Promise<boolean> => {
        if (ready) return Promise.resolve(true)
        if (pending) return pending
        started = true
        const current = ++generation
        const isCurrent = () => generation === current
        const promise = new Promise<boolean>(resolve => { settle = resolve })
        pending = promise
        deadline = setTimeout(() => { if (isCurrent()) stop() }, timeoutMs)
        void (async () => {
            const acquired = await acquire(isCurrent)
            if (!isCurrent()) { acquired.getTracks().forEach(track => track.stop()); return }
            stream = acquired
            for (const track of acquired.getTracks()) track.addEventListener('ended', () => { if (isCurrent()) stop() }, { once: true })
            if (!acquired.getVideoTracks().some(track => track.readyState === 'live')) { stop(); return }
            video.muted = true; video.playsInline = true; video.srcObject = acquired
            await video.play()
            if (!isCurrent()) return
            const decoded = () => {
                frame = null
                if (!isCurrent()) return
                ready = true; onReady(true); finish(true)
            }
            if (video.requestVideoFrameCallback) frame = video.requestVideoFrameCallback(decoded)
            else if (video.readyState >= 2) decoded()
            else { loaded = decoded; video.addEventListener('loadeddata', decoded, { once: true }) }
        })().catch(() => { if (isCurrent()) stop() })
        return promise
    }
    return { start, stop }
}
