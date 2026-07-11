import type { FileTreeNode } from './types'
import { normalizeFileSystemPath } from './projectDetailsPageHelpers'

export function pathsMatch(left: string, right: string): boolean {
    return normalizeFileSystemPath(left) === normalizeFileSystemPath(right)
}

function resolvePathSeparator(pathValue: string): string {
    return pathValue.includes('\\') ? '\\' : '/'
}

export function joinFileSystemPath(directory: string, name: string): string {
    const rawDir = String(directory || '')
    const separator = resolvePathSeparator(rawDir)
    const trimmed = rawDir.replace(/[\\/]+$/, '')
    if (!trimmed) return `${separator}${name}`
    return `${trimmed}${separator}${name}`
}

function replacePathPrefix(pathValue: string, oldPrefix: string, newPrefix: string): string {
    if (pathValue === oldPrefix) return newPrefix
    if (pathValue.startsWith(oldPrefix)) return `${newPrefix}${pathValue.slice(oldPrefix.length)}`
    return pathValue
}

export function updateNodePathPrefix(node: FileTreeNode, oldPrefix: string, newPrefix: string): FileTreeNode {
    const nextPath = replacePathPrefix(node.path, oldPrefix, newPrefix)
    const nextChildren = node.children
        ? node.children.map((child) => updateNodePathPrefix(child, oldPrefix, newPrefix))
        : node.children

    if (nextPath === node.path && nextChildren === node.children) return node
    return { ...node, path: nextPath, children: nextChildren }
}

export function extractNodeByPath(
    nodes: FileTreeNode[],
    targetPath: string
): { nodes: FileTreeNode[]; removed: FileTreeNode | null } {
    let removed: FileTreeNode | null = null
    let changed = false

    const nextNodes = nodes.reduce<FileTreeNode[]>((acc, node) => {
        if (pathsMatch(node.path, targetPath)) {
            removed = node
            changed = true
            return acc
        }

        if (node.type === 'directory' && node.children) {
            const result = extractNodeByPath(node.children, targetPath)
            if (result.removed) removed = result.removed
            if (result.nodes !== node.children) {
                changed = true
                acc.push({ ...node, children: result.nodes })
                return acc
            }
        }

        acc.push(node)
        return acc
    }, [])

    return { nodes: changed ? nextNodes : nodes, removed }
}

export function insertNodeAtDirectory(
    nodes: FileTreeNode[],
    destinationDirectory: string,
    nodeToInsert: FileTreeNode,
    projectRootPath: string
): { nodes: FileTreeNode[]; inserted: boolean } {
    if (projectRootPath && pathsMatch(destinationDirectory, projectRootPath)) {
        if (nodes.some((node) => pathsMatch(node.path, nodeToInsert.path))) {
            return { nodes, inserted: false }
        }
        return { nodes: [...nodes, nodeToInsert], inserted: true }
    }

    let inserted = false
    const visit = (items: FileTreeNode[]): FileTreeNode[] => {
        let localChanged = false
        const nextItems = items.map((node) => {
            if (node.type !== 'directory') return node

            if (pathsMatch(node.path, destinationDirectory)) {
                const children = node.children ? [...node.children] : []
                if (!children.some((child) => pathsMatch(child.path, nodeToInsert.path))) {
                    children.push(nodeToInsert)
                    inserted = true
                    localChanged = true
                    const nextNode: FileTreeNode = { ...node, children }
                    if (node.childrenLoaded === false) nextNode.childrenLoaded = false
                    return nextNode
                }
            }

            if (node.children) {
                const nextChildren = visit(node.children)
                if (nextChildren !== node.children) {
                    localChanged = true
                    return { ...node, children: nextChildren }
                }
            }

            return node
        })

        return localChanged ? nextItems : items
    }

    const nextNodes = visit(nodes)
    return { nodes: inserted ? nextNodes : nodes, inserted }
}

export function renameNodeByPath(
    nodes: FileTreeNode[],
    targetPath: string,
    nextName: string,
    nextPath: string
): FileTreeNode[] {
    let changed = false

    const visit = (items: FileTreeNode[]): FileTreeNode[] => {
        let localChanged = false
        const nextItems = items.map((node) => {
            if (pathsMatch(node.path, targetPath)) {
                const updatedNode = updateNodePathPrefix(node, node.path, nextPath)
                localChanged = true
                changed = true
                return { ...updatedNode, name: nextName }
            }

            if (node.type === 'directory' && node.children) {
                const nextChildren = visit(node.children)
                if (nextChildren !== node.children) {
                    localChanged = true
                    return { ...node, children: nextChildren }
                }
            }

            return node
        })

        return localChanged ? nextItems : items
    }

    const nextNodes = visit(nodes)
    return changed ? nextNodes : nodes
}

function buildCopyName(sourceName: string, copyIndex: number): string {
    if (copyIndex <= 0) return sourceName
    const dotIndex = sourceName.lastIndexOf('.')
    const base = dotIndex > 0 ? sourceName.slice(0, dotIndex) : sourceName
    const ext = dotIndex > 0 ? sourceName.slice(dotIndex) : ''
    const suffix = copyIndex === 1 ? ' Copy' : ` Copy ${copyIndex}`
    return `${base}${suffix}${ext}`
}

function findDirectoryNode(nodes: FileTreeNode[], targetPath: string): FileTreeNode | null {
    for (const node of nodes) {
        if (node.type !== 'directory') continue
        if (pathsMatch(node.path, targetPath)) return node
        if (node.children) {
            const found = findDirectoryNode(node.children, targetPath)
            if (found) return found
        }
    }
    return null
}

export function resolveOptimisticCopyName(
    sourceName: string,
    destinationDirectory: string,
    tree: FileTreeNode[],
    projectRootPath: string
): string {
    const targetChildren = projectRootPath && pathsMatch(destinationDirectory, projectRootPath)
        ? tree
        : findDirectoryNode(tree, destinationDirectory)?.children

    if (!targetChildren) return sourceName

    const existingNames = new Set(targetChildren.map((child) => child.name.toLowerCase()))
    for (let copyIndex = 0; copyIndex < 1000; copyIndex += 1) {
        const candidate = buildCopyName(sourceName, copyIndex)
        if (!existingNames.has(candidate.toLowerCase())) return candidate
    }

    return sourceName
}
