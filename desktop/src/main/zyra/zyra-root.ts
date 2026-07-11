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
    const envRoot = process.env.ZYRA_ROOT
        ? resolve(process.env.ZYRA_ROOT)
        : null
    if (envRoot && hasZyraSdk(envRoot)) return envRoot

    const fromCwdParents = walkUpForZyraRoot(resolve(process.cwd(), '..', '..'))
    if (fromCwdParents) return fromCwdParents

    const fromCwd = walkUpForZyraRoot(process.cwd())
    if (fromCwd) return fromCwd

    const fromCompiledApp = walkUpForZyraRoot(__dirname)
    if (fromCompiledApp) return fromCompiledApp

    return resolve(process.cwd(), '..', '..')
}
