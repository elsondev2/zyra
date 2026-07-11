import type { FileTreeNode } from './types'
import { mergeDirectoryChildren as mergeDirectoryChildrenBase } from '@/lib/filesystem/fileTreeMutations'

export function formatFileSize(bytes?: number): string {
    if (!bytes) return '-'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function countChildren(node: FileTreeNode): { files: number; folders: number } {
    let files = 0
    let folders = 0

    if (node.children) {
        for (const child of node.children) {
            if (child.type === 'directory') {
                folders++
            } else {
                files++
            }
        }
    }

    return { files, folders }
}

export function buildDirectoryChildInfoMap(
    nodes: FileTreeNode[]
): Map<string, { files: number; folders: number }> {
    const infoMap = new Map<string, { files: number; folders: number }>()
    const stack: FileTreeNode[] = [...nodes]

    while (stack.length > 0) {
        const node = stack.pop()
        if (!node || node.type !== 'directory') continue
        infoMap.set(node.path, countChildren(node))
        if (node.children) {
            for (const child of node.children) {
                if (child.type === 'directory') {
                    stack.push(child)
                }
            }
        }
    }

    return infoMap
}

export function getAllFolderPaths(nodes: FileTreeNode[]): string[] {
    const paths: string[] = []
    for (const node of nodes) {
        if (node.type === 'directory') {
            paths.push(node.path)
            if (node.children) {
                paths.push(...getAllFolderPaths(node.children))
            }
        }
    }
    return paths
}

export function isFileTreeFullyLoaded(nodes: FileTreeNode[]): boolean {
    for (const node of nodes) {
        if (node.type !== 'directory') continue
        if (node.childrenLoaded === false) {
            return false
        }
        if (node.children && !isFileTreeFullyLoaded(node.children)) {
            return false
        }
    }
    return true
}

export function mergeDirectoryChildren(
    nodes: FileTreeNode[],
    targetPath: string,
    children: FileTreeNode[]
): FileTreeNode[] {
    return mergeDirectoryChildrenBase(nodes, targetPath, children)
}
