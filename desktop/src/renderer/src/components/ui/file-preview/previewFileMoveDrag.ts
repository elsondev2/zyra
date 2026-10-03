import { useCallback, useEffect, useRef, type DragEvent } from 'react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'

const FILE_MOVE_TYPE = 'application/x-zyra-file-move'
let draggedNodes: DevScopeFileTreeNode[] = []
let movePending = false

export function startPreviewFileMove(event: DragEvent, nodes: DevScopeFileTreeNode[]): boolean {
    if (movePending || nodes.length === 0) {
        event.preventDefault()
        return false
    }
    draggedNodes = nodes.slice()
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData(FILE_MOVE_TYPE, 'internal')
    return true
}

export function endPreviewFileMove() {
    draggedNodes = []
}

function pathKey(path: string): string {
    const normalized = path.replace(/\\/g, '/').replace(/\/+$/, '')
    return /^[a-z]:/i.test(normalized) || normalized.startsWith('//') ? normalized.toLowerCase() : normalized
}

export type FileMoveDestination = { path: string; name: string }

export function usePreviewFileMoveDrop(
    onMove: (nodes: DevScopeFileTreeNode[], destination: FileMoveDestination) => Promise<void>
) {
    const highlightRef = useRef<{ element: HTMLElement; outline: string } | null>(null)
    const clearHighlight = useCallback(() => {
        const highlighted = highlightRef.current
        if (highlighted) highlighted.element.style.outline = highlighted.outline
        highlightRef.current = null
    }, [])

    useEffect(() => {
        window.addEventListener('dragend', clearHighlight)
        return () => {
            window.removeEventListener('dragend', clearHighlight)
            clearHighlight()
        }
    }, [clearHighlight])

    const resolveTarget = (event: DragEvent<HTMLElement>) => {
        if (movePending || !draggedNodes.length || !event.dataTransfer.types.includes(FILE_MOVE_TYPE)) return null
        const element = (event.target as HTMLElement).closest<HTMLElement>('[data-file-drop-path]')
        if (!element || !event.currentTarget.contains(element)) return null
        const path = element.dataset.fileDropPath
        if (!path) return null
        const key = pathKey(path)
        if (draggedNodes.some((node) => {
            const source = pathKey(node.path)
            return key === source || (node.type === 'directory' && key.startsWith(`${source}/`))
        })) return null
        return { element, destination: { path, name: element.dataset.fileDropName || path } }
    }

    return {
        onDragOver: (event: DragEvent<HTMLElement>) => {
            clearHighlight()
            const target = resolveTarget(event)
            if (!target) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'move'
            highlightRef.current = { element: target.element, outline: target.element.style.outline }
            target.element.style.outline = '1px solid var(--accent-primary)'
        },
        onDragLeave: (event: DragEvent<HTMLElement>) => {
            if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) clearHighlight()
        },
        onDrop: (event: DragEvent<HTMLElement>) => {
            clearHighlight()
            const target = resolveTarget(event)
            if (!target) return
            event.preventDefault()
            event.stopPropagation()
            const sources = draggedNodes
            endPreviewFileMove()
            movePending = true
            // The owner reports per-file errors and refreshes both explorer panes.
            void onMove(sources, target.destination).finally(() => { movePending = false })
        }
    }
}
