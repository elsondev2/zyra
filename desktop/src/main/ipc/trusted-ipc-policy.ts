export type TrustedIpcSender = {
    id: number
    mainFrame: unknown
    isDestroyed(): boolean
}

export type TrustedIpcEvent = {
    sender: TrustedIpcSender
    senderFrame: { url: string } | null
}

type TrustedSenderRegistration = {
    sender: TrustedIpcSender
    allowsUrl: (url: string) => boolean
}

export type TrustedIpcDecision =
    | { trusted: true }
    | { trusted: false; reason: 'unregistered-sender' | 'destroyed-sender' | 'non-main-frame' | 'untrusted-location' }

/**
 * IPC authority is granted to an exact WebContents instance, its main frame,
 * and a trusted local renderer location. A WebContents id or URL alone is not
 * enough because either can outlive the authority they originally represented.
 */
export class TrustedIpcSenderPolicy {
    private readonly registrations = new Map<number, TrustedSenderRegistration>()

    register(sender: TrustedIpcSender, allowsUrl: (url: string) => boolean): void {
        this.registrations.set(sender.id, { sender, allowsUrl })
    }

    unregister(sender: TrustedIpcSender): void {
        const registration = this.registrations.get(sender.id)
        if (registration?.sender === sender) this.registrations.delete(sender.id)
    }

    decide(event: TrustedIpcEvent): TrustedIpcDecision {
        const registration = this.registrations.get(event.sender.id)
        if (!registration || registration.sender !== event.sender) {
            return { trusted: false, reason: 'unregistered-sender' }
        }
        if (event.sender.isDestroyed()) return { trusted: false, reason: 'destroyed-sender' }
        if (!event.senderFrame || event.senderFrame !== event.sender.mainFrame) {
            return { trusted: false, reason: 'non-main-frame' }
        }
        if (!registration.allowsUrl(event.senderFrame.url)) {
            return { trusted: false, reason: 'untrusted-location' }
        }
        return { trusted: true }
    }
}
