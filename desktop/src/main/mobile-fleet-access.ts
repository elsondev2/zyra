import { ChildTranscriptStore } from '../../../src/agents/runtime/transcript-store.mjs'
import type { FleetSnapshot } from '../shared/assistant/contracts/fleet'

type FleetService = {
    getSnapshot(): Promise<{ sessions: Array<{ threads: Array<{ id: string; providerThreadId?: string | null }> }> }>
    getFleetSnapshot(threadId: string): Promise<{ snapshot: FleetSnapshot | null }>
}

/** Use the same persisted snapshot that powers Desktop, scoped to the canonical chat. */
export class MobileFleetAccess {
    constructor(private readonly service: () => FleetService) {}
    async read(canonicalChatId: string, type: string, payload: Record<string, unknown>, live?: any): Promise<any> {
        const state = await this.service().getSnapshot()
        const thread = state.sessions.flatMap(session => session.threads).find(item => item.providerThreadId === canonicalChatId)
        if (!thread) return live
        const { snapshot } = await this.service().getFleetSnapshot(thread.id)
        if (!snapshot) return live
        const agents = type.startsWith('agents.')
        const runs = agents ? snapshot.agents : snapshot.workflows
        if (type.endsWith('.list') || type.endsWith('.listRuns')) {
            const id = agents ? 'agentRunId' : 'workflowRunId'
            const merged = new Map(Object.values(runs).map(run => [(run as any)[id], run]))
            for (const run of live?.runs || []) merged.set(run[id], run)
            return { ...live, runs: [...merged.values()] }
        }
        const run = runs[String(payload[agents ? 'agentRunId' : 'workflowRunId'] || '')]
        if (!run) return live
        if (type.endsWith('.status')) return live || run
        if (type === 'agents.transcript' && 'sessionFile' in run && run.sessionFile) {
            // File comes exclusively from this chat's persisted run, never a phone path.
            return live || new ChildTranscriptStore().page(run.sessionFile, {
                limit: Math.min(50, Math.max(1, Number(payload.limit) || 40)),
                before: Number.isSafeInteger(payload.before) ? Number(payload.before) : undefined
            })
        }
        return live
    }
}
