type MobileVoiceLease = { owner: number; adapterSessionId: string; sessionId: string; threadId: string; deviceName?: string }

/** Ephemeral, adapter-owned presence. An attached phone alone is never a live call. */
export class MobileVoicePresence {
    private active: MobileVoiceLease | null = null
    constructor(private readonly publish: (sessionId: string, threadId: string, deviceName: string | null) => void) {}
    activate(lease: MobileVoiceLease, current: { owner: number | null; adapterSessionId?: string } | null, signal: AbortSignal): boolean {
        if (signal.aborted || current?.owner !== lease.owner || current.adapterSessionId !== lease.adapterSessionId) return false
        if (this.active) this.clearAdapter(this.active.adapterSessionId)
        this.active = lease
        const name = String(lease.deviceName || '').replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '').trim().slice(0, 96) || 'Android phone'
        this.publish(lease.sessionId, lease.threadId, name)
        return true
    }
    clearAdapter(adapterSessionId: string): void {
        if (this.active?.adapterSessionId !== adapterSessionId) return
        const active = this.active
        this.active = null
        this.publish(active.sessionId, active.threadId, null)
    }
    clearOwner(owner: number): void {
        if (this.active?.owner === owner) this.clearAdapter(this.active.adapterSessionId)
    }
}

export function clearRestoredMobileVoice(snapshot: { sessions: Array<{ threads: Array<{ mobileVoice?: { deviceName: string } | null }> }> }): void {
    for (const session of snapshot.sessions) for (const thread of session.threads) thread.mobileVoice = null
}
