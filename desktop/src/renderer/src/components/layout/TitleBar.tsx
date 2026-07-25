/**
 * Zyra - minimal desktop title bar
 */

import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Copy, Minus, PanelLeftClose, PanelLeftOpen, Square, X } from 'lucide-react'
import { useAssistantStoreActions, useAssistantStoreSelector } from '@/lib/assistant/store'
import { useCommandPalette } from '@/lib/commandPalette'
import { cn } from '@/lib/utils'

type MenuLabel = 'File' | 'Edit' | 'View' | 'Help'
type AppNavEntry = { path: string; search: string; sessionId: string | null }

const menuLabels: MenuLabel[] = ['File', 'Edit', 'View', 'Help']

function getAppNavEntryKey(entry: AppNavEntry) {
    return `${entry.path}${entry.search}::${entry.sessionId || ''}`
}

export default function TitleBar() {
    const navigate = useNavigate()
    const location = useLocation()
    const commandPalette = useCommandPalette()
    const assistantActions = useAssistantStoreActions()
    const selectedSessionId = useAssistantStoreSelector((state) => state.snapshot.selectedSessionId)
    const menuRootRef = useRef<HTMLDivElement | null>(null)
    const pendingNavigationKeyRef = useRef<string | null>(null)
    const [isMaximized, setIsMaximized] = useState(false)
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
    const [openMenu, setOpenMenu] = useState<MenuLabel | null>(null)
    const [appHistory, setAppHistory] = useState<{ entries: AppNavEntry[]; index: number }>({ entries: [], index: -1 })

    useEffect(() => {
        void window.devscope.window.isMaximized().then(setIsMaximized).catch(() => undefined)
    }, [])

    useEffect(() => {
        const handleSidebarState = (event: Event) => {
            const detail = (event as CustomEvent<{ collapsed?: boolean }>).detail
            if (typeof detail?.collapsed === 'boolean') {
                setSidebarCollapsed(detail.collapsed)
            }
        }

        window.addEventListener('zyra:assistant-sidebar-state', handleSidebarState)
        return () => window.removeEventListener('zyra:assistant-sidebar-state', handleSidebarState)
    }, [])

    useEffect(() => {
        const entry: AppNavEntry = {
            path: location.pathname,
            search: location.search,
            sessionId: location.pathname.startsWith('/assistant') ? selectedSessionId : null
        }
        const key = getAppNavEntryKey(entry)

        if (pendingNavigationKeyRef.current) {
            if (pendingNavigationKeyRef.current === key) pendingNavigationKeyRef.current = null
            return
        }

        setAppHistory((current) => {
            const currentEntry = current.entries[current.index]
            if (currentEntry && getAppNavEntryKey(currentEntry) === key) return current
            const entries = [...current.entries.slice(0, current.index + 1), entry]
            return { entries: entries.slice(-40), index: Math.min(entries.length - 1, 39) }
        })
    }, [location.pathname, location.search, selectedSessionId])

    useEffect(() => {
        if (!openMenu) return

        const handlePointerDown = (event: MouseEvent) => {
            if (!menuRootRef.current?.contains(event.target as Node)) setOpenMenu(null)
        }
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpenMenu(null)
        }

        document.addEventListener('mousedown', handlePointerDown)
        window.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            window.removeEventListener('keydown', handleEscape)
        }
    }, [openMenu])

    const handleToggleSidebar = () => {
        window.dispatchEvent(new CustomEvent('zyra:toggle-assistant-sidebar'))
    }

    const sidebarActionLabel = sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'
    const SidebarIcon = sidebarCollapsed ? PanelLeftOpen : PanelLeftClose

    const handleMinimize = () => window.devscope.window.minimize()

    const handleMaximize = () => {
        window.devscope.window.maximize()
        setIsMaximized((current) => !current)
    }

    const handleClose = () => window.devscope.window.close()

    const closeMenu = () => setOpenMenu(null)

    const applyNavEntry = (entry: AppNavEntry) => {
        const targetKey = getAppNavEntryKey(entry)
        const currentKey = getAppNavEntryKey({
            path: location.pathname,
            search: location.search,
            sessionId: location.pathname.startsWith('/assistant') ? selectedSessionId : null
        })
        pendingNavigationKeyRef.current = currentKey === targetKey ? null : targetKey
        if (location.pathname !== entry.path || location.search !== entry.search) {
            navigate(`${entry.path}${entry.search}`)
        }
        if (entry.path.startsWith('/assistant') && entry.sessionId && entry.sessionId !== selectedSessionId) {
            void assistantActions.selectSession(entry.sessionId)
        }
    }

    const navigateHistory = (direction: -1 | 1) => {
        const nextIndex = appHistory.index + direction
        const target = appHistory.entries[nextIndex]
        if (!target) return
        setAppHistory((current) => ({ ...current, index: nextIndex }))
        applyNavEntry(target)
    }

    const canGoBack = appHistory.index > 0
    const canGoForward = appHistory.index >= 0 && appHistory.index < appHistory.entries.length - 1

    const runMenuAction = (action: () => void) => {
        action()
        closeMenu()
    }

    const handleNewChat = () => {
        navigate('/assistant')
        void assistantActions.createSession({ mode: 'work' })
    }

    const runEditCommand = (command: 'cut' | 'copy' | 'paste' | 'selectAll') => {
        if (command === 'selectAll') {
            const active = document.activeElement
            if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
                active.select()
                return
            }
        }
        document.execCommand(command)
    }

    const menuItems: Record<MenuLabel, Array<{ label: string; shortcut?: string; action: () => void; danger?: boolean }>> = {
        File: [
            { label: 'New chat', shortcut: 'Ctrl N', action: handleNewChat },
            { label: 'Search', shortcut: 'Ctrl K', action: commandPalette.open },
            { label: 'Settings', action: () => navigate('/settings') },
            { label: 'Close window', shortcut: 'Alt F4', action: handleClose, danger: true }
        ],
        Edit: [
            { label: 'Cut', shortcut: 'Ctrl X', action: () => runEditCommand('cut') },
            { label: 'Copy', shortcut: 'Ctrl C', action: () => runEditCommand('copy') },
            { label: 'Paste', shortcut: 'Ctrl V', action: () => runEditCommand('paste') },
            { label: 'Select all', shortcut: 'Ctrl A', action: () => runEditCommand('selectAll') }
        ],
        View: [
            { label: sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar', action: handleToggleSidebar },
            { label: 'Command palette', shortcut: 'Ctrl K', action: commandPalette.open },
            { label: 'Reload UI', shortcut: 'Ctrl R', action: () => window.location.reload() }
        ],
        Help: [
            { label: 'Instructor Voice Lab', action: () => navigate('/assistant/instructor') },
            { label: 'Open settings', action: () => navigate('/settings') },
            { label: 'Show command palette', shortcut: 'Ctrl K', action: commandPalette.open }
        ]
    }

    return (
        <div
            className="fixed left-0 right-0 top-0 z-50 flex h-[34px] items-center bg-[#1b1829]/95 text-sparkle-text"
            style={{ WebkitAppRegion: 'drag' } as any}
        >
            <div className="flex h-full min-w-0 items-center gap-3 px-2.5">
                <button
                    type="button"
                    onClick={handleToggleSidebar}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-[#918aa0] transition-colors hover:bg-white/[0.035] hover:text-[#d7d0e3] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10"
                    style={{ WebkitAppRegion: 'no-drag' } as any}
                    title={sidebarActionLabel}
                    aria-label={sidebarActionLabel}
                    aria-pressed={!sidebarCollapsed}
                >
                    <SidebarIcon size={15} strokeWidth={1.7} />
                </button>
                <div className="flex h-full items-center gap-0.5" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    <button
                        type="button"
                        onClick={() => navigateHistory(-1)}
                        disabled={!canGoBack}
                        className={cn(titleNavButtonClass, !canGoBack && 'cursor-default opacity-35 hover:bg-transparent hover:text-[#918aa0]')}
                        title="Back"
                        aria-label="Back"
                    >
                        <ChevronLeft size={15} strokeWidth={1.8} />
                    </button>
                    <button
                        type="button"
                        onClick={() => navigateHistory(1)}
                        disabled={!canGoForward}
                        className={cn(titleNavButtonClass, !canGoForward && 'cursor-default opacity-35 hover:bg-transparent hover:text-[#918aa0]')}
                        title="Forward"
                        aria-label="Forward"
                    >
                        <ChevronRight size={15} strokeWidth={1.8} />
                    </button>
                </div>
                <div ref={menuRootRef} className="hidden h-full items-center gap-1 sm:flex" style={{ WebkitAppRegion: 'no-drag' } as any}>
                    {menuLabels.map((label) => {
                        const active = openMenu === label
                        return (
                            <div key={label} className="relative h-full">
                                <button
                                    type="button"
                                    onClick={() => setOpenMenu(active ? null : label)}
                                    onMouseEnter={() => {
                                        if (openMenu) setOpenMenu(label)
                                    }}
                                    className={cn(
                                        'inline-flex h-full items-center rounded-md px-2 text-[12px] font-medium leading-none transition-colors focus:outline-none',
                                        active ? 'bg-white/[0.055] text-[#eeeaf7]' : 'text-[#b9b2c8] hover:bg-white/[0.035] hover:text-[#eeeaf7]'
                                    )}
                                    aria-haspopup="menu"
                                    aria-expanded={active}
                                >
                                    {label}
                                </button>
                                {active ? (
                                    <div className="absolute left-0 top-full z-[190] mt-1 min-w-[184px] overflow-hidden rounded-xl border border-white/[0.08] bg-[#1b1829]/98 p-1 text-[13px] shadow-[0_18px_48px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.035)] backdrop-blur-xl" role="menu">
                                        {menuItems[label].map((item) => (
                                            <button
                                                key={item.label}
                                                type="button"
                                                onClick={() => runMenuAction(item.action)}
                                                className={cn(
                                                    'flex h-8 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors hover:bg-white/[0.055]',
                                                    item.danger ? 'text-red-200 hover:text-red-100' : 'text-[#c9c2d6] hover:text-[#f0edf9]'
                                                )}
                                                role="menuitem"
                                            >
                                                <span className="min-w-0 flex-1 truncate">{item.label}</span>
                                                {item.shortcut ? <span className="shrink-0 text-[11px] text-[#8d849b]/75">{item.shortcut}</span> : null}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        )
                    })}
                </div>
            </div>

            <div className="min-w-0 flex-1 self-stretch" />

            <div className="flex h-full items-center" style={{ WebkitAppRegion: 'no-drag' } as any}>
                <button
                    onClick={handleMinimize}
                    className={cn(windowControlClass, 'hover:bg-white/[0.055]')}
                    aria-label="Minimize"
                >
                    <Minus size={14} />
                </button>
                <button
                    onClick={handleMaximize}
                    className={cn(windowControlClass, 'hover:bg-white/[0.055]')}
                    aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                >
                    {isMaximized ? <Copy size={12} /> : <Square size={12} />}
                </button>
                <button
                    onClick={handleClose}
                    className={cn(windowControlClass, 'hover:bg-red-600 hover:text-white')}
                    aria-label="Close"
                >
                    <X size={14} />
                </button>
            </div>
        </div>
    )
}

const titleNavButtonClass = 'inline-flex h-7 w-6 items-center justify-center rounded-md text-[#918aa0] transition-colors hover:bg-white/[0.035] hover:text-[#d7d0e3] focus:outline-none focus-visible:ring-1 focus-visible:ring-white/10'
const windowControlClass = 'inline-flex h-[34px] w-10 items-center justify-center text-[#918aa0] transition-colors hover:text-[#d7d0e3]'
