import { useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { AppWindow, ClipboardPaste, Copy, ExternalLink, FilePlus, FolderOpen, FolderPlus, Pencil, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { EntryActionTarget, FileActionsMenuItem } from './folderBrowseTypes'

export function useFolderBrowseContextMenu({
    currentDirectoryPath,
    currentDirectoryName,
    onEntryOpen,
    onEntryOpenWith,
    onEntryOpenInExplorer,
    onEntryCopyPath,
    onEntryCopy,
    onEntryRename,
    onEntryDelete,
    onEntryPaste,
    onEntryCreateFile,
    onEntryCreateFolder,
    onRefresh,
    hasFileClipboardItem
}: {
    currentDirectoryPath: string
    currentDirectoryName: string
    onEntryOpen: (entry: EntryActionTarget) => void | Promise<void>
    onEntryOpenWith: (entry: EntryActionTarget) => void | Promise<void>
    onEntryOpenInExplorer: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCopyPath: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCopy: (entry: EntryActionTarget) => void | Promise<void>
    onEntryRename: (entry: EntryActionTarget) => void | Promise<void>
    onEntryDelete: (entry: EntryActionTarget) => void | Promise<void>
    onEntryPaste: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCreateFile: (entry: EntryActionTarget) => void | Promise<void>
    onEntryCreateFolder: (entry: EntryActionTarget) => void | Promise<void>
    onRefresh: () => void | Promise<void>
    hasFileClipboardItem: boolean
}) {
    const [contextMenu, setContextMenu] = useState<{
        x: number
        y: number
        title: string
        items: FileActionsMenuItem[]
    } | null>(null)

    const currentDirectoryEntry = useMemo<EntryActionTarget>(() => ({
        path: currentDirectoryPath,
        name: currentDirectoryName,
        type: 'directory'
    }), [currentDirectoryName, currentDirectoryPath])

    const buildEntryActions = (entry: EntryActionTarget): FileActionsMenuItem[] => [
        { id: 'open', label: 'Open', icon: <FolderOpen size={13} />, onSelect: () => onEntryOpen(entry) },
        ...(entry.type === 'file'
            ? [{ id: 'open-with', label: 'Open With...', icon: <AppWindow size={13} />, onSelect: () => onEntryOpenWith(entry) }]
            : []),
        { id: 'open-in-explorer', label: 'Open in Explorer', icon: <ExternalLink size={13} />, onSelect: () => onEntryOpenInExplorer(entry) },
        { id: 'copy-path', label: 'Copy Path', icon: <Copy size={13} />, onSelect: () => onEntryCopyPath(entry) },
        { id: 'copy', label: 'Copy', icon: <Copy size={13} />, onSelect: () => onEntryCopy(entry) },
        { id: 'rename', label: 'Rename', icon: <Pencil size={13} />, onSelect: () => onEntryRename(entry) },
        { id: 'delete', label: 'Delete', icon: <Trash2 size={13} />, danger: true, onSelect: () => onEntryDelete(entry) }
    ]

    const buildEmptySpaceActions = (): FileActionsMenuItem[] => [
        { id: 'refresh', label: 'Refresh', icon: <RefreshCw size={13} />, onSelect: () => onRefresh() },
        { id: 'paste', label: 'Paste', icon: <ClipboardPaste size={13} />, disabled: !hasFileClipboardItem, onSelect: () => onEntryPaste(currentDirectoryEntry) },
        { id: 'new-file', label: 'New File', icon: <FilePlus size={13} />, onSelect: () => onEntryCreateFile(currentDirectoryEntry) },
        { id: 'new-folder', label: 'New Folder', icon: <FolderPlus size={13} />, onSelect: () => onEntryCreateFolder(currentDirectoryEntry) }
    ]

    const openEntryContextMenu = (event: ReactMouseEvent<HTMLElement>, entry: EntryActionTarget) => {
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            title: `${entry.name} actions`,
            items: buildEntryActions(entry)
        })
    }

    const openEmptySpaceContextMenu = (event: ReactMouseEvent<HTMLElement>) => {
        if (event.target !== event.currentTarget) return
        event.preventDefault()
        event.stopPropagation()
        setContextMenu({
            x: event.clientX,
            y: event.clientY,
            title: `${currentDirectoryName} actions`,
            items: buildEmptySpaceActions()
        })
    }

    useEffect(() => {
        if (!contextMenu) return

        const handlePointerDown = () => setContextMenu(null)
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setContextMenu(null)
        }

        document.addEventListener('pointerdown', handlePointerDown)
        document.addEventListener('keydown', handleEscape)
        return () => {
            document.removeEventListener('pointerdown', handlePointerDown)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [contextMenu])

    const contextMenuPosition = useMemo(() => {
        if (!contextMenu || typeof window === 'undefined') return null
        const menuWidth = 220
        const estimatedHeight = 10 + (contextMenu.items.length * 34)
        const margin = 8
        return {
            left: Math.max(margin, Math.min(contextMenu.x, window.innerWidth - menuWidth - margin)),
            top: Math.max(margin, Math.min(contextMenu.y, window.innerHeight - estimatedHeight - margin))
        }
    }, [contextMenu])

    const contextMenuPortal = contextMenu && contextMenuPosition && typeof document !== 'undefined'
        ? createPortal(
            <div
                className="fixed inset-0 z-[170]"
                onClick={() => setContextMenu(null)}
                onContextMenu={(event) => {
                    event.preventDefault()
                    setContextMenu(null)
                }}
            >
                <div
                    className="fixed z-[171] min-w-[220px] max-w-[260px] rounded-xl border border-white/10 bg-sparkle-card p-1 shadow-2xl shadow-black/60"
                    style={{ top: `${contextMenuPosition.top}px`, left: `${contextMenuPosition.left}px` }}
                    onClick={(event) => event.stopPropagation()}
                    onPointerDown={(event) => event.stopPropagation()}
                    role="menu"
                    aria-label={contextMenu.title}
                >
                    {contextMenu.items.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            disabled={item.disabled}
                            onClick={() => {
                                setContextMenu(null)
                                void item.onSelect()
                            }}
                            className={cn(
                                'flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors',
                                item.disabled
                                    ? 'cursor-not-allowed text-white/20'
                                    : item.danger
                                        ? 'text-red-200 hover:bg-red-500/15 hover:text-red-100'
                                        : 'text-white/75 hover:bg-white/10 hover:text-white'
                            )}
                            role="menuitem"
                        >
                            {item.icon && <span className="shrink-0">{item.icon}</span>}
                            <span>{item.label}</span>
                        </button>
                    ))}
                </div>
            </div>,
            document.body
        )
        : null

    return { openEntryContextMenu, openEmptySpaceContextMenu, contextMenuPortal }
}
