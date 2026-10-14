import type { ComposerContextFile } from './assistant-composer-types'

export type CodeSelectionSnapshot = {
    filePath: string
    workspaceRoot?: string
    startLine: number
    endLine: number
    side?: 'file' | 'before' | 'after'
    text: string
    sourceRevision: string
    stale?: boolean
}

export function codeRevision(content: string): string {
    let hash = 2166136261
    for (let index = 0; index < content.length; index++) hash = Math.imul(hash ^ content.charCodeAt(index), 16777619)
    return `${content.length}:${(hash >>> 0).toString(16)}`
}

export function selectionContextFile(selection: CodeSelectionSnapshot): ComposerContextFile {
    if (!selection.filePath || !selection.text.trim() || selection.text.length > 64_000 || selection.startLine < 1 || selection.endLine < selection.startLine) throw new Error('Select up to 64,000 characters of code first.')
    const name = selection.filePath.replace(/\\/g, '/').split('/').pop() || 'Code'
    return {
        id: `selection-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        path: selection.filePath,
        name: `${name}:${selection.startLine}${selection.endLine !== selection.startLine ? `–${selection.endLine}` : ''}`,
        kind: 'code', mimeType: 'text/plain', source: 'manual', animateIn: true,
        content: `Selected code snapshot\nFile: ${selection.filePath}\nLines: ${selection.startLine}–${selection.endLine}\nSide: ${selection.side || 'file'}\nSource revision: ${selection.sourceRevision}\n${selection.workspaceRoot ? `Working folder: ${selection.workspaceRoot}\n` : ''}${selection.stale ? 'Source changed since selection; use this preserved snapshot.\n' : ''}\n${selection.text}`,
        previewText: selection.text.slice(0, 180), selection
    }
}

type Request = { sessionId: string; file: ComposerContextFile }
const pending = new Map<string, Request[]>()
const listeners = new Set<(request: Request) => boolean>()

export async function requestCodeContext(selection: CodeSelectionSnapshot): Promise<void> {
    const { assistantStore } = await import('@/lib/assistant/assistant-store-core')
    const sessionId = assistantStore.getState().snapshot.selectedSessionId
    if (!sessionId) throw new Error('Select a chat before asking Zyra about this code.')
    if (selection.side === 'file') {
        const current = await window.devscope.readFileContent(selection.filePath).catch(() => null)
        if (current?.success && !current.truncated && typeof current.content === 'string') selection = { ...selection, stale: codeRevision(current.content) !== selection.sourceRevision }
    }
    await requestAssistantContextFile(selectionContextFile(selection), sessionId)
}

export async function requestAssistantContextFile(file: ComposerContextFile, targetSessionId?: string): Promise<void> {
    const { assistantStore } = await import('@/lib/assistant/assistant-store-core')
    const sessionId = targetSessionId || assistantStore.getState().snapshot.selectedSessionId
    if (!sessionId) throw new Error('Select a chat before attaching context.')
    const request = { sessionId, file }
    if (![...listeners].some(listener => listener(request))) pending.set(sessionId, [...(pending.get(sessionId) || []), request].slice(-20))
    while (pending.size > 20) pending.delete(pending.keys().next().value!)
    window.dispatchEvent(new CustomEvent('zyra:show-code-context', { detail: sessionId }))
    const { requestAssistantComposerFocus } = await import('./assistant-composer-focus')
    requestAssistantComposerFocus()
}

export function subscribeCodeContext(sessionId: string, receive: (file: ComposerContextFile) => void): () => void {
    const listener = (request: Request) => {
        if (request.sessionId !== sessionId) return false
        receive(request.file)
        return true
    }
    listeners.add(listener)
    const waiting = pending.get(sessionId) || []
    pending.delete(sessionId)
    waiting.forEach(listener)
    return () => { listeners.delete(listener) }
}
