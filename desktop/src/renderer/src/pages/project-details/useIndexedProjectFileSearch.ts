import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { parseFileSearchQuery } from '@/lib/utils'
import type { FileTreeNode } from './types'

type IndexedPathEntry = {
    path: string
    parentPath: string | null
    name: string
    type: 'file' | 'directory'
    extension: string
    size?: number
    isHidden: boolean
}

function sortTreeNodes(nodes: FileTreeNode[]): FileTreeNode[] {
    return [...nodes]
        .sort((left, right) => {
            if (left.type !== right.type) return left.type === 'directory' ? -1 : 1
            return left.name.localeCompare(right.name)
        })
        .map((node) => ({
            ...node,
            children: node.children ? sortTreeNodes(node.children) : node.children
        }))
}

function collectFolderPaths(nodes: FileTreeNode[], result = new Set<string>()): Set<string> {
    for (const node of nodes) {
        if (node.type !== 'directory') continue
        result.add(node.path)
        if (node.children?.length) {
            collectFolderPaths(node.children, result)
        }
    }
    return result
}

function buildIndexedSearchTree(
    projectRootPath: string,
    entries: IndexedPathEntry[],
    ancestors: IndexedPathEntry[]
): FileTreeNode[] {
    const allEntries = new Map<string, IndexedPathEntry>()
    for (const entry of [...ancestors, ...entries]) {
        allEntries.set(entry.path, entry)
    }

    const nodes = new Map<string, FileTreeNode>()
    for (const entry of allEntries.values()) {
        nodes.set(entry.path, {
            name: entry.name,
            path: entry.path,
            type: entry.type,
            size: entry.size,
            isHidden: entry.isHidden,
            children: entry.type === 'directory' ? [] : undefined,
            childrenLoaded: entry.type === 'directory'
        })
    }

    const rootNodes: FileTreeNode[] = []
    const entriesByDepth = Array.from(allEntries.values()).sort((left, right) => left.path.length - right.path.length)

    for (const entry of entriesByDepth) {
        if (entry.path === projectRootPath) continue
        const node = nodes.get(entry.path)
        if (!node) continue

        const parentPath = entry.parentPath
        if (!parentPath || parentPath === projectRootPath || !nodes.has(parentPath)) {
            rootNodes.push(node)
            continue
        }

        const parentNode = nodes.get(parentPath)
        if (parentNode?.children) {
            parentNode.children.push(node)
        } else {
            rootNodes.push(node)
        }
    }

    return sortTreeNodes(rootNodes)
}

export function useIndexedProjectFileSearch({
    projectRootPath,
    fileSearch,
    showHidden
}: {
    projectRootPath: string
    fileSearch: string
    showHidden: boolean
}) {
    const deferredFileSearch = useDeferredValue(fileSearch)
    const parsedFileSearch = useMemo(() => parseFileSearchQuery(deferredFileSearch), [deferredFileSearch])
    const hasFileSearch = deferredFileSearch.trim().length > 0
    const [indexedSearchTree, setIndexedSearchTree] = useState<FileTreeNode[] | null>(null)

    useEffect(() => {
        if (!projectRootPath || !hasFileSearch) {
            setIndexedSearchTree(null)
            return
        }

        let cancelled = false
        void window.devscope.searchIndexedPaths({
            scopePath: projectRootPath,
            term: parsedFileSearch.term,
            extensionFilters: parsedFileSearch.extension ? [parsedFileSearch.extension] : [],
            limit: 420,
            includeFiles: true,
            includeDirectories: true,
            showHidden
        }).then((result) => {
            if (cancelled) return
            if (!result?.success) {
                setIndexedSearchTree([])
                return
            }
            const nextTree = buildIndexedSearchTree(projectRootPath, result.entries || [], result.ancestors || [])
            setIndexedSearchTree(nextTree)
        }).catch(() => {
            if (!cancelled) {
                setIndexedSearchTree([])
            }
        })

        return () => {
            cancelled = true
        }
    }, [hasFileSearch, parsedFileSearch.extension, parsedFileSearch.term, projectRootPath, showHidden])

    const indexedSearchExpandedFolders = useMemo(() => {
        if (!indexedSearchTree) return new Set<string>()
        return collectFolderPaths(indexedSearchTree)
    }, [indexedSearchTree])

    return {
        hasFileSearch,
        parsedFileSearch,
        indexedSearchTree,
        indexedSearchExpandedFolders
    }
}
