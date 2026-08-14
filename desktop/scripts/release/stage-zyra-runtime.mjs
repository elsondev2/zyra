import { spawn } from 'node:child_process'
import { chmod, copyFile, lstat, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    buildRuntimeManifest,
    getRuntimeSourceDirectories,
    RUNTIME_MANIFEST_FILE,
    RUNTIME_METADATA_FILES,
    validateRuntimeStage
} from './runtime-contract.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..', '..')
const repositoryRoot = path.resolve(desktopRoot, '..')

function parseArgs(argv) {
    const result = { installDependencies: true }
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index]
        if (value === '--skip-dependencies') {
            result.installDependencies = false
            continue
        }
        if (value === '--output') {
            result.output = argv[++index]
            continue
        }
        if (value.startsWith('--output=')) result.output = value.slice('--output='.length)
    }
    return result
}

async function copyTree(sourceRoot, targetRoot, relativePath) {
    const source = path.join(sourceRoot, relativePath)
    const target = path.join(targetRoot, relativePath)
    const sourceStats = await lstat(source)
    if (sourceStats.isSymbolicLink()) throw new Error(`Runtime source symlinks are not supported: ${relativePath}`)
    if (sourceStats.isDirectory()) {
        await mkdir(target, { recursive: true })
        const entries = await readdir(source, { withFileTypes: true })
        for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
            await copyTree(sourceRoot, targetRoot, path.join(relativePath, entry.name))
        }
        return
    }
    if (!sourceStats.isFile()) throw new Error(`Unsupported runtime source entry: ${relativePath}`)
    await mkdir(path.dirname(target), { recursive: true })
    await copyFile(source, target)
    await chmod(target, sourceStats.mode & 0o777)
}

function run(executable, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd,
            stdio: 'inherit',
            shell: process.platform === 'win32' && executable.toLowerCase().endsWith('.cmd')
        })
        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`${executable} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
        })
    })
}

const args = parseArgs(process.argv.slice(2))
const output = path.resolve(desktopRoot, args.output || path.join('.release', 'zyra-runtime'))
const temporaryOutput = `${output}.tmp-${process.pid}`
const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
const desktopPackage = JSON.parse(await readFile(path.join(desktopRoot, 'package.json'), 'utf8'))
if (rootPackage.version !== desktopPackage.version) {
    throw new Error(`Root/Desktop versions are not lockstep: ${rootPackage.version} != ${desktopPackage.version}`)
}

await rm(temporaryOutput, { recursive: true, force: true })
await mkdir(temporaryOutput, { recursive: true })

try {
    const sourceDirectories = await getRuntimeSourceDirectories(repositoryRoot)
    for (const directory of sourceDirectories) {
        await copyTree(repositoryRoot, temporaryOutput, directory)
    }
    for (const metadataFile of RUNTIME_METADATA_FILES) {
        await copyTree(repositoryRoot, temporaryOutput, metadataFile)
    }

    const manifest = await buildRuntimeManifest(temporaryOutput)
    await writeFile(
        path.join(temporaryOutput, RUNTIME_MANIFEST_FILE),
        `${JSON.stringify(manifest, null, 2)}\n`,
        'utf8'
    )

    if (args.installDependencies) {
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        await run(npm, [
            'ci',
            '--omit=dev',
            '--no-audit',
            '--no-fund'
        ], temporaryOutput)
    }

    await validateRuntimeStage(temporaryOutput, {
        expectedVersion: rootPackage.version,
        requireDependencies: args.installDependencies
    })
    await rm(output, { recursive: true, force: true })
    await mkdir(path.dirname(output), { recursive: true })
    await rename(temporaryOutput, output)
    console.log(`Staged Zyra runtime ${rootPackage.version}: ${path.relative(repositoryRoot, output)}`)
} catch (error) {
    await rm(temporaryOutput, { recursive: true, force: true })
    throw error
}
