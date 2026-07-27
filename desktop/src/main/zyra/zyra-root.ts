import { existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

function hasZyraSdk(candidate: string): boolean {
    return existsSync(join(candidate, 'src', 'zyra-sdk.mjs'))
}

function walkUpForZyraRoot(start: string): string | null {
    let current = resolve(start)
    while (true) {
        if (hasZyraSdk(current)) return current
        const parent = dirname(current)
        if (parent === current) return null
        current = parent
    }
}

export function resolveZyraRoot(): string {
    // The desktop bundle/worktree that loaded this module is authoritative.
    // A parent shell may carry ZYRA_ROOT from another Zyra checkout; honoring
    // that first mixes one Electron build with another checkout's SDK/tools.
    const fromCompiledApp = walkUpForZyraRoot(__dirname)
    if (fromCompiledApp) return fromCompiledApp

    const envRoot = process.env.ZYRA_ROOT
        ? resolve(process.env.ZYRA_ROOT)
        : null
    if (envRoot && hasZyraSdk(envRoot)) return envRoot

    const fromCwd = walkUpForZyraRoot(process.cwd())
    if (fromCwd) return fromCwd

    const fromCwdParents = walkUpForZyraRoot(resolve(process.cwd(), '..', '..'))
    if (fromCwdParents) return fromCwdParents

    return resolve(process.cwd(), '..', '..')
}
