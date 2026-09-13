import type { Session, WebContents } from 'electron'

type RecordingController = {
    ownerWebContentsId: number
    ownerFrame: unknown
    guest: { id: number }
    tabId: string
}

export function resolveBrowserRecordingController<T extends RecordingController>(
    recording: T | null, ownerWebContentsId: number, ownerFrame: unknown,
    target: { guestWebContentsId: number; tabId: string }
): T {
    if (!recording || !ownerFrame || recording.ownerWebContentsId !== ownerWebContentsId || recording.ownerFrame !== ownerFrame
        || recording.guest.id !== target?.guestWebContentsId || recording.tabId !== target?.tabId) {
        throw new Error('That window does not own the active Browser recording.')
    }
    return recording
}

export type BrowserRecordingAudioSource = 'off' | 'tab' | 'system'

// A display request gets one short-lived grant for one owned tab. Installing a
// session handler must never turn an unrelated page's getDisplayMedia into capture.
export function createBrowserRecordingCaptureBroker(platform = process.platform, now = Date.now) {
    const installed = new WeakSet<Session>()
    const recordings = new Map<number, { owner: WebContents; guest: WebContents; frame: WebContents['mainFrame'] }>()
    const grants = new Map<number, { owner: WebContents; guest: WebContents; frame: WebContents['mainFrame']; audio: BrowserRecordingAudioSource; expiresAt: number }>()
    const hasGrant = (owner: WebContents | null) => {
        if (!owner) return false
        const grant = grants.get(owner.id)
        const valid = Boolean(grant && !owner.isDestroyed() && grant.owner === owner && grant.frame === owner.mainFrame && !grant.guest.isDestroyed() && grant.expiresAt > now())
        if (grant && !valid) grants.delete(owner.id)
        return valid
    }
    const arm = (owner: WebContents, guest: WebContents, audio: BrowserRecordingAudioSource) => {
        if (owner.isDestroyed() || guest.isDestroyed()) throw new Error('The Browser tab was closed.')
        if (hasGrant(owner)) throw new Error('Another Browser capture is starting. Try again in a moment.')
        if (audio === 'system' && platform !== 'win32') throw new Error('System audio recording is supported on Windows. Choose tab audio on this device.')
        if (!installed.has(owner.session)) {
            owner.session.setDisplayMediaRequestHandler((request, callback) => {
                const grant = [...grants.values()].find(item => hasGrant(item.owner) && request.frame === item.frame)
                if (!grant || !request.videoRequested || request.audioRequested !== (grant.audio !== 'off')) { callback({}); return }
                grants.delete(grant.owner.id)
                callback({
                    video: grant.guest.mainFrame,
                    ...(grant.audio === 'tab' ? { audio: grant.guest.mainFrame, enableLocalEcho: true } : grant.audio === 'system' ? { audio: 'loopback' } : {})
                })
            })
            installed.add(owner.session)
        }
        recordings.set(owner.id, { owner, guest, frame: owner.mainFrame })
        const grant = { owner, guest, frame: owner.mainFrame, audio, expiresAt: now() + 10_000 }
        grants.set(owner.id, grant)
        setTimeout(() => { if (grants.get(owner.id) === grant) grants.delete(owner.id) }, 10_000).unref?.()
    }
    return {
        hasGrant,
        hasRecording(owner: WebContents | null) {
            if (!owner || owner.isDestroyed()) return false
            const recording = recordings.get(owner.id)
            return Boolean(recording && recording.owner === owner && recording.frame === owner.mainFrame && !recording.guest.isDestroyed())
        },
        cancel(ownerId: number) {
            grants.delete(ownerId)
            recordings.delete(ownerId)
        },
        arm
    }
}

export const browserRecordingCapture = createBrowserRecordingCaptureBroker()
