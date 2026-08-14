import { createHash } from 'node:crypto'
import { readFile, readdir, lstat } from 'node:fs/promises'
import path from 'node:path'

export const RUNTIME_SOURCE_DIRECTORIES = Object.freeze(['src', 'prompts', 'agents', 'workflows', 'bin'])
export const RUNTIME_OPTIONAL_DIRECTORIES = Object.freeze(['commands', 'themes'])
export const RUNTIME_METADATA_FILES = Object.freeze(['package.json', 'package-lock.json'])
export const RUNTIME_MANIFEST_FILE = 'zyra-runtime-manifest.json'

const REQUIRED_RUNTIME_FILES = Object.freeze([
    'src/zyra-sdk.mjs',
    'src/zyra-ui-bridge.mjs',
    'src/agent-server/main.mjs',
    'bin/zyra.mjs',
    'prompts/zyra_system_prompt.md',
    'prompts/inspect-project.md',
    'agents/bug-analyzer.md',
    'agents/code-reviewer.md',
    'workflows/review-changes.mjs'
])

async function exists(target) {
    try {
        await lstat(target)
        return true
    } catch {
        return false
    }
}

async function listFiles(root, relativeDirectory) {
    const absoluteDirectory = path.join(root, relativeDirectory)
    const entries = await readdir(absoluteDirectory, { withFileTypes: true })
    const files = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
        const relativePath = path.posix.join(relativeDirectory.replaceAll('\\', '/'), entry.name)
        if (entry.isSymbolicLink()) {
            throw new Error(`Runtime staging does not accept source symlinks: ${relativePath}`)
        }
        if (entry.isDirectory()) {
            files.push(...await listFiles(root, relativePath))
        } else if (entry.isFile()) {
            files.push(relativePath)
        }
    }
    return files
}

async function hashFile(file) {
    return createHash('sha256').update(await readFile(file)).digest('hex')
}

export async function getRuntimeSourceDirectories(root) {
    const optional = []
    for (const directory of RUNTIME_OPTIONAL_DIRECTORIES) {
        if (await exists(path.join(root, directory))) optional.push(directory)
    }
    return [...RUNTIME_SOURCE_DIRECTORIES, ...optional]
}

export async function buildRuntimeManifest(runtimeRoot) {
    const packageJson = JSON.parse(await readFile(path.join(runtimeRoot, 'package.json'), 'utf8'))
    const packageLock = JSON.parse(await readFile(path.join(runtimeRoot, 'package-lock.json'), 'utf8'))
    const sourceDirectories = await getRuntimeSourceDirectories(runtimeRoot)
    const sourceFiles = []
    for (const directory of sourceDirectories) {
        for (const relativePath of await listFiles(runtimeRoot, directory)) {
            const absolutePath = path.join(runtimeRoot, ...relativePath.split('/'))
            const stats = await lstat(absolutePath)
            sourceFiles.push({
                path: relativePath,
                size: stats.size,
                sha256: await hashFile(absolutePath)
            })
        }
    }
    for (const relativePath of RUNTIME_METADATA_FILES) {
        const absolutePath = path.join(runtimeRoot, relativePath)
        const stats = await lstat(absolutePath)
        sourceFiles.push({
            path: relativePath,
            size: stats.size,
            sha256: await hashFile(absolutePath)
        })
    }
    sourceFiles.sort((left, right) => left.path.localeCompare(right.path))

    const dependencies = Object.fromEntries(
        Object.entries(packageJson.dependencies || {}).sort(([left], [right]) => left.localeCompare(right))
    )
    return {
        schemaVersion: 1,
        name: packageJson.name,
        version: packageJson.version,
        lockfileVersion: packageLock.lockfileVersion,
        sourceDirectories,
        dependencies,
        sourceFiles
    }
}

function packageNameForSpecifier(specifier) {
    if (specifier.startsWith('node:') || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('file:')) return null
    const parts = specifier.split('/')
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]
}

async function validateSourceImports(runtimeRoot, sourceFiles, dependencies) {
    const sourceSet = new Set(sourceFiles.map((entry) => entry.path))
    const externalImports = new Set()
    const declarationPattern = /^\s*(?:import|export)\s+(?:[^'";]*?\sfrom\s*)?["']([^"']+)["']/gm
    const dynamicPattern = /\b(?:import\s*\(|import\.meta\.resolve\s*\()\s*["']([^"']+)["']/g

    for (const entry of sourceFiles.filter((item) => item.path.startsWith('src/') && item.path.endsWith('.mjs'))) {
        const source = await readFile(path.join(runtimeRoot, ...entry.path.split('/')), 'utf8')
        const specifiers = [
            ...source.matchAll(declarationPattern),
            ...source.matchAll(dynamicPattern)
        ].map((match) => match[1])
        for (const specifier of specifiers) {
            if (specifier.startsWith('.')) {
                const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(entry.path), specifier))
                if (!sourceSet.has(resolved)) {
                    throw new Error(`Staged runtime import is missing: ${entry.path} -> ${specifier}`)
                }
                continue
            }
            const packageName = packageNameForSpecifier(specifier)
            if (packageName) externalImports.add(packageName)
        }
    }

    for (const packageName of externalImports) {
        if (!(packageName in dependencies)) {
            throw new Error(`Runtime source imports undeclared production dependency: ${packageName}`)
        }
    }
}

export async function validateRuntimeStage(runtimeRoot, options = {}) {
    const expectedVersion = options.expectedVersion || null
    const requireDependencies = options.requireDependencies !== false
    const manifestPath = path.join(runtimeRoot, RUNTIME_MANIFEST_FILE)
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const rebuiltManifest = await buildRuntimeManifest(runtimeRoot)

    if (JSON.stringify(manifest) !== JSON.stringify(rebuiltManifest)) {
        throw new Error('Staged runtime source does not match zyra-runtime-manifest.json')
    }
    if (expectedVersion && manifest.version !== expectedVersion) {
        throw new Error(`Staged runtime version ${manifest.version} does not match expected ${expectedVersion}`)
    }

    const packageJson = JSON.parse(await readFile(path.join(runtimeRoot, 'package.json'), 'utf8'))
    const packageLock = JSON.parse(await readFile(path.join(runtimeRoot, 'package-lock.json'), 'utf8'))
    if (packageJson.version !== packageLock.version || packageJson.version !== packageLock.packages?.['']?.version) {
        throw new Error('Staged package.json and package-lock.json versions are not lockstep')
    }
    if (packageJson.name !== packageLock.name || packageJson.name !== packageLock.packages?.['']?.name) {
        throw new Error('Staged package identity does not match package-lock.json')
    }
    if (packageJson.license !== 'Apache-2.0') {
        throw new Error(`Staged runtime must declare Apache-2.0; got ${packageJson.license || 'missing'}`)
    }

    const sourceFileSet = new Set(manifest.sourceFiles.map((entry) => entry.path))
    for (const requiredFile of REQUIRED_RUNTIME_FILES) {
        if (!sourceFileSet.has(requiredFile)) throw new Error(`Staged runtime is missing required file: ${requiredFile}`)
    }
    await validateSourceImports(runtimeRoot, manifest.sourceFiles, manifest.dependencies)

    if (requireDependencies) {
        for (const dependency of Object.keys(manifest.dependencies)) {
            const dependencyPackage = path.join(runtimeRoot, 'node_modules', ...dependency.split('/'), 'package.json')
            if (!(await exists(dependencyPackage))) {
                throw new Error(`Staged runtime dependency is missing: ${dependency}`)
            }
        }
    }

    return manifest
}
