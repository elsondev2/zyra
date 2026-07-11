import { useRef, type ReactNode } from 'react'
import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'
import { ChevronRight } from 'lucide-react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import { VscodeEntryIcon } from '@/components/ui/VscodeEntryIcon'
import { cn, getFileExtension } from '@/lib/utils'
import type { OutlineItem } from './modalShared'

export type VisibleOutlineItem = {
    item: OutlineItem
    depth: number
}

export type VisibleFolderNode = {
    node: DevScopeFileTreeNode
    depth: number
    expanded: boolean
}

export function normalizePathKey(pathValue: string): string {
    return String(pathValue || '').replace(/\\/g, '/').toLowerCase()
}

export function getPathName(pathValue: string): string {
    const normalized = String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '')
    const lastSlashIndex = normalized.lastIndexOf('/')
    return lastSlashIndex >= 0 ? normalized.slice(lastSlashIndex + 1) : normalized
}

export function collectDefaultExpandedOutlineIds(items: OutlineItem[], depth = 0): string[] {
    const collected: string[] = []
    for (const item of items) {
        if (item.children.length > 0 && depth < 2) {
            collected.push(item.id, ...collectDefaultExpandedOutlineIds(item.children, depth + 1))
        }
    }
    return collected
}

export function flattenOutlineItems(items: OutlineItem[], expandedIds: Set<string>, depth = 0): VisibleOutlineItem[] {
    const visibleItems: VisibleOutlineItem[] = []
    for (const item of items) {
        visibleItems.push({ item, depth })
        if (item.children.length > 0 && expandedIds.has(item.id)) {
            visibleItems.push(...flattenOutlineItems(item.children, expandedIds, depth + 1))
        }
    }
    return visibleItems
}

export function flattenFolderNodes(nodes: DevScopeFileTreeNode[], expandedPaths: Set<string>, depth = 0): VisibleFolderNode[] {
    const visibleNodes: VisibleFolderNode[] = []
    for (const node of nodes) {
        const nodeKey = normalizePathKey(node.path)
        const expanded = expandedPaths.has(nodeKey)
        visibleNodes.push({ node, depth, expanded })
        if (node.type === 'directory' && expanded && Array.isArray(node.children) && node.children.length > 0) {
            visibleNodes.push(...flattenFolderNodes(node.children, expandedPaths, depth + 1))
        }
    }
    return visibleNodes
}

export function DraggablePreviewFileRow({
    node,
    depth,
    isActiveFile,
    isPreviewable,
    iconTheme,
    onOpen,
    actionMenu
}: {
    node: DevScopeFileTreeNode
    depth: number
    isActiveFile: boolean
    isPreviewable: boolean
    iconTheme: 'light' | 'dark'
    onOpen: () => void
    actionMenu?: ReactNode
}) {
    const extension = getFileExtension(node.name)
    const pointerStartRef = useRef<{ x: number; y: number } | null>(null)
    const suppressOpenRef = useRef(false)
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: `preview-file-tree:${normalizePathKey(node.path)}`,
        data: {
            type: 'preview-file-tree',
            file: { name: node.name, path: node.path },
            ext: extension
        }
    })

    return (
        <div
            ref={setNodeRef}
            className={cn(
                'group/row flex w-full items-center rounded-[4px] border text-left text-[11px] transition-colors',
                isActiveFile
                    ? 'border-transparent bg-sky-500/10 text-sky-100'
                    : 'border-transparent text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text',
                !isPreviewable && 'text-sparkle-text-muted',
                isDragging && 'z-20 cursor-grabbing opacity-80 shadow-[0_12px_28px_rgba(0,0,0,0.28)]'
            )}
            style={{
                transform: CSS.Translate.toString(transform)
            }}
        >
            <button
                type="button"
                onPointerDown={(event) => {
                    pointerStartRef.current = { x: event.clientX, y: event.clientY }
                    suppressOpenRef.current = false
                }}
                onPointerMove={(event) => {
                    const startPoint = pointerStartRef.current
                    if (!startPoint || suppressOpenRef.current) return
                    const deltaX = event.clientX - startPoint.x
                    const deltaY = event.clientY - startPoint.y
                    if (Math.hypot(deltaX, deltaY) >= 6) {
                        suppressOpenRef.current = true
                    }
                }}
                onPointerUp={() => { pointerStartRef.current = null }}
                onPointerCancel={() => { pointerStartRef.current = null }}
                onClick={(event) => {
                    if (suppressOpenRef.current || isDragging) {
                        event.preventDefault()
                        event.stopPropagation()
                        suppressOpenRef.current = false
                        return
                    }
                    onOpen()
                }}
                className="flex min-w-0 flex-1 items-center gap-1.5 rounded-l-[4px] px-1.5 py-1 text-left"
                style={{ paddingLeft: `${6 + depth * 14}px` }}
                {...attributes}
                {...listeners}
            >
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded text-sparkle-text-muted opacity-0">
                    <ChevronRight className="size-3.5" />
                </span>
                <VscodeEntryIcon
                    pathValue={node.path}
                    kind={node.type}
                    theme={iconTheme}
                    className="size-3.5 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate">{node.name}</span>
            </button>
            {actionMenu ? (
                <div className="shrink-0 pr-0.5">
                    {actionMenu}
                </div>
            ) : null}
        </div>
    )
}
