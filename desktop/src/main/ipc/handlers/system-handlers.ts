import log from 'electron-log'
import si from 'systeminformation'

export async function handleGetFileSystemRoots() {
    log.info('IPC: getFileSystemRoots')

    try {
        const fsList = await si.fsSize().catch(() => [])
        const roots = Array.from(new Set(
            fsList
                .map((entry: any) => entry.mount)
                .filter((mount: string) => !!mount)
                .map((mount: string) => {
                    if (process.platform === 'win32') {
                        return mount.endsWith('\\') ? mount : `${mount}\\`
                    }
                    return mount
                })
        )).sort()

        if (roots.length > 0) {
            return { success: true, roots }
        }

        return { success: true, roots: [process.platform === 'win32' ? 'C:\\' : '/'] }
    } catch (err: any) {
        log.error('Failed to get file system roots:', err)
        return { success: false, error: err.message }
    }
}
