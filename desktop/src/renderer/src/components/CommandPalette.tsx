import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { MessageSquare, Settings, SquarePen } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useCommandPalette } from '@/lib/commandPalette'
import { useAssistantStoreActions, useAssistantStoreSelector } from '@/lib/assistant/assistant-store-hooks'
import { cn } from '@/lib/utils'
import { CommandPaletteResults } from './CommandPaletteResults'
import {
    formatAssistantSidebarRelativeTime,
    getProjectLabel,
    getSessionDisplayTitle,
    getSessionLastActivityAt,
    getSortableTimestamp,
    isAssistantDraftSession,
    resolveSessionProjectPath
} from '@/pages/assistant/assistant-sessions-rail-utils'
import type { CommandPaletteResult as Result } from './command-palette-types'
import { buildAssistantChatRoute } from '@/pages/assistant/assistant-chat-route'
import { createAssistantChatAndNavigate } from '@/pages/assistant/create-assistant-chat-and-navigate'

const MAX_RECENT_CHATS = 8

export function CommandPalette() {
    const { isOpen, close } = useCommandPalette()
    const navigate = useNavigate()
    const assistantActions = useAssistantStoreActions()
    const assistantSessions = useAssistantStoreSelector((state) => state.snapshot.sessions)
    const inputRef = useRef<HTMLInputElement>(null)

    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const [isClosing, setIsClosing] = useState(false)
    const closeTimerRef = useRef<number | null>(null)

    useEffect(() => {
        if (isOpen) {
            setIsClosing(false)
            window.setTimeout(() => inputRef.current?.focus(), 10)
            return
        }

        setIsClosing(false)
        setQuery('')
        setSelectedIndex(0)
        if (closeTimerRef.current) {
            window.clearTimeout(closeTimerRef.current)
            closeTimerRef.current = null
        }
    }, [isOpen])

    const handleClose = useCallback(() => {
        if (isClosing) return
        setIsClosing(true)
        if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
        closeTimerRef.current = window.setTimeout(() => {
            closeTimerRef.current = null
            close()
        }, 120)
    }, [close, isClosing])

    useEffect(() => {
        return () => {
            if (closeTimerRef.current) {
                window.clearTimeout(closeTimerRef.current)
                closeTimerRef.current = null
            }
        }
    }, [])

    const deferredSearchTerm = useDeferredValue(query.trim().toLowerCase())

    const results = useMemo<Result[]>(() => {
        const matchesTerm = (...values: Array<string | undefined | null>) => {
            if (!deferredSearchTerm) return true
            return values.some((value) => String(value || '').toLowerCase().includes(deferredSearchTerm))
        }

        const recentChats = assistantSessions
            .filter((session: any) => !session.archived && !isAssistantDraftSession(session))
            .map((session: any) => {
                const projectPath = resolveSessionProjectPath(session)
                const projectLabel = projectPath ? getProjectLabel(projectPath) : 'chat'
                const lastActivityAt = getSessionLastActivityAt(session)
                return { session, title: getSessionDisplayTitle(session), projectLabel, lastActivityAt }
            })
            .filter((entry) => matchesTerm(entry.title, entry.projectLabel))
            .sort((left, right) => getSortableTimestamp(right.lastActivityAt) - getSortableTimestamp(left.lastActivityAt))
            .slice(0, MAX_RECENT_CHATS)
            .map(({ session, title, projectLabel, lastActivityAt }) => ({
                id: `chat-${session.id}`,
                title,
                subtitle: projectLabel,
                badge: formatAssistantSidebarRelativeTime(lastActivityAt),
                icon: <MessageSquare size={14} />,
                group: 'Recent chats',
                action: () => navigate(buildAssistantChatRoute(session.id, session.activeThreadId || null))
            }))

        const actions: Result[] = [
            {
                id: 'action-new-chat',
                title: 'New chat',
                subtitle: 'Start a blank chat',
                badge: 'Action',
                icon: <SquarePen size={14} />,
                group: 'Actions',
                action: () => {
                    void createAssistantChatAndNavigate(assistantActions, navigate)
                }
            },
            {
                id: 'action-settings',
                title: 'Settings',
                subtitle: 'Coming soon',
                badge: 'Soon',
                icon: <Settings size={14} />,
                group: 'Actions',
                action: () => navigate('/settings')
            }
        ].filter((action) => matchesTerm(action.title, action.subtitle, action.badge))

        return [...recentChats, ...actions].slice(0, 12)
    }, [assistantActions, assistantSessions, deferredSearchTerm, navigate])

    useEffect(() => {
        setSelectedIndex((current) => Math.min(current, Math.max(results.length - 1, 0)))
    }, [results.length])

    const selectResult = useCallback((result?: Result) => {
        if (!result) return
        result.action()
        handleClose()
    }, [handleClose])

    useEffect(() => {
        if (!isOpen) return

        const handler = (event: KeyboardEvent) => {
            if (event.key === 'ArrowDown') {
                event.preventDefault()
                setSelectedIndex((current) => Math.min(current + 1, Math.max(results.length - 1, 0)))
                return
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault()
                setSelectedIndex((current) => Math.max(current - 1, 0))
                return
            }
            if (event.key === 'Enter') {
                selectResult(results[selectedIndex])
                return
            }
            if (event.key === 'Escape') {
                handleClose()
            }
        }

        window.addEventListener('keydown', handler)
        return () => window.removeEventListener('keydown', handler)
    }, [handleClose, isOpen, results, selectedIndex, selectResult])

    if (!isOpen) return null

    return (
        <div
            className={cn(
                'fixed inset-0 z-[60] flex items-start justify-center bg-sparkle-bg/70 px-3 pt-[18vh] backdrop-blur-sm sm:px-6',
                isClosing ? 'animate-command-palette-backdrop-out' : 'animate-command-palette-backdrop-in'
            )}
            onClick={handleClose}
        >
            <div
                className={cn(
                    'relative flex w-full max-w-[520px] flex-col overflow-hidden rounded-xl border border-sparkle-border bg-sparkle-card py-2 shadow-[0_22px_70px_-34px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.04)]',
                    isClosing ? 'animate-command-palette-out' : 'animate-command-palette-in'
                )}
                onClick={(event) => event.stopPropagation()}
            >
                <input
                    ref={inputRef}
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search chats or actions"
                    className="h-9 w-full bg-transparent px-5 text-[15px] font-normal text-sparkle-text outline-none placeholder:text-sparkle-text-muted/58"
                />

                <div className="custom-scrollbar relative flex max-h-[380px] flex-col overflow-y-auto px-1 pb-1">
                    <CommandPaletteResults
                        query={query}
                        results={results}
                        selectedIndex={selectedIndex}
                        setSelectedIndex={setSelectedIndex}
                        selectResult={selectResult}
                        loadingFiles={false}
                    />
                </div>
            </div>
        </div>
    )
}

export default CommandPalette
