import { spawn } from 'node:child_process'
import { mkdir, readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
    collectPlatformReleaseAssets,
    normalizeReleasePlatform
} from './release-contract.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..', '..')
const repositoryRoot = path.resolve(desktopRoot, '..')

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

function run(executable, args, cwd, env = process.env) {
    return new Promise((resolve, reject) => {
        const useShell = process.platform === 'win32' && /\.(?:cmd|bat)$/i.test(executable)
        const child = spawn(executable, args, { cwd, env, stdio: 'inherit', shell: useShell })
        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) resolve()
            else reject(new Error(`${executable} ${args.join(' ')} exited with code ${code ?? 'unknown'}`))
        })
    })
}

const platform = normalizeReleasePlatform(arg('platform', process.platform))
const hostPlatform = normalizeReleasePlatform(process.platform)
if (platform !== hostPlatform) {
    throw new Error(`Desktop packages for ${platform} must be built on a native ${platform} host (current: ${hostPlatform}).`)
}

const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
const desktopPackage = JSON.parse(await readFile(path.join(desktopRoot, 'package.json'), 'utf8'))
if (rootPackage.version !== desktopPackage.version) {
    throw new Error(`Root/Desktop versions are not lockstep: ${rootPackage.version} != ${desktopPackage.version}`)
}
const version = desktopPackage.version
const unpacked = arg('dir', 'false') === 'true'
const releaseRoot = path.resolve(desktopRoot, arg('output', path.join('dist', 'releases', `v${version}`, platform)))
const rawDirectory = path.join(releaseRoot, 'raw')
const uploadDirectory = path.join(releaseRoot, 'upload')
const verificationMarker = path.join(releaseRoot, '.verification', `${platform}.json`)
const expectedSigned = !unpacked && process.env.ZYRA_EXPECT_SIGNED === '1'

if (expectedSigned && platform === 'windows' && (!process.env.CSC_LINK || !process.env.CSC_KEY_PASSWORD)) {
    throw new Error('Signed Windows packaging requires CSC_LINK and CSC_KEY_PASSWORD')
}
if (expectedSigned && platform === 'macos') {
    for (const name of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER']) {
        if (!process.env[name]) throw new Error(`Signed/notarized macOS packaging requires ${name}`)
    }
}

await rm(releaseRoot, { recursive: true, force: true })
await mkdir(rawDirectory, { recursive: true })

if (arg('skip-branding', 'false') !== 'true') {
    await run('python', [path.join('scripts', 'maint', 'generate_branding_assets.py'), '--icons-only'], desktopRoot)
    await run('python', [path.join('scripts', 'test-branding-assets.py')], desktopRoot)
}
if (arg('skip-build', 'false') !== 'true') {
    const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
    await run(npx, ['--no-install', 'electron-vite', 'build'], desktopRoot)
}
if (arg('skip-prepare', 'false') !== 'true') {
    await run(process.execPath, [
        path.join(scriptDirectory, 'prepare-release-resources.mjs'),
        `--platform=${platform}`
    ], desktopRoot)
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const builderArgs = [
    '--no-install',
    'electron-builder',
    platform === 'windows' ? '--win' : platform === 'macos' ? '--mac' : '--linux',
    platform === 'macos' ? '--universal' : '--x64',
    ...(unpacked ? ['--dir'] : []),
    '--publish', 'never',
    `--config.directories.output=${rawDirectory}`
]
if (platform === 'macos') builderArgs.push(`--config.mac.notarize=${expectedSigned ? 'true' : 'false'}`)

const builderEnvironment = {
    ...process.env,
    ...(expectedSigned ? {} : { CSC_IDENTITY_AUTO_DISCOVERY: 'false' })
}
await run(npx, builderArgs, desktopRoot, builderEnvironment)
await run(process.execPath, [
    path.join(scriptDirectory, 'validate-packaged-app.mjs'),
    `--platform=${platform}`,
    `--version=${version}`,
    `--raw-dir=${rawDirectory}`
], desktopRoot)
if (unpacked) {
    console.log(`Built unpacked Zyra ${version} for ${platform}: ${rawDirectory}`)
} else {
    await collectPlatformReleaseAssets({
        sourceDirectory: rawDirectory,
        outputDirectory: uploadDirectory,
        version,
        platform
    })
    await run(process.execPath, [
        path.join(scriptDirectory, 'verify-platform-signature.mjs'),
        `--platform=${platform}`,
        `--raw-dir=${rawDirectory}`,
        `--marker=${verificationMarker}`,
        `--expected-signed=${expectedSigned ? 'true' : 'false'}`
    ], desktopRoot)

    console.log(`Packaged Zyra ${version} for ${platform}.`)
    console.log(`Upload assets: ${uploadDirectory}`)
    console.log(`Verification: ${verificationMarker}`)
}
