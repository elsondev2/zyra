import { useState } from 'react'
import { Bot, X } from 'lucide-react'
import type { AssistantActivity } from '@shared/assistant/contracts'
import { openAssistantThreadLink } from './assistant-thread-navigation'

const storageKey = (threadId: string) => `zyra.thread-message-dismissed:${threadId}`
function readDismissed(threadId: string): string[] {
    try { const value = JSON.parse(localStorage.getItem(storageKey(threadId)) || '[]'); return Array.isArray(value) ? value.filter(id => typeof id === 'string').slice(-64) : [] } catch { return [] }
}

export function AssistantThreadMessageNotice({ threadId, activities }: { threadId: string; activities: AssistantActivity[] }) {
    return <ThreadMessageNotice key={threadId} threadId={threadId} activities={activities} />
}

function ThreadMessageNotice({ threadId, activities }: { threadId: string; activities: AssistantActivity[] }) {
    const [dismissed, setDismissed] = useState(() => readDismissed(threadId))
    const [sourceError, setSourceError] = useState<string | null>(null)
    const [expandedId, setExpandedId] = useState<string | null>(null)
    const pending = activities.filter(activity => activity.kind === 'thread-message' && !dismissed.includes(activity.id))
    const message = pending[0]
    if (!message) return null
    const payload = message.payload || {}
    const openSender = async () => {
        setSourceError(null)
        const senderId = String(payload.senderCanonicalThreadId || payload.senderThreadId || '')
        try { await openAssistantThreadLink(senderId) } catch (error) { setSourceError(error instanceof Error ? error.message : 'Could not open the sending thread.') }
    }
    return <div className="pointer-events-auto mb-2 flex min-w-0 items-start gap-2 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-xs" data-assistant-thread-message-notice>
        <Bot size={14} className="mt-0.5 shrink-0 text-[var(--accent-primary)]" />
        <div className="min-w-0 flex-1">
            <button type="button" onClick={() => void openSender()} className="text-left font-medium text-sparkle-text hover:underline">Message from {String(payload.senderLabel || 'Zyra')} in another thread</button>
            <p className={expandedId === message.id ? 'assistant-chat-scrollbar mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap break-words text-sparkle-text-muted' : 'mt-1 line-clamp-2 break-words text-sparkle-text-muted'}>{message.detail}</p>
            <div className="mt-1 flex items-center gap-2 text-sparkle-text-muted">
                <button type="button" aria-expanded={expandedId === message.id} className="hover:text-sparkle-text hover:underline" onClick={() => setExpandedId(current => current === message.id ? null : message.id)}>{expandedId === message.id ? 'Show less' : 'Read message'}</button>
                {pending.length > 1 ? <span>{pending.length - 1} more messages</span> : null}
            </div>
            {sourceError ? <p className="mt-1 text-sparkle-text-muted" role="status">{sourceError}</p> : null}
        </div>
        <button type="button" aria-label="Dismiss thread message" title="Dismiss" className="shrink-0 text-sparkle-text-muted hover:text-sparkle-text" onClick={() => {
            const next = [...dismissed, message.id].slice(-64)
            setDismissed(next)
            try { localStorage.setItem(storageKey(threadId), JSON.stringify(next)) } catch { /* Dismiss still works when local storage is unavailable. */ }
        }}><X size={13} /></button>
    </div>
}
