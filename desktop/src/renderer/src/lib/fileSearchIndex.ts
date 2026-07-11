import { fileNameMatchesQuery, getFileExtension, type ParsedFileSearchQuery } from '@/lib/utils'

export interface SearchTreeNode {
    name: string
    path: string
    type: 'file' | 'directory'
    size?: number
    isHidden?: boolean
    children?: SearchTreeNode[]
}

export interface FileSearchIndexEntry {
    path: string
    parentPath: string | null
    name: string
    nameLower: string
    type: 'file' | 'directory'
    extension: string
    isHidden: boolean
    size?: number
}

export interface FileSearchIndex {
    entries: FileSearchIndexEntry[]
    byPath: Map<string, FileSearchIndexEntry>
}

export interface SearchFileIndexOptions {
    showHidden?: boolean
    includeDirectories?: boolean
    limit?: number
}

export interface SearchFileIndexResult {
    matches: FileSearchIndexEntry[]
    visiblePathSet: Set<string>
    expandedFolderPathSet: Set<string>
}

export function buildFileSearchIndex(tree: SearchTreeNode[]): FileSearchIndex {
    const entries: FileSearchIndexEntry[] = []
    const byPath = new Map<string, FileSearchIndexEntry>()
    const stack: Array<{ node: SearchTreeNode; parentPath: string | null }> = []

    for (let i = tree.length - 1; i >= 0; i -= 1) {
        stack.push({ node: tree[i], parentPath: null })
    }

    while (stack.length > 0) {
        const item = stack.pop()
        if (!item) continue
        const { node, parentPath } = item

        const entry: FileSearchIndexEntry = {
            path: node.path,
            parentPath,
            name: node.name,
            nameLower: node.name.toLowerCase(),
            type: node.type,
            extension: node.type === 'file' ? getFileExtension(node.name) : '',
            isHidden: Boolean(node.isHidden),
            size: node.size
        }

        entries.push(entry)
        byPath.set(entry.path, entry)

        if (node.children && node.children.length > 0) {
            for (let i = node.children.length - 1; i >= 0; i -= 1) {
                stack.push({ node: node.children[i], parentPath: node.path })
            }
        }
    }

    return { entries, byPath }
}

export function searchFileIndex(
    index: FileSearchIndex,
    parsedQuery: ParsedFileSearchQuery,
    options: SearchFileIndexOptions = {}
): SearchFileIndexResult {
    const showHidden = options.showHidden ?? false
    const includeDirectories = options.includeDirectories ?? true
    const limit = options.limit ?? Number.POSITIVE_INFINITY
    const matches: FileSearchIndexEntry[] = []
    const visiblePathSet = new Set<string>()
    const expandedFolderPathSet = new Set<string>()

    const shouldIncludeEntry = (entry: FileSearchIndexEntry) => {
        if (!showHidden && entry.isHidden) return false

        if (entry.type === 'file') {
            return fileNameMatchesQuery(entry.name, parsedQuery)
        }

        if (!includeDirectories) return false
        if (parsedQuery.hasExtensionFilter || !parsedQuery.term) return false
        return entry.nameLower.includes(parsedQuery.term)
    }

    const addAncestors = (entry: FileSearchIndexEntry) => {
        let parentPath = entry.parentPath
        while (parentPath) {
            visiblePathSet.add(parentPath)
            expandedFolderPathSet.add(parentPath)
            parentPath = index.byPath.get(parentPath)?.parentPath || null
        }
    }

    for (const entry of index.entries) {
        if (!shouldIncludeEntry(entry)) continue
        matches.push(entry)
        visiblePathSet.add(entry.path)
        addAncestors(entry)

        if (entry.type === 'directory') {
            expandedFolderPathSet.add(entry.path)
        }

        if (matches.length >= limit) break
    }

    return { matches, visiblePathSet, expandedFolderPathSet }
}
