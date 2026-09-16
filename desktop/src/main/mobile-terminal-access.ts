import { createHash, randomUUID } from 'node:crypto'
import { isAbsolute, relative, sep } from 'node:path'
import { bindRemotePreviewTerminal, listRemotePreviewTerminals } from './ipc/handlers/preview-terminal-handlers'
import type { AssistantService } from './assistant/service'
type Root = { id: string; path: string; readOnly: boolean }
const inside = (root: string, target: string) => { const value = relative(root, target); return value === '' || (value !== '..' && !value.startsWith('..' + sep) && !isAbsolute(value)) }
const identity = (runtimeId: string, sessionId: string) => createHash('sha256').update(runtimeId + ':' + sessionId).digest('hex')
export class MobileTerminalAccess {
    readonly supportsSplit = true
    private bindings = new Map<string, ReturnType<typeof bindRemotePreviewTerminal>>()
    private attached = new Map<string, { runtimeId: string; subscriptionId: string }>()
    private generation = 0
    private pending: Promise<unknown> = Promise.resolve()
    constructor(private readonly service: () => AssistantService, private readonly receive: (event: Record<string, unknown>) => void) {}
    private bind(runtimeId: string) {
        const current = this.bindings.get(runtimeId)
        if (current) return current
        const binding = bindRemotePreviewTerminal(runtimeId, event => {
            const terminalId = identity(runtimeId, event.sessionId)
            if (this.attached.has(terminalId)) this.receive({ terminalId, event })
        })
        this.bindings.set(runtimeId, binding)
        return binding
    }
    private prune() {
        for (const [runtimeId, binding] of this.bindings) {
            if ([...this.attached.values()].some(value => value.runtimeId === runtimeId)) continue
            binding.close(); this.bindings.delete(runtimeId)
        }
    }
    async dispatch(method: string, params: Record<string, unknown>, chat: { canonicalChatId: string }, roots: Root[]) {
        const generation = this.generation
        const result = this.pending.then(() => {
            if (generation !== this.generation) throw new Error('Terminal connection was released.')
            return this.dispatchNow(method, params, chat, roots, generation)
        })
        this.pending = result.catch(() => undefined)
        return result
    }
    private async dispatchNow(method: string, params: Record<string, unknown>, chat: { canonicalChatId: string }, roots: Root[], generation: number) {
        if (method === 'terminal.detach') {
            if (typeof params.terminalId === 'string') {
                const current = this.attached.get(params.terminalId)
                if (current && (!params.subscriptionId || current.subscriptionId === params.subscriptionId)) this.attached.delete(params.terminalId)
                this.prune()
            } else this.clear()
            return { detached: true }
        }
        const owner = await this.service().getMobileTerminalIdentity(chat.canonicalChatId)
        if (generation !== this.generation) throw new Error('Terminal connection was released.')
        const allowed = (runtime: string, cwd: string) => (runtime === owner.runtimeId || runtime.startsWith('utility:' + chat.canonicalChatId + ':terminal:')) && roots.some(root => inside(root.path, cwd))
        const terminals = listRemotePreviewTerminals(allowed)
        if (method === 'terminal.list') return { terminals: terminals.map(({ runtimeId, recentOutput: _output, ...terminal }) => ({ ...terminal, id: identity(runtimeId, terminal.sessionId) })) }
        if (method === 'terminal.create') {
            if (this.attached.size >= 2) throw new Error('Return to the terminal list before opening another shell.')
            const root = roots.find(root => root.id === params.rootId) || roots.find(root => !root.readOnly)
            if (!root || root.readOnly) throw new Error('Choose a writable shared folder for this terminal.')
            const sessionId = randomUUID(), binding = this.bind(owner.runtimeId)
            let result: Awaited<ReturnType<typeof binding.invoke>>
            try { result = await binding.invoke('create', { sessionId, targetPath: root.path, cols: 100, rows: 28 }) }
            finally { this.prune() }
            if (!result.success) throw new Error('error' in result ? String(result.error) : 'Terminal could not start.')
            return { terminalId: identity(owner.runtimeId, sessionId) }
        }
        const terminal = terminals.find(item => identity(item.runtimeId, item.sessionId) === params.terminalId)
        if (!terminal) throw new Error('This terminal is unavailable in the shared chat folders.')
        if (method === 'terminal.attach') {
            if (params.keepExisting !== true) { this.attached.clear(); this.prune() }
            if (!this.attached.has(String(params.terminalId)) && this.attached.size >= 2) throw new Error('You can view two terminals at once.')
            const subscriptionId = typeof params.subscriptionId === 'string' ? params.subscriptionId.slice(0, 128) : ''
            this.attached.set(String(params.terminalId), { runtimeId: terminal.runtimeId, subscriptionId })
            const binding = this.bind(terminal.runtimeId)
            try { return { terminalId: params.terminalId, ...await binding.invoke('snapshot', { sessionId: terminal.sessionId }) } }
            catch (error) {
                if (this.attached.get(String(params.terminalId))?.subscriptionId === subscriptionId) this.attached.delete(String(params.terminalId))
                this.prune(); throw error
            }
        }
        if (!roots.some(root => !root.readOnly && inside(root.path, terminal.cwd))) throw new Error('This terminal is in a read-only folder.')
        const binding = this.bind(terminal.runtimeId), input = { sessionId: terminal.sessionId }
        try {
        if (method === 'terminal.input') {
            if (typeof params.data !== 'string' || Buffer.byteLength(params.data) > 8192) throw new Error('Terminal input is too large.')
            return await binding.invoke('write', { ...input, data: params.data })
        }
        if (method === 'terminal.resize') {
            const cols = Number(params.cols), rows = Number(params.rows)
            if (!Number.isInteger(cols) || !Number.isInteger(rows) || cols < 10 || cols > 240 || rows < 4 || rows > 100) throw new Error('Invalid terminal dimensions.')
            return await binding.invoke('resize', { ...input, cols, rows })
        }
        if (method === 'terminal.close') return await binding.invoke('close', input)
        if (method === 'terminal.clear') return await binding.invoke('clear', input)
        throw new Error('Unknown terminal action.')
        } finally { this.prune() }
    }
    private clear() { for (const binding of this.bindings.values()) binding.close(); this.bindings.clear(); this.attached.clear() }
    close() { this.generation++; this.clear() }
}
