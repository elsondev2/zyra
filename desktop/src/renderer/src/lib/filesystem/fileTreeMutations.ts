interface TreeNodeLike<TNode> {
    path: string
    type: 'file' | 'directory'
    children?: TNode[]
    childrenLoaded?: boolean
    hasDirectoryChildren?: boolean
}

function normalizeTreePath(pathValue: string): string {
    return String(pathValue || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function preserveLoadedDirectoryChildren<TNode extends TreeNodeLike<TNode>>(
    nextNodes: TNode[],
    previousNodes: TNode[]
): TNode[] {
    if (nextNodes.length === 0 || previousNodes.length === 0) return nextNodes

    const previousDirectories = new Map<string, TNode>()
    const collectPreviousDirectories = (nodes: TNode[]) => {
        for (const node of nodes) {
            if (node.type !== 'directory') continue
            previousDirectories.set(normalizeTreePath(node.path), node)
            if (Array.isArray(node.children)) collectPreviousDirectories(node.children)
        }
    }
    collectPreviousDirectories(previousNodes)

    let changed = false
    const reconcile = (nodes: TNode[]): TNode[] => nodes.map((node) => {
        if (node.type !== 'directory') return node
        if (node.childrenLoaded === true && Array.isArray(node.children)) {
            const nextChildren = reconcile(node.children)
            if (nextChildren.every((child, index) => child === node.children?.[index])) return node
            changed = true
            return { ...node, children: nextChildren } as TNode
        }

        const previous = previousDirectories.get(normalizeTreePath(node.path))
        if (previous?.childrenLoaded !== true || !Array.isArray(previous.children)) return node
        changed = true
        return {
            ...node,
            children: previous.children,
            childrenLoaded: true,
            hasDirectoryChildren: previous.children.some((child) => child.type === 'directory')
        } as TNode
    })

    const reconciled = reconcile(nextNodes)
    return changed ? reconciled : nextNodes
}

export function mergeDirectoryChildren<TNode extends TreeNodeLike<TNode>>(
    nodes: TNode[],
    targetPath: string,
    children: TNode[]
): TNode[] {
    let changed = false
    const targetPathKey = normalizeTreePath(targetPath)

    const visit = (items: TNode[]): TNode[] => {
        let localChanged = false

        const nextItems = items.map((node) => {
            if (node.type === 'directory' && normalizeTreePath(node.path) === targetPathKey) {
                localChanged = true
                changed = true
                return {
                    ...node,
                    children,
                    childrenLoaded: true,
                    hasDirectoryChildren: children.some((child) => child.type === 'directory')
                }
            }

            if (node.type === 'directory' && node.children) {
                const nextChildren = visit(node.children)
                if (nextChildren !== node.children) {
                    localChanged = true
                    return {
                        ...node,
                        children: nextChildren
                    }
                }
            }

            return node
        })

        return localChanged ? nextItems : items
    }

    const nextNodes = visit(nodes)
    return changed ? nextNodes : nodes
}
