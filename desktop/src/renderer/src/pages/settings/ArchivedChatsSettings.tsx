import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, MessageSquare, RotateCcw, Trash2 } from 'lucide-react'
import type { AssistantSession } from '@shared/assistant/contracts'
import { useAssistantStoreActions, useAssistantStoreSelector } from '@/lib/assistant/store'
import { cn } from '@/lib/utils'
import {
    formatAssistantSidebarRelativeTime,
    getSessionDisplayTitle,
    getSessionLastActivityAt,
    getSortableTimestamp
} from '../assistant/assistant-sessions-rail-utils'

export default function ArchivedChatsSettings() {
    const navigate = useNavigate()
    const actions = useAssistantStoreActions()
    const [pendingSessionId, setPendingSessionId] = useState<string | null>(null)
    const sessions = useAssistantStoreSelector((state) => state.snapshot.sessions)

    const sortedSessions = useMemo(() => {
        return sessions.filter((session) => session.archived).sort((left, right) => {
            return getSortableTimestamp(getSessionLastActivityAt(right)) - getSortableTimestamp(getSessionLastActivityAt(left))
        })
    }, [sessions])

    const restoreSession = async (session: AssistantSession, openAfterRestore = false) => {
        if (pendingSessionId) return
        setPendingSessionId(session.id)
        try {
            await actions.archiveSession(session.id, false)
            if (openAfterRestore) {
                await actions.selectSession(session.id, { force: true })
                navigate('/assistant')
            }
        } finally {
            setPendingSessionId(null)
        }
    }

    const deleteSession = async (session: AssistantSession) => {
        if (pendingSessionId) return
        const title = getSessionDisplayTitle(session)
        if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return
        setPendingSessionId(session.id)
        try {
            await actions.deleteSession(session.id)
        } finally {
            setPendingSessionId(null)
        }
    }

    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-5 animate-fadeIn">
            <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/[0.035] text-sparkle-text-secondary">
                    <Archive size={18} />
                </div>
                <div>
                    <h1 className="text-xl font-semibold text-sparkle-text">Archived chats</h1>
                    <p className="text-sm text-sparkle-text-muted">{sortedSessions.length} archived</p>
                </div>
            </div>

            <div className="overflow-hidden rounded-xl border border-white/10 bg-sparkle-card">
                {sortedSessions.length === 0 ? (
                    <div className="px-5 py-10 text-sm text-sparkle-text-muted">No archived chats</div>
                ) : (
                    <div className="divide-y divide-white/[0.06]">
                        {sortedSessions.map((session) => {
                            const pending = pendingSessionId === session.id
                            return (
                                <div key={session.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-black/20 text-sparkle-text-muted">
                                        <MessageSquare size={15} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="truncate text-sm font-medium text-sparkle-text">{getSessionDisplayTitle(session)}</div>
                                        <div className="mt-0.5 truncate text-xs text-sparkle-text-muted">
                                            {formatAssistantSidebarRelativeTime(getSessionLastActivityAt(session))}
                                            {session.projectPath ? ` - ${session.projectPath}` : ''}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={pending}
                                        onClick={() => void restoreSession(session, true)}
                                        className={cn(
                                            'inline-flex h-8 items-center gap-1.5 rounded-md border border-white/10 px-2.5 text-xs text-sparkle-text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.04] hover:text-white',
                                            pending && 'pointer-events-none opacity-50'
                                        )}
                                    >
                                        <RotateCcw size={13} />
                                        Restore
                                    </button>
                                    <button
                                        type="button"
                                        disabled={pending}
                                        onClick={() => void deleteSession(session)}
                                        className={cn(
                                            'inline-flex h-8 w-8 items-center justify-center rounded-md text-sparkle-text-muted transition-colors hover:bg-red-500/10 hover:text-red-200',
                                            pending && 'pointer-events-none opacity-50'
                                        )}
                                        aria-label={`Delete ${getSessionDisplayTitle(session)}`}
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
