import { useState } from 'react'
import { Bot, ArrowUpRight, ChevronRight } from 'lucide-react'
import type { AssistantActivity } from '@shared/assistant/contracts'
import { openAssistantThreadLink } from './assistant-thread-navigation'
import type { AssistantChatDisplayMode } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { formatAssistantDateTime } from '@/lib/assistant/selectors'
import { ASSISTANT_ACTION_ROW_CLASS, ASSISTANT_ACTION_ICON_CLASS } from './assistant-action-row-layout'
import { CollapsibleUserMessageBody } from './AssistantTimelineText'
import { readAssistantPeerReply } from './assistant-peer-replies'

export function AssistantTimelineThreadMessage({ activity, displayMode = 'minimal' }: { activity: AssistantActivity; displayMode?: AssistantChatDisplayMode }) {
    const [error, setError] = useState<string | null>(null)
    const payload = activity.payload || {}
    const received = activity.kind === 'thread-message'
    const sentReply = readAssistantPeerReply(activity)
    const sender = String(payload.senderLabel || 'Zyra')
    const target = String(received ? payload.senderCanonicalThreadId || payload.senderThreadId || '' : payload.targetThreadId || sentReply?.targetThreadId || '')
    const open = async () => {
        setError(null)
        try { await openAssistantThreadLink(target, received ? null : sentReply?.messageId) } catch (error) { setError(error instanceof Error ? error.message : 'Could not open this thread.') }
    }
    if (received) return <div className={cn('group/user-message ml-auto flex min-w-0 flex-col items-end', displayMode === 'minimal' ? 'max-w-[80%] py-0.5' : 'py-1')} data-assistant-thread-message-bubble>
        <div className={cn('min-w-0 max-w-full', displayMode !== 'minimal' && 'max-w-[36rem]')}>
            <div className="mb-1.5 flex min-w-0 items-center justify-end gap-1.5 text-[10px] font-medium text-sparkle-text-muted" data-assistant-thread-message-label>
                <Bot size={12} className="shrink-0 text-[var(--agent-presence-accent,var(--color-secondary))]" aria-hidden="true" />
                <button type="button" disabled={!target} onClick={() => void open()} className="min-w-0 break-words text-right hover:text-sparkle-text hover:underline disabled:no-underline">Message from {sender} in another thread</button>
            </div>
            <div className={cn('whitespace-pre-wrap break-words text-[13px] leading-5 text-sparkle-text [overflow-wrap:anywhere]', displayMode === 'minimal'
                ? 'rounded-2xl bg-[var(--surface-hover)] px-3.5 py-2.5'
                : 'rounded-[1.15rem] border border-white/10 bg-white/[0.03] px-4 py-2.5')} data-assistant-thread-message-body><CollapsibleUserMessageBody content={activity.detail || String(payload.text || '')} /></div>
            <p className="mt-2 px-1 text-[10px] text-sparkle-text-muted"><time dateTime={activity.createdAt}>{formatAssistantDateTime(activity.createdAt)}</time></p>
            {error ? <p role="status" className="mt-1 text-xs text-sparkle-text-muted">{error}</p> : null}
        </div>
    </div>
    const action = String(payload.action || (payload.args as Record<string, unknown> | undefined)?.action || '')
    const messageText = ['send', 'start'].includes(action) ? String((payload.args as Record<string, unknown> | undefined)?.prompt || activity.detail || '') : ''
    return <><details className="group/thread-action text-xs" data-assistant-thread-receipt>
        <summary className={cn(ASSISTANT_ACTION_ROW_CLASS, 'list-none cursor-pointer [&::-webkit-details-marker]:hidden hover:bg-[var(--surface-hover)]')} data-assistant-action-row>
            <span className={ASSISTANT_ACTION_ICON_CLASS}><Bot size={13} /></span>
            <span className="min-w-0 flex-1 truncate text-[12px] font-medium leading-5 text-sparkle-text-secondary">{activity.summary}</span>
            {target ? <button type="button" onClick={event => { event.preventDefault(); event.stopPropagation(); void open() }} className="inline-flex shrink-0 items-center gap-1 text-[10px] text-sparkle-text-muted hover:text-sparkle-text hover:underline">Open thread<ArrowUpRight size={11} /></button> : null}
            <ChevronRight size={11} className="shrink-0 text-sparkle-text-muted group-open/thread-action:rotate-90" />
        </summary>
        <div className="whitespace-pre-wrap break-words pb-2 pl-6 pr-1 pt-1 text-sparkle-text-secondary">
            {messageText || (payload.status === 'failed' ? 'This thread action failed.' : action === 'status' ? 'Delivery status checked.' : action === 'models' ? 'Available models and thread settings checked.' : 'Available threads checked.')}
            <p className="mt-1 text-[10px] text-sparkle-text-muted">{formatAssistantDateTime(activity.createdAt)}</p>
        </div>
    </details>
        {error ? <p role="status" className="mt-1 pl-6 text-xs text-sparkle-text-muted">{error}</p> : null}
    </>
}
