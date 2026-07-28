import { randomUUID } from 'crypto'
import type { WebContents } from 'electron'
import { AgentControlError } from './control-errors'

export function isTrustedBrowserTabId(tabId: string): boolean {
    return /^browser:[a-zA-Z0-9][a-zA-Z0-9:._-]{0,127}$/.test(tabId)
}

export type TrustedBrowserGuest = {
    guestIdentity: string
    ownerWebContentsId: number
    guest: WebContents
    tabId: string | null
    ownerThreadId: string | null
    registeredAt: string
}

class TrustedGuestRegistry {
    private readonly byGuestId = new Map<number, TrustedBrowserGuest>()
    private readonly removedListeners = new Set<(entry: TrustedBrowserGuest) => void>()

    register(ownerWebContentsId: number, guest: WebContents): TrustedBrowserGuest {
        const existing = this.byGuestId.get(guest.id)
        if (existing) return existing
        const entry: TrustedBrowserGuest = {
            guestIdentity: `browser-guest:${randomUUID()}`,
            ownerWebContentsId,
            guest,
            tabId: null,
            ownerThreadId: null,
            registeredAt: new Date().toISOString()
        }
        this.byGuestId.set(guest.id, entry)
        guest.once('destroyed', () => {
            this.byGuestId.delete(guest.id)
            for (const listener of this.removedListeners) listener(entry)
        })
        return entry
    }

    bind(ownerWebContentsId: number, guestWebContentsId: number, tabId: string, ownerThreadId: string): TrustedBrowserGuest {
        const entry = this.byGuestId.get(guestWebContentsId)
        if (!entry || entry.guest.isDestroyed()) throw new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The Browser guest is not registered in main.')
        if (entry.ownerWebContentsId !== ownerWebContentsId) throw new AgentControlError('CONTROL_SCOPE_DENIED', 'The Browser guest belongs to another window.')
        if (!isTrustedBrowserTabId(tabId)) throw new AgentControlError('CONTROL_VALIDATION_ERROR', 'Browser tab identity is invalid.')
        if (!/^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,191}$/.test(ownerThreadId)) throw new AgentControlError('CONTROL_VALIDATION_ERROR', 'Browser owner thread identity is invalid.')
        if (entry.ownerThreadId && entry.ownerThreadId !== ownerThreadId) throw new AgentControlError('CONTROL_SCOPE_DENIED', 'The Browser guest is already bound to another thread.')
        entry.tabId = tabId
        entry.ownerThreadId = ownerThreadId
        return entry
    }

    findByIdentity(guestIdentity: string): TrustedBrowserGuest | undefined {
        return [...this.byGuestId.values()].find((entry) => entry.guestIdentity === guestIdentity)
    }

    onRemoved(listener: (entry: TrustedBrowserGuest) => void): () => void {
        this.removedListeners.add(listener)
        return () => this.removedListeners.delete(listener)
    }
}

export const trustedBrowserGuests = new TrustedGuestRegistry()
