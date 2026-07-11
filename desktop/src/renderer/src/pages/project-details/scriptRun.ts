export type ScriptIntent = 'server' | 'build' | 'test' | 'lint' | 'generic'

export interface ScriptIntentPrediction {
    intent: ScriptIntent
    confidence: number
}

export interface ScriptIntentContext {
    frameworks?: string[]
    markers?: string[]
}

export interface ScriptRunDraft {
    port?: number
    exposeNetwork?: boolean
    extraArgs?: string
    envOverrides?: Record<string, string>
}

export type PackageScriptRunner = 'node' | 'npm' | 'pnpm' | 'yarn' | 'bun'
export type PackageScriptRunnerPreference = 'auto' | PackageScriptRunner

const SERVER_SCRIPT_NAME_PATTERN = /(^|:)(dev|serve|start|preview|watch|host|web|electron|desktop|api|backend)/i
const SERVER_SCRIPT_COMMAND_PATTERN = /\b(vite|next\s+dev|nuxt|astro|webpack(?:-dev-server)?|react-scripts\s+start|serve|nodemon|ts-node-dev|concurrently|electron(?:\s+\.)?|expo\s+start|parcel|ng\s+serve|remix|svelte-kit)\b/i
const BUILD_SCRIPT_NAME_PATTERN = /(^|:)(build|bundle|compile|dist|release|prod|deploy)/i
const BUILD_SCRIPT_COMMAND_PATTERN = /\b(vite\s+build|next\s+build|nuxt\s+build|astro\s+build|webpack|rollup|tsc\b|esbuild\b|swc\b)\b/i
const TEST_SCRIPT_NAME_PATTERN = /(^|:)(test|spec|e2e|unit|integration|ci:test|coverage|vitest|jest|playwright|cypress)/i
const TEST_SCRIPT_COMMAND_PATTERN = /\b(jest|vitest|mocha|ava|tap|cypress|playwright|karma)\b/i
const LINT_SCRIPT_NAME_PATTERN = /(^|:)(lint|format|prettier|check|typecheck)/i
const LINT_SCRIPT_COMMAND_PATTERN = /\b(eslint|prettier|stylelint|biome|xo|standard|tsc\s+--noemit)\b/i

export const SCRIPT_INTENT_LABELS: Record<ScriptIntent, string> = {
    server: 'Server',
    build: 'Build',
    test: 'Test',
    lint: 'Lint',
    generic: 'General'
}

export const SCRIPT_INTENT_BADGE_CLASSES: Record<ScriptIntent, string> = {
    server: 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300',
    build: 'border-cyan-500/30 bg-cyan-500/15 text-cyan-300',
    test: 'border-amber-500/30 bg-amber-500/15 text-amber-300',
    lint: 'border-violet-500/30 bg-violet-500/15 text-violet-300',
    generic: 'border-white/15 bg-white/10 text-white/70'
}

function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

export function detectScriptIntentWithConfidence(
    name: string,
    command: string,
    context: ScriptIntentContext = {}
): ScriptIntentPrediction {
    const normalizedName = name.toLowerCase().trim()
    const normalizedCommand = command.toLowerCase().trim()
    const scores: Record<'server' | 'build' | 'test' | 'lint', number> = {
        server: 0,
        build: 0,
        test: 0,
        lint: 0
    }

    if (SERVER_SCRIPT_NAME_PATTERN.test(normalizedName)) scores.server += 3
    if (SERVER_SCRIPT_COMMAND_PATTERN.test(normalizedCommand)) scores.server += 4
    if (normalizedCommand.includes('--watch') || normalizedCommand.includes(' --hot')) scores.server += 1

    if (BUILD_SCRIPT_NAME_PATTERN.test(normalizedName)) scores.build += 3
    if (BUILD_SCRIPT_COMMAND_PATTERN.test(normalizedCommand)) scores.build += 4

    if (TEST_SCRIPT_NAME_PATTERN.test(normalizedName)) scores.test += 3
    if (TEST_SCRIPT_COMMAND_PATTERN.test(normalizedCommand)) scores.test += 4

    if (LINT_SCRIPT_NAME_PATTERN.test(normalizedName)) scores.lint += 3
    if (LINT_SCRIPT_COMMAND_PATTERN.test(normalizedCommand)) scores.lint += 4

    if (/\b(dev|start|serve)\b/.test(normalizedName)) scores.server += 1
    if (/\bbuild\b/.test(normalizedName)) scores.build += 1
    if (/\b(test|spec|e2e)\b/.test(normalizedName)) scores.test += 1
    if (/\b(lint|format)\b/.test(normalizedName)) scores.lint += 1

    const frameworks = new Set((context.frameworks || []).map((framework) => framework.toLowerCase()))
    const markers = new Set((context.markers || []).map((marker) => marker.toLowerCase()))
    const hasWebFrameworkContext =
        frameworks.has('nextjs') ||
        frameworks.has('vite') ||
        frameworks.has('nuxt') ||
        frameworks.has('astro') ||
        frameworks.has('svelte') ||
        markers.has('vite.config.ts') ||
        markers.has('vite.config.js') ||
        markers.has('next.config.js') ||
        markers.has('next.config.ts') ||
        markers.has('next.config.mjs')

    if (hasWebFrameworkContext && /\b(dev|start|serve)\b/.test(normalizedName)) {
        scores.server += 1
    }
    if (hasWebFrameworkContext && /\bbuild\b/.test(normalizedName)) {
        scores.build += 1
    }

    if (/\b(jest|vitest|playwright|cypress)\b/.test(normalizedCommand)) {
        scores.test += 2
    }
    if (/\b(eslint|prettier|stylelint|biome)\b/.test(normalizedCommand)) {
        scores.lint += 2
    }

    const ranked = (Object.entries(scores) as Array<[keyof typeof scores, number]>)
        .sort((a, b) => b[1] - a[1])
    const [topIntent, topScore] = ranked[0]
    const secondScore = ranked[1]?.[1] ?? 0

    if (topScore <= 0) {
        return { intent: 'generic', confidence: 0.4 }
    }

    const margin = topScore - secondScore
    const baseConfidence = 0.52 + topScore * 0.06 + margin * 0.08
    const confidence = clampNumber(baseConfidence, 0.5, 0.98)

    return { intent: topIntent, confidence }
}

