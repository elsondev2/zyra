import { app } from 'electron'
import { existsSync } from 'node:fs'
import os from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

export function isDesktopTuiDispatch(argv = process.argv): boolean {
    return argv.includes('--tui')
}

export async function dispatchDesktopTui(argv = process.argv): Promise<number> {
    const marker = argv.indexOf('--tui')
    const forwarded = marker >= 0 ? argv.slice(marker + 1) : []
    const runtimeRoot = join(process.resourcesPath, 'zyra-runtime')
    const entry = join(runtimeRoot, 'bin', 'zyra.mjs')
    if (!existsSync(entry)) throw new Error(`Bundled Zyra TUI was not found at ${entry}.`)
    const packagedNode = join(process.resourcesPath, 'zyra-node', process.platform === 'win32' ? 'node.exe' : 'node')
    const usePackagedNode = existsSync(packagedNode)
    const executable = usePackagedNode ? packagedNode : process.execPath
    return new Promise<number>((resolve, reject) => {
        const child = spawn(executable, [entry, ...forwarded], {
            cwd: process.cwd(),
            stdio: 'inherit',
            windowsHide: false,
            env: {
                ...process.env,
                ZYRA_ROOT: runtimeRoot,
                ZYRA_DATA_ROOT: os.homedir(),
                ZYRA_CALLER_CWD: process.cwd(),
                ZYRA_DISTRIBUTION: 'desktop-bundle',
                ...(!usePackagedNode && process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {})
            }
        })
        child.once('error', reject)
        child.once('exit', (code) => resolve(code ?? 1))
    })
}

export function desktopTuiLauncherCommand(): { executable: string; args: string[] } {
    return { executable: app.getPath('exe'), args: ['--tui'] }
}
