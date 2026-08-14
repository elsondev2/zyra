import { useSyncExternalStore } from 'react'

export type RendererVisibilitySnapshot = Readonly<{
    visible: boolean
    revision: number
    resumeRevision: number
    resumedAt: number | null
}>

export type RendererVisibilitySource = {
    readonly visibilityState: DocumentVisibilityState
    addEventListener(type: 'visibilitychange', listener: EventListener): void
    removeEventListener(type: 'visibilitychange', listener: EventListener): void
}

export const RENDERER_VISIBILITY_RESUME_GRACE_MS = 240

const SERVER_VISIBILITY_SNAPSHOT: RendererVisibilitySnapshot = Object.freeze({
    visible: true,
    revision: 0,
    resumeRevision: 0,
    resumedAt: null
})

function readSourceVisibility(source: RendererVisibilitySource | null): boolean {
    return source?.visibilityState !== 'hidden'
}

export function shouldSnapRendererPresentation(
    snapshot: RendererVisibilitySnapshot,
    handledResumeRevision: number,
    now = Date.now()
): boolean {
    if (!snapshot.visible || snapshot.resumeRevision !== handledResumeRevision) return true
    if (snapshot.resumedAt === null) return false
    return Math.max(0, now - snapshot.resumedAt) <= RENDERER_VISIBILITY_RESUME_GRACE_MS
}

export class RendererVisibilityStore {
    private snapshot: RendererVisibilitySnapshot
    private readonly listeners = new Set<() => void>()
    private listening = false

    constructor(private readonly source: RendererVisibilitySource | null) {
        this.snapshot = Object.freeze({
            visible: readSourceVisibility(source),
            revision: 0,
            resumeRevision: 0,
            resumedAt: null
        })
    }

    getSnapshot = (): RendererVisibilitySnapshot => this.snapshot

    getServerSnapshot = (): RendererVisibilitySnapshot => SERVER_VISIBILITY_SNAPSHOT

    subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener)
        if (!this.listening && this.source) {
            this.source.addEventListener('visibilitychange', this.handleVisibilityChange)
            this.listening = true
            this.syncFromSource()
        }

        return () => {
            this.listeners.delete(listener)
            if (this.listeners.size === 0 && this.listening && this.source) {
                this.source.removeEventListener('visibilitychange', this.handleVisibilityChange)
                this.listening = false
            }
        }
    }

    private readonly handleVisibilityChange: EventListener = () => {
        this.syncFromSource()
    }

    private syncFromSource(): void {
        const visible = readSourceVisibility(this.source)
        if (visible === this.snapshot.visible) return

        this.snapshot = Object.freeze({
            visible,
            revision: this.snapshot.revision + 1,
            resumeRevision: this.snapshot.resumeRevision + (visible ? 1 : 0),
            resumedAt: visible ? Date.now() : null
        })
        for (const listener of this.listeners) listener()
    }
}

export const rendererVisibility = new RendererVisibilityStore(
    typeof document === 'undefined' ? null : document
)

export function useRendererVisibilitySnapshot(): RendererVisibilitySnapshot {
    return useSyncExternalStore(
        rendererVisibility.subscribe,
        rendererVisibility.getSnapshot,
        rendererVisibility.getServerSnapshot
    )
}
