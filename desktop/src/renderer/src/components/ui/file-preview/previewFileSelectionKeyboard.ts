import type { KeyboardEvent } from 'react'
import type { DevScopeFileTreeNode } from '@shared/contracts/devscope-project-contracts'
import type { FileActionsMenuItem } from '@/components/ui/FileActionsMenu'

export function handleFileSelectionShortcut(
    event: KeyboardEvent<HTMLElement>,
    nodes: DevScopeFileTreeNode[],
    selectedPaths: ReadonlySet<string>,
    replaceSelection: (paths: Set<string>) => void,
    getNodeActions: (node: DevScopeFileTreeNode) => FileActionsMenuItem[],
    getSelectionActions?: (nodes: DevScopeFileTreeNode[]) => FileActionsMenuItem[]
): void {
    if (event.defaultPrevented || event.nativeEvent.isComposing) return
    if ((event.target as HTMLElement).closest('input, textarea, [contenteditable="true"], .monaco-editor')) return
    const consume = () => { event.preventDefault(); event.stopPropagation() }
    if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'a') {
        consume()
        replaceSelection(new Set(nodes.map((node) => node.path)))
        return
    }
    if (event.key === 'Escape' && selectedPaths.size) {
        consume()
        replaceSelection(new Set())
        return
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const selected = nodes.filter((node) => selectedPaths.has(node.path))
    if (!selected.length) return
    const deleting = event.key === 'Delete' || event.key === 'Backspace'
    const renaming = event.key === 'F2' && selected.length === 1
    if (!deleting && !renaming) return
    consume()
    if (event.repeat) return
    const actions = selected.length === 1 ? getNodeActions(selected[0]) : getSelectionActions?.(selected) || []
    const action = actions.find((item) => item.id === (renaming ? 'rename' : selected.length === 1 ? 'delete' : 'delete-selected'))
    if (action && !action.disabled) void action.onSelect()
}
