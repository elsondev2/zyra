import { shell } from 'electron'
import { access, cp, lstat, mkdir, open as fsOpen, readFile, readdir, rename, rm, stat, writeFile } from 'fs/promises'
import { basename, dirname, join, parse, relative, resolve, sep } from 'path'
import log from 'electron-log'
import { checkIsGitRepo, getGitStatus, type GitFileStatus } from '../../inspectors/git'
import { invalidateScanProjectsCache } from '../../services/project-discovery-service'
import {
    handleCreateFileSystemItem,
    handleDeleteFileSystemItem,
    handleMoveFileSystemItem,
    handlePasteFileSystemItem,
    handleRenameFileSystemItem,
    handleWriteTextFile,
    pathExists
} from './file-tree-write-handlers'

export {
    handleWriteTextFile,
    handleRenameFileSystemItem,
    handleCreateFileSystemItem,
    handleDeleteFileSystemItem,
    handlePasteFileSystemItem,
    handleMoveFileSystemItem
} from './file-tree-write-handlers'

interface FileTreeNode {
    name: string
    path: string
    type: 'file' | 'directory'
    size?: number
    children?: FileTreeNode[]
    childrenLoaded?: boolean
    isHidden: boolean
    gitStatus?: GitFileStatus
}

const PREVIEW_MAX_BYTES = 2 * 1024 * 1024
const BINARY_DETECTION_BYTES = 4096

function normalizePathForComparison(pathValue: string): string {
    const normalized = resolve(String(pathValue || ''))
    return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function isLikelyBinaryBuffer(buffer: Buffer): boolean {
    if (buffer.length === 0) return false

    let suspicious = 0
    for (let i = 0; i < buffer.length; i++) {
        const byte = buffer[i]
        if (byte === 0) return true
        const isControl = byte < 32 && byte !== 9 && byte !== 10 && byte !== 13
        if (isControl) suspicious += 1
    }

    return suspicious / buffer.length > 0.2
}

export async function handleGetFileTree(
    _event: Electron.IpcMainInvokeEvent,
    projectPath: string,
    options?: {
        showHidden?: boolean
        maxDepth?: number
        rootPath?: string
        includeGitStatus?: boolean
        includeFileSize?: boolean
    }
) {
    log.info('IPC: getFileTree', projectPath, options)

    const showHidden = options?.showHidden ?? false
    const maxDepth = options?.maxDepth ?? 20
    const includeGitStatus = options?.includeGitStatus ?? true
    const includeFileSize = options?.includeFileSize ?? true
    const resolvedProjectPath = resolve(projectPath)
    const resolvedRootPath = resolve(options?.rootPath || projectPath)

    try {
        const normalizedProjectPath = normalizePathForComparison(resolvedProjectPath)
        const normalizedRootPath = normalizePathForComparison(resolvedRootPath)
        const rootPathPrefix = process.platform === 'win32'
            ? `${normalizedProjectPath}\\`
            : `${normalizedProjectPath}/`

        if (
            normalizedRootPath !== normalizedProjectPath
            && !normalizedRootPath.startsWith(rootPathPrefix)
        ) {
            return { success: false, error: 'Requested path is outside the project root.' }
        }

        await access(resolvedRootPath)
        const rootStats = await lstat(resolvedRootPath)
        if (!rootStats.isDirectory()) {
            return { success: false, error: 'Requested path is not a directory.' }
        }

        let gitStatusMap: Record<string, GitFileStatus> = {}
        if (includeGitStatus) {
            try {
                if (await checkIsGitRepo(resolvedProjectPath)) {
                    gitStatusMap = await getGitStatus(resolvedProjectPath)
                }
            } catch {
                // Ignore git errors.
            }
        }

        async function readDirRec(currentPath: string, depth: number): Promise<FileTreeNode[]> {
            if (maxDepth >= 0 && depth > maxDepth) return []

            const entries = await readdir(currentPath, { withFileTypes: true })
            const nodes = await Promise.all(entries.map(async (entry) => {
                const isHiddenEntry = entry.name.startsWith('.')
                if (!showHidden && isHiddenEntry) return null
                if (entry.name === 'node_modules' || entry.name === '.git') return null

                const fullPath = join(currentPath, entry.name)
                const relativePath = relative(resolvedProjectPath, fullPath).replace(/\\/g, '/')
                const status = gitStatusMap[relativePath] || gitStatusMap[fullPath]

                if (entry.isDirectory()) {
                    const shouldLoadChildren = maxDepth < 0 || depth < maxDepth
                    const children = shouldLoadChildren
                        ? await readDirRec(fullPath, depth + 1)
                        : undefined
                    return {
                        name: entry.name,
                        path: fullPath,
                        type: 'directory',
                        children,
                        childrenLoaded: shouldLoadChildren,
                        isHidden: isHiddenEntry,
                        gitStatus: status
                    } satisfies FileTreeNode
                } else if (entry.isFile()) {
                    if (!includeFileSize) {
                        return {
                            name: entry.name,
                            path: fullPath,
                            type: 'file',
                            isHidden: isHiddenEntry,
                            gitStatus: status
                        } satisfies FileTreeNode
                    }

                    try {
                        const stats = await stat(fullPath)
                        return {
                            name: entry.name,
                            path: fullPath,
                            type: 'file',
                            size: stats.size,
                            isHidden: isHiddenEntry,
                            gitStatus: status
                        } satisfies FileTreeNode
                    } catch {
                        // Ignore unreadable file metadata.
                        return null
                    }
                }
                return null
            }))

            const filteredNodes = nodes.filter((node): node is NonNullable<typeof node> => node !== null)

            filteredNodes.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
                return a.name.localeCompare(b.name)
            })

            return filteredNodes
        }

        const tree = await readDirRec(resolvedRootPath, 0)
        return { success: true, tree }
    } catch (err: any) {
        log.error('Failed to get file tree:', err)
        return { success: false, error: err.message }
    }
}

