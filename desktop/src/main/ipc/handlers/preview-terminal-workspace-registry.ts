import { randomUUID } from 'node:crypto'

export type PreviewTerminalWorkspaceBinding<Receiver> = {
    capability: string
    runtimeId: string
    senderId: number
    receiver: Receiver
}

export type PreviewTerminalSessionScope = {
    key: string
    runtimeId: string | null
    scoped: boolean
}

export class PreviewTerminalWorkspaceRegistry<Receiver> {
    private readonly bindings = new Map<string, PreviewTerminalWorkspaceBinding<Receiver>>()

    register(senderId: number, runtimeId: string, receiver: Receiver): PreviewTerminalWorkspaceBinding<Receiver> {
        const capability = `terminal-capability:${randomUUID()}`
        const binding = { capability, runtimeId, senderId, receiver }
        this.bindings.set(capability, binding)
        return binding
    }

    release(senderId: number, capability: string): boolean {
        const binding = this.bindings.get(capability)
        if (!binding || binding.senderId !== senderId) return false
        return this.bindings.delete(capability)
    }

    releaseSender(senderId: number): void {
        for (const [capability, binding] of this.bindings) {
            if (binding.senderId === senderId) this.bindings.delete(capability)
        }
    }

    resolve(senderId: number, capability?: string): PreviewTerminalSessionScope {
        const normalizedCapability = String(capability || '').trim()
        if (!normalizedCapability) {
            return { key: `renderer:${senderId}`, runtimeId: null, scoped: false }
        }
        const binding = this.bindings.get(normalizedCapability)
        if (!binding || binding.senderId !== senderId) {
            throw new Error('Preview terminal workspace capability is unavailable.')
        }
        return { key: `workspace:${binding.runtimeId}`, runtimeId: binding.runtimeId, scoped: true }
    }

    bindingsForRuntime(runtimeId: string): PreviewTerminalWorkspaceBinding<Receiver>[] {
        return [...this.bindings.values()].filter((binding) => binding.runtimeId === runtimeId)
    }
}

export function previewTerminalEventChannel(capability?: string): string {
    const normalizedCapability = String(capability || '').trim()
    return normalizedCapability
        ? `devscope:previewTerminal:event:${normalizedCapability}`
        : 'devscope:previewTerminal:event'
}
