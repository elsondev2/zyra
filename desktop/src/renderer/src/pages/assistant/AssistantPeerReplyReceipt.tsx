import { useState } from 'react'
import { ArrowUpRight, Bot } from 'lucide-react'
import type { AssistantPeerReply } from './assistant-peer-replies'
import { openAssistantThreadLink } from './assistant-thread-navigation'

export function AssistantPeerReplyReceipt({ reply }: { reply: AssistantPeerReply }) {
    const [error, setError] = useState<string | null>(null)
    const open = async () => {
        setError(null)
        try { await openAssistantThreadLink(reply.targetThreadId, reply.messageId) }
        catch (error) { setError(error instanceof Error ? error.message : 'Could not open the message.') }
    }
    return <>
        <button type="button" disabled={!reply.targetThreadId} onClick={() => void open()}
            className={reply.fallback ? 'inline-flex items-center gap-1.5 text-[10px] text-sparkle-text-muted hover:text-sparkle-text hover:underline' : 'mt-3 flex w-full items-center gap-2 rounded-md border border-[var(--surface-divider)] bg-[var(--surface-hover)] px-3 py-2 text-left text-[11px] text-sparkle-text-secondary hover:text-sparkle-text'}
            data-assistant-peer-reply={reply.fallback ? 'timestamp' : 'card'} title={reply.messageId ? 'Open the sent message in the receiving chat' : 'Open the receiving chat'}>
            <Bot size={12} className="shrink-0 text-[var(--agent-presence-accent,var(--color-secondary))]" />
            <span className="min-w-0 flex-1">Replied to another agent</span>
            {!reply.fallback ? <span className="shrink-0 text-sparkle-text-muted">Open message</span> : null}
            <ArrowUpRight size={11} className="shrink-0" />
        </button>
        {error ? <span role="status" className="text-[11px] text-sparkle-text-muted">{error}</span> : null}
    </>
}
