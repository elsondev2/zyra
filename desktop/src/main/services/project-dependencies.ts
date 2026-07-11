import { access } from 'fs/promises'
import { spawn } from 'child_process'
import { join } from 'path'

export type DependencyInstallStatus = {
    installed: boolean | null
    checked: boolean
    ecosystem: 'node' | 'unknown'
    totalPackages: number
    installedPackages: number
    missingPackages: number
    missingDependencies?: string[]
    missingSample?: string[]
    reason?: string
}

export type DependencyInstallManager = 'npm' | 'pnpm' | 'yarn' | 'bun'

export type ProjectPackageJson = {
    packageManager?: string
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
}

export async function pathExists(pathValue: string): Promise<boolean> {
    try {
        await access(pathValue)
        return true
    } catch {
        return false
    }
}

export async function detectNodeDependencyInstallStatus(
    projectPath: string,
    packageJson: ProjectPackageJson | null
): Promise<DependencyInstallStatus> {
    const dependencyNames = Array.from(new Set([
        ...Object.keys(packageJson?.dependencies || {}),
        ...Object.keys(packageJson?.devDependencies || {})
    ].filter((name) => name.trim().length > 0)))

    if (dependencyNames.length === 0) {
        return {
            installed: true,
            checked: true,
            ecosystem: 'node',
            totalPackages: 0,
            installedPackages: 0,
            missingPackages: 0
        }
    }

    const nodeModulesPath = join(projectPath, 'node_modules')
    if (!(await pathExists(nodeModulesPath))) {
        return {
            installed: false,
            checked: true,
            ecosystem: 'node',
            totalPackages: dependencyNames.length,
            installedPackages: 0,
            missingPackages: dependencyNames.length,
            missingDependencies: dependencyNames,
            missingSample: dependencyNames.slice(0, 5),
            reason: 'node_modules is missing'
        }
    }

    const checks = await Promise.all(
        dependencyNames.map(async (name) => {
            const packagePath = join(nodeModulesPath, ...name.split('/'))
            const exists = await pathExists(packagePath)
            return { name, exists }
        })
    )

    const missing = checks.filter((item) => !item.exists).map((item) => item.name)
    const installedPackages = dependencyNames.length - missing.length

    return {
        installed: missing.length === 0,
        checked: true,
        ecosystem: 'node',
        totalPackages: dependencyNames.length,
        installedPackages,
        missingPackages: missing.length,
        missingDependencies: missing,
        missingSample: missing.slice(0, 5)
    }
}

export async function detectDependencyInstallManager(
    projectPath: string,
    packageJson: ProjectPackageJson | null
): Promise<DependencyInstallManager> {
    const packageManagerField = String(packageJson?.packageManager || '').trim().toLowerCase()
    if (packageManagerField.startsWith('pnpm')) return 'pnpm'
    if (packageManagerField.startsWith('yarn')) return 'yarn'
    if (packageManagerField.startsWith('bun')) return 'bun'
    if (packageManagerField.startsWith('npm')) return 'npm'

    if (await pathExists(join(projectPath, 'pnpm-lock.yaml'))) return 'pnpm'
    if (await pathExists(join(projectPath, 'yarn.lock'))) return 'yarn'
    if (await pathExists(join(projectPath, 'bun.lockb')) || await pathExists(join(projectPath, 'bun.lock'))) return 'bun'
    return 'npm'
}

function installCommandForManager(manager: DependencyInstallManager): { command: string; args: string[] } {
    if (manager === 'pnpm') return { command: 'pnpm', args: ['install'] }
    if (manager === 'yarn') return { command: 'yarn', args: ['install'] }
    if (manager === 'bun') return { command: 'bun', args: ['install'] }
    return { command: 'npm', args: ['install'] }
}

export async function runInstallProcess(
    projectPath: string,
    manager: DependencyInstallManager
): Promise<{ success: boolean; output: string; error: string | null; code: number | null }> {
    const { command, args } = installCommandForManager(manager)
    return await new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: projectPath,
            shell: process.platform === 'win32',
            windowsHide: true,
            env: process.env
        })

        const outputBuffer: string[] = []
        const appendOutput = (chunk: Buffer | string) => {
            outputBuffer.push(String(chunk || ''))
            if (outputBuffer.length > 220) {
                outputBuffer.splice(0, outputBuffer.length - 220)
            }
        }

        child.stdout?.on('data', appendOutput)
        child.stderr?.on('data', appendOutput)

        child.on('error', (error: Error) => {
            const message = error?.message || `Failed to start ${command}.`
            resolve({
                success: false,
                output: outputBuffer.join(''),
                error: message,
                code: null
            })
        })

        child.on('close', (code) => {
            const mergedOutput = outputBuffer.join('')
            if (code === 0) {
                resolve({
                    success: true,
                    output: mergedOutput,
                    error: null,
                    code: 0
                })
                return
            }

            resolve({
                success: false,
                output: mergedOutput,
                error: `${command} install failed with exit code ${code ?? 'unknown'}.`,
                code: typeof code === 'number' ? code : null
            })
        })
    })
}
