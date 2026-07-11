import { mkdir, readFile, readdir, rename, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const distDir = path.join(rootDir, 'dist')
const releasesDir = path.join(distDir, 'releases')
const unpackedDir = path.join(distDir, 'unpacked')

const releaseArtifactMatchers = [
    /^Zyra Setup (?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)\.exe$/,
    /^Zyra Setup (?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)\.exe\.blockmap$/,
    /^Zyra-Setup-(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)\.exe$/,
    /^Zyra-Setup-(?<version>\d+\.\d+\.\d+(?:-[\w.]+)?)\.exe\.blockmap$/
]

function extractVersionFromFileName(fileName) {
    for (const matcher of releaseArtifactMatchers) {
        const match = fileName.match(matcher)
        if (match?.groups?.version) return match.groups.version
    }
    return null
}

async function moveIntoVersionFolder(sourcePath, version, rootTargetDir) {
    const targetDir = path.join(rootTargetDir, `v${version}`)
    await mkdir(targetDir, { recursive: true })
    const targetPath = path.join(targetDir, path.basename(sourcePath))

    if (sourcePath === targetPath) return null

    await rename(sourcePath, targetPath)
    return targetPath
}

async function safeStat(targetPath) {
    try {
        return await stat(targetPath)
    } catch {
        return null
    }
}

async function organizeDist() {
    const moved = []
    const skipped = []

    const distEntries = await readdir(distDir, { withFileTypes: true })

    for (const entry of distEntries) {
        if (!entry.isFile()) continue
        const version = extractVersionFromFileName(entry.name)
        if (!version) continue

        const sourcePath = path.join(distDir, entry.name)
        const targetPath = await moveIntoVersionFolder(sourcePath, version, releasesDir)
        if (targetPath) {
            moved.push(targetPath)
        }
    }

    const latestYmlPath = path.join(distDir, 'latest.yml')
    const latestYmlStat = await safeStat(latestYmlPath)
    let latestVersion = null

    if (latestYmlStat?.isFile()) {
        const latestYml = await readFile(latestYmlPath, 'utf8')
        const match = latestYml.match(/^version:\s*(.+)$/m)
        latestVersion = match?.[1]?.trim() ?? null

        if (latestVersion) {
            const targetPath = await moveIntoVersionFolder(latestYmlPath, latestVersion, releasesDir)
            if (targetPath) {
                moved.push(targetPath)
            }
        }
    }

    for (const configName of ['builder-debug.yml', 'builder-effective-config.yaml']) {
        const configPath = path.join(distDir, configName)
        const configStat = await safeStat(configPath)
        if (!configStat?.isFile() || !latestVersion) continue

        const targetPath = await moveIntoVersionFolder(configPath, latestVersion, releasesDir)
        if (targetPath) moved.push(targetPath)
    }

    const winUnpackedPath = path.join(distDir, 'win-unpacked')
    const winUnpackedStat = await safeStat(winUnpackedPath)
    if (winUnpackedStat?.isDirectory() && latestVersion) {
        const targetDir = path.join(unpackedDir, `v${latestVersion}`)
        await mkdir(targetDir, { recursive: true })
        const targetPath = path.join(targetDir, 'win-unpacked')
        if (!(await safeStat(targetPath))) {
            try {
                await rename(winUnpackedPath, targetPath)
                moved.push(targetPath)
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error)
                skipped.push(`dist/win-unpacked (${message})`)
            }
        }
    }

    if (moved.length === 0 && skipped.length === 0) {
        console.log('dist already organized')
        return
    }

    if (moved.length > 0) {
        console.log(`organized ${moved.length} dist artifact(s)`)
    }
    for (const targetPath of moved) {
        console.log(path.relative(rootDir, targetPath))
    }

    if (skipped.length > 0) {
        console.log(`skipped ${skipped.length} locked artifact(s)`)
        for (const skippedEntry of skipped) {
            console.log(skippedEntry)
        }
    }
}

await organizeDist()