export async function handleReadFileContent(_event: Electron.IpcMainInvokeEvent, filePath: string) {
    log.info('IPC: readFileContent', filePath)

    try {
        await access(filePath)
        const stats = await stat(filePath)
        const size = stats.size

        const fileHandle = await fsOpen(filePath, 'r')
        try {
            const probeBytes = Math.min(BINARY_DETECTION_BYTES, size)
            const probeBuffer = Buffer.alloc(probeBytes)
            if (probeBytes > 0) {
                await fileHandle.read(probeBuffer, 0, probeBytes, 0)
            }

            if (isLikelyBinaryBuffer(probeBuffer.subarray(0, probeBytes))) {
                return {
                    success: false,
                    error: 'Binary files cannot be previewed safely in text mode.',
                    isBinary: true,
                    size
                }
            }

            const previewBytes = Math.min(size, PREVIEW_MAX_BYTES)
            const previewBuffer = Buffer.alloc(previewBytes)
            if (previewBytes > 0) {
                await fileHandle.read(previewBuffer, 0, previewBytes, 0)
            }

            const content = previewBuffer.toString('utf-8')
            const truncated = size > PREVIEW_MAX_BYTES

            return {
                success: true,
                content,
                size,
                previewBytes,
                truncated,
                modifiedAt: stats.mtimeMs
            }
        } finally {
            await fileHandle.close().catch(() => undefined)
        }
    } catch (err: any) {
        log.error('Failed to read file:', err)
        return { success: false, error: err.message }
    }
}

export async function handleReadTextFileFull(_event: Electron.IpcMainInvokeEvent, filePath: string) {
    log.info('IPC: readTextFileFull', filePath)

    try {
        await access(filePath)
        const fileStats = await stat(filePath)

        const fileHandle = await fsOpen(filePath, 'r')
        try {
            const probeBytes = Math.min(BINARY_DETECTION_BYTES, fileStats.size)
            const probeBuffer = Buffer.alloc(probeBytes)
            if (probeBytes > 0) {
                await fileHandle.read(probeBuffer, 0, probeBytes, 0)
            }

            if (isLikelyBinaryBuffer(probeBuffer.subarray(0, probeBytes))) {
                return {
                    success: false,
                    error: 'Binary files cannot be edited in text mode.',
                    isBinary: true,
                    size: fileStats.size
                }
            }
        } finally {
            await fileHandle.close().catch(() => undefined)
        }

        const fullText = await readFile(filePath, 'utf-8')
        return {
            success: true,
            content: fullText,
            size: fileStats.size,
            modifiedAt: fileStats.mtimeMs
        }
    } catch (err: any) {
        log.error('Failed to read full text file:', err)
        return { success: false, error: err.message }
    }
}

export async function handleGetPathInfo(_event: Electron.IpcMainInvokeEvent, targetPath: string) {
    log.info('IPC: getPathInfo', targetPath)

    try {
        const normalizedTargetPath = String(targetPath || '').trim()
        if (!normalizedTargetPath) {
            return { success: false, error: 'Path is required.' }
        }

        const resolvedTargetPath = resolve(normalizedTargetPath)

        if (!(await pathExists(resolvedTargetPath))) {
            return {
                success: true,
                path: resolvedTargetPath,
                name: basename(resolvedTargetPath),
                exists: false,
                type: null
            }
        }

        const targetStats = await lstat(resolvedTargetPath)
        return {
            success: true,
            path: resolvedTargetPath,
            name: basename(resolvedTargetPath),
            exists: true,
            type: targetStats.isDirectory() ? 'directory' : 'file'
        }
    } catch (err: any) {
        log.error('Failed to get path info:', err)
        return { success: false, error: err.message }
    }
}
