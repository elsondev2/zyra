import { existsSync, renameSync } from 'node:fs'

export function backupAssistantDatabaseSet(filePath: string, backupPath: string): string[] {
    const preserved: string[] = []
    for (const suffix of ['', '-wal', '-shm']) {
        const source = `${filePath}${suffix}`
        if (!existsSync(source)) continue
        const target = `${backupPath}${suffix}`
        renameSync(source, target)
        preserved.push(target)
    }
    return preserved
}
