type DroppedEntry = {
    name: string
    fullPath: string
    isDirectory: boolean
    isFile: boolean
    file?: (success: (file: File) => void, failure?: (error: DOMException) => void) => void
    createReader?: () => {
        readEntries: (success: (entries: DroppedEntry[]) => void, failure?: (error: DOMException) => void) => void
    }
}

function getDroppedEntry(item: DataTransferItem): DroppedEntry | null {
    const getEntry = (item as DataTransferItem & { webkitGetAsEntry?: () => DroppedEntry | null }).webkitGetAsEntry
    return getEntry?.call(item) || null
}

function readDirectoryEntries(entry: DroppedEntry): Promise<DroppedEntry[]> {
    if (!entry.createReader) return Promise.resolve([])
    const reader = entry.createReader()
    const entries: DroppedEntry[] = []

    return new Promise((resolve, reject) => {
        const readNextBatch = () => reader.readEntries(batch => {
            if (batch.length === 0) {
                resolve(entries)
                return
            }
            entries.push(...batch)
            readNextBatch()
        }, reject)
        readNextBatch()
    })
}

async function findFirstFile(entry: DroppedEntry): Promise<{ file: File; fullPath: string } | null> {
    if (entry.isFile && entry.file) {
        const file = await new Promise<File>((resolve, reject) => entry.file?.(resolve, reject))
        return { file, fullPath: entry.fullPath }
    }
    if (!entry.isDirectory) return null

    for (const child of await readDirectoryEntries(entry)) {
        const found = await findFirstFile(child)
        if (found) return found
    }
    return null
}

function resolveDirectoryPath(filePath: string, fileRelativePath: string, folderName: string): string {
    const separator = filePath.includes('\\') ? '\\' : '/'
    const absoluteFilePath = filePath.replace(/[\\/]/g, separator)
    const relativeFilePath = fileRelativePath.replace(/^\/+/, '').replace(/[\\/]/g, separator)
    const suffix = `${separator}${relativeFilePath}`

    if (!absoluteFilePath.toLowerCase().endsWith(suffix.toLowerCase())) {
        throw new Error('Could not locate the dropped folder. Use the folder picker instead.')
    }

    const parentPath = absoluteFilePath.slice(0, -suffix.length).replace(/[\\/]+$/, '')
    return parentPath ? `${parentPath}${separator}${folderName}` : `${separator}${folderName}`
}

export async function resolveDroppedProjectFolders(
    items: DataTransferItem[],
    getPathForFile: (file: File) => string
): Promise<string[]> {
    const folders = items.map(getDroppedEntry).filter((entry): entry is DroppedEntry => Boolean(entry?.isDirectory))
    if (folders.length === 0) throw new Error('Drop a folder here, or click to choose one.')

    const paths: string[] = []
    for (const folder of folders) {
        const firstFile = await findFirstFile(folder)
        if (!firstFile) throw new Error(`“${folder.name}” is empty. Use the folder picker to add it.`)
        const filePath = getPathForFile(firstFile.file)
        if (!filePath) throw new Error('Could not read that folder. Use the folder picker instead.')
        paths.push(resolveDirectoryPath(filePath, firstFile.fullPath, folder.name))
    }

    return Array.from(new Set(paths))
}