export function detectPackageScriptRunner(
    markers: string[] = [],
    preference: PackageScriptRunnerPreference = 'auto'
): PackageScriptRunner {
    if (preference !== 'auto') return preference
    if (markers.includes('pnpm-lock.yaml')) return 'pnpm'
    if (markers.includes('yarn.lock')) return 'yarn'
    if (markers.includes('bun.lockb') || markers.includes('bun.lock')) return 'bun'
    return 'npm'
}

export function getScriptCommand(scriptName: string, runner: PackageScriptRunner): string {
    if (runner === 'node') return `node --run ${scriptName}`
    if (runner === 'yarn') return `yarn ${scriptName}`
    if (runner === 'pnpm') return `pnpm run ${scriptName}`
    if (runner === 'bun') return `bun run ${scriptName}`
    return `npm run ${scriptName}`
}

export function appendScriptArgsForRunner(baseCommand: string, args: string, runner: PackageScriptRunner): string {
    const trimmedArgs = args.trim()
    if (!trimmedArgs) return baseCommand
    if (runner === 'node' || runner === 'npm' || runner === 'pnpm') {
        return `${baseCommand} -- ${trimmedArgs}`
    }
    return `${baseCommand} ${trimmedArgs}`
}

export function buildServerCliArgs(scriptCommand: string, options: ScriptRunDraft): string[] {
    const normalized = scriptCommand.toLowerCase()
    if (!normalized) return []

    // `concurrently` scripts usually need per-command flags; keep these env-only by default.
    if (/\bconcurrently\b/.test(normalized)) return []

    const args: string[] = []
    const hasNextDev = /\bnext\s+dev\b/.test(normalized)
    const hasCommonDevServer = /\b(vite|nuxt|astro|webpack(?:-dev-server)?|parcel|ng\s+serve|svelte-kit|remix)\b/.test(normalized)

    if (options.port) {
        if (hasNextDev) {
            args.push(`--port ${options.port}`)
        } else if (hasCommonDevServer) {
            args.push(`--port ${options.port}`)
        }
    }

    if (options.exposeNetwork) {
        if (hasNextDev) {
            args.push('--hostname 0.0.0.0')
        } else if (hasCommonDevServer) {
            args.push('--host 0.0.0.0')
        }
    }

    return args
}

export function parseEnvOverrideInput(rawValue: string): { envOverrides: Record<string, string>; error?: string } {
    const envOverrides: Record<string, string> = {}
    const trimmed = rawValue.trim()
    if (!trimmed) return { envOverrides }

    const lines = rawValue.split(/\r?\n/)
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const line = lines[lineIndex].trim()
        if (!line || line.startsWith('#')) continue

        const separatorIndex = line.indexOf('=')
        if (separatorIndex < 1) {
            return {
                envOverrides,
                error: `Environment override line ${lineIndex + 1} must use KEY=VALUE format.`
            }
        }

        const key = line.slice(0, separatorIndex).trim()
        const value = line.slice(separatorIndex + 1)
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) {
            return {
                envOverrides,
                error: `Invalid environment variable name "${key}" on line ${lineIndex + 1}.`
            }
        }

        envOverrides[key] = value
    }

    return { envOverrides }
}

export function applyShellEnvOverrides(
    baseCommand: string,
    shell: 'powershell' | 'cmd',
    envOverrides: Record<string, string>
): string {
    const entries = Object.entries(envOverrides).filter(([, value]) => value.length > 0)
    if (entries.length === 0) return baseCommand

    if (shell === 'cmd') {
        const cmdPrefix = entries
            .map(([key, value]) => `set "${key}=${value.replace(/"/g, '\\"')}"`)
            .join(' && ')
        return `${cmdPrefix} && ${baseCommand}`
    }

    const powershellPrefix = entries
        .map(([key, value]) => `$env:${key}='${value.replace(/'/g, "''")}'`)
        .join('; ')
    return `${powershellPrefix}; ${baseCommand}`
}
