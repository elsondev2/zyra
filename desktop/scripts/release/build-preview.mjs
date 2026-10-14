import { spawn, execFileSync } from 'node:child_process'
import { createReadStream } from 'node:fs'
import { mkdir, readFile, writeFile, readdir, stat, copyFile, lstat, readlink, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { assertHostedInstallLocation } from './preview-install-environment.mjs'

export function previewVersion(version, runNumber) {
    const core = String(version).match(/^(\d+\.\d+\.\d+)(?:-(?:alpha|beta|dev)\.\d+)?$/)?.[1]
    if (!core || !/^[1-9]\d*$/.test(String(runNumber)) || Number(runNumber) > 65535) throw new Error('Invalid preview version/run number')
    return `${core}-dev.${runNumber}`
}

export function previewBuilderConfig(build, output) {
    const baseExclusions = (Array.isArray(build.files) ? build.files : [build.files])
        .filter(pattern => typeof pattern === 'string' && pattern.startsWith('!'))
    return {
        ...build,
        // The builder collects production dependencies separately from these
        // app files. Keep their JS/native/assets; omit compiled diagnostic maps.
        files: ['out/**/*', 'resources/**/*', 'package.json', ...baseExclusions,
            '!src/**/*', '!scripts/**/*', '!**/*.{js,cjs,mjs,css}.map'],
        appId: 'app.zyra.desktop.preview',
        productName: 'Zyra Preview',
        executableName: 'Zyra Preview',
        icon: 'resources/icon-dev.png',
        fileAssociations: [],
        protocols: [],
        publish: null,
        // Dependency source maps are diagnostic artifacts, not runtime assets.
        // Keep the staged source manifest intact and preserve native/WASM data.
        extraResources: build.extraResources?.map(resource => typeof resource === 'object'
            && /^zyra-runtime(?:\/node_modules)?$/.test(resource.to)
            ? { ...resource, filter: [...(Array.isArray(resource.filter) ? resource.filter : [resource.filter || '**/*']), resource.to.endsWith('/node_modules') ? '!**/*.{js,cjs,mjs,css}.map' : '!node_modules/**/*.{js,cjs,mjs,css}.map'] }
            : resource),
        directories: { ...build.directories, output },
        win: { ...build.win, icon: 'resources/icon-dev.ico', artifactName: 'Zyra-Preview-${version}-Windows-${arch}.${ext}' },
        // ZIP uses NSIS's checked direct extraction instead of writing the full
        // payload into 7z-out and copying every file a second time.
        nsis: { ...build.nsis, installerIcon: 'resources/icon-dev.ico', uninstallerIcon: 'resources/icon-dev.ico', include: 'build/preview-installer.nsh', differentialPackage: false, useZip: true, oneClick: true, perMachine: false, allowToChangeInstallationDirectory: false }
    }
}

export function previewRequestIdentity(env) {
    const target = env.ZYRA_BUILD_TARGET || 'windows-x64'
    const sourcePr = env.ZYRA_BUILD_SOURCE_PR || ''
    const requestId = env.ZYRA_BUILD_REQUEST_ID || ''
    if (target !== 'windows-x64') throw new Error('Unsupported dev preview target')
    if (sourcePr && !/^[1-9]\d*$/.test(sourcePr)) throw new Error('Invalid source PR number')
    if (requestId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(requestId)) throw new Error('Invalid explicit request identity')
    if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ID || '')) throw new Error('Missing workflow run identity')
    if (!/^[1-9]\d*$/.test(env.GITHUB_RUN_ATTEMPT || '1')) throw new Error('Invalid workflow run attempt')
    if (!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA || '')) throw new Error('Missing exact workflow SHA')
    return { channel: 'dev', target, sourcePr: sourcePr || null, requestId: requestId || null, runId: env.GITHUB_RUN_ID, runAttempt: env.GITHUB_RUN_ATTEMPT || '1', workflowSha: env.GITHUB_SHA }
}

const previewPackageFiles = ['package.json', 'package-lock.json', 'desktop/package.json', 'desktop/package-lock.json']
const generatedPreviewBrandingFiles = new Set([
    'desktop/resources/branding/icons/zyra-dev.png', 'desktop/resources/branding/icons/zyra-dev.ico',
    'desktop/resources/branding/icons/zyra-dev-light.png', 'desktop/resources/branding/icons/zyra-dev-light.ico',
    'desktop/resources/branding/icons/zyra-dev-dark.png', 'desktop/resources/branding/icons/zyra-dev-dark.ico',
    'desktop/resources/branding/icons/zyra-prod.png', 'desktop/resources/branding/icons/zyra-prod.ico',
    'desktop/resources/branding/icons/zyra-prod-light.png', 'desktop/resources/branding/icons/zyra-prod-light.ico',
    'desktop/resources/branding/icons/zyra-prod-dark.png', 'desktop/resources/branding/icons/zyra-prod-dark.ico',
    'desktop/resources/icon.png', 'desktop/resources/icon-dev.png', 'desktop/resources/icon.ico',
    'desktop/resources/icon-dev.ico', 'desktop/resources/icon.icns',
    ...[16, 32, 48, 64, 128, 256, 512, 1024].map(size => `desktop/resources/icons/${size}x${size}.png`)
])

function committedTree(root) {
    const format = execFileSync('git', ['rev-parse', '--show-object-format'], { cwd: root, encoding: 'utf8' }).trim()
    const entries = execFileSync('git', ['ls-tree', '-r', '-z', 'HEAD'], { cwd: root, maxBuffer: 50 * 1024 * 1024 }).toString('utf8').split('\0').filter(Boolean)
    return new Map(entries.map(entry => {
        const tab = entry.indexOf('\t')
        const metadata = entry.slice(0, tab), file = entry.slice(tab + 1)
        const [mode, type, oid] = metadata.split(' ')
        return [file, { mode, type, oid, format }]
    }))
}

function committedBlob(root, tree, file) {
    const entry = tree.get(file)
    if (!entry || entry.type !== 'blob') throw new Error(`Preview committed source is missing: ${file}`)
    return execFileSync('git', ['cat-file', 'blob', entry.oid], { cwd: root, maxBuffer: 50 * 1024 * 1024 })
}

function blobOid(bytes, format) {
    return createHash(format).update(`blob ${bytes.length}`).update(Buffer.from([0])).update(bytes).digest('hex')
}

async function expectedPreviewBrandingOutputs(root, changedFiles) {
    if (!changedFiles.length) return new Map()
    const fixture = await mkdtemp(path.join(tmpdir(), 'zyra-preview-branding-'))
    try {
        const desktop = path.join(fixture, 'desktop')
        const script = path.join(desktop, 'scripts', 'maint', 'generate_branding_assets.py')
        const source = path.join(desktop, 'resources', 'branding', 'icons', 'zyra-flat-approved-source.png')
        await mkdir(path.dirname(script), { recursive: true })
        await mkdir(path.dirname(source), { recursive: true })
        const tree = committedTree(root)
        await writeFile(script, committedBlob(root, tree, 'desktop/scripts/maint/generate_branding_assets.py'))
        await writeFile(source, committedBlob(root, tree, 'desktop/resources/branding/icons/zyra-flat-approved-source.png'))
        try {
            execFileSync('python', [script, '--icons-only', '--preview'], { cwd: desktop, stdio: 'pipe', maxBuffer: 10 * 1024 * 1024, timeout: 30_000 })
        } catch (error) {
            throw new Error(`Preview branding output verification failed: ${error.message}`)
        }
        const expected = new Map()
        for (const file of changedFiles) {
            const relative = file.slice('desktop/'.length)
            try { expected.set(file, await readFile(path.join(desktop, relative))) }
            catch { throw new Error(`Preview branding output verification failed: missing expected ${file}`) }
        }
        return expected
    } finally {
        const resolved = path.resolve(fixture)
        if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('zyra-preview-branding-')) {
            throw new Error('Refusing unsafe preview branding fixture cleanup')
        }
        await rm(resolved, { recursive: true, force: true })
    }
}

export async function validatePreviewWorktree(root, env) {
    if (!/^[a-f0-9]{40}$/.test(env.ZYRA_BUILD_SOURCE_SHA || '')
        || execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== env.ZYRA_BUILD_SOURCE_SHA) {
        throw new Error('Preview source checkout does not match requested SHA')
    }
    // Ignored files can still be build inputs (notably Vite .env.production).
    // Ask Git for collapsed ignored directories so dependency trees stay bounded.
    const ignored = execFileSync('git', ['status', '--porcelain=v1', '-z', '--ignored=matching', '--untracked-files=normal'], {cwd:root, maxBuffer:50 * 1024 * 1024}).toString('utf8').split('\0').filter(entry => entry.startsWith('!! '))
    const derivedDirectories = new Set([
        '.release/', 'desktop/.release/', 'desktop/out/', 'desktop/dist/', 'desktop/release/',
        'dist/', 'output/', 'desktop/output/', 'src/runtime/.declarations/',
        'extensions/zyra-browser-control/dist/'
    ])
    for (const entry of ignored) {
        const file = entry.slice(3)
        const dependencyDirectory = /(?:^|\/)node_modules\/$/.test(file)
        const nativeOutput = /^native\/zyra-computer-use\/(?:[^/]+\/)*(?:bin|obj)\/$/.test(file)
        if (!derivedDirectories.has(file) && !dependencyDirectory && !nativeOutput) throw new Error(`Preview source has an ignored build input: ${file}`)
    }
    const tree = committedTree(root)
    const sourceVersion = JSON.parse(committedBlob(root, tree, 'package.json').toString('utf8')).version
    const version = previewVersion(sourceVersion, env.GITHUB_RUN_NUMBER)
    const identity = previewRequestIdentity(env)
    const output = path.join(root, 'desktop', 'dist', 'previews', env.GITHUB_RUN_ID)
    const sourceDesktopPackage = JSON.parse(committedBlob(root, tree, 'desktop/package.json').toString('utf8'))
    const expectedBuilder = Buffer.from(`${JSON.stringify(previewBuilderConfig(sourceDesktopPackage.build, path.join(output, 'raw')), null, 2)}\n`)
    const expectedRequest = Buffer.from(JSON.stringify({ ...identity, sourceSha: env.ZYRA_BUILD_SOURCE_SHA,
        sourceRepository: env.ZYRA_BUILD_SOURCE_REPOSITORY, sourceVersion, version }))
    for (const [file, expected] of [['.release/preview-builder.json', expectedBuilder], ['.release/preview-request.json', expectedRequest]]) {
        let actual
        try { actual = await readFile(path.join(root, file)) } catch { throw new Error(`Preview metadata is missing: ${file}`) }
        if (!actual.equals(expected)) throw new Error(`Preview metadata differs from exact trusted derivation: ${file}`)
    }
    const expectedPackages = new Map()
    for (const file of previewPackageFiles) {
        const pkg = JSON.parse(committedBlob(root, tree, file).toString('utf8'))
        pkg.version = version
        if (pkg.packages) pkg.packages[''].version = version
        expectedPackages.set(file, Buffer.from(`${JSON.stringify(pkg, null, 4)}\n`))
    }
    const status = execFileSync('git', ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { cwd: root, maxBuffer: 50 * 1024 * 1024 })
    const entries = status.toString('utf8').split('\0').filter(Boolean)
    for (const entry of entries) {
        const indexStatus = entry[0]
        const file = entry.slice(3)
        if (entry.startsWith('?? ')) throw new Error(`Preview source has untracked files: ${file}`)
        if (indexStatus !== ' ') throw new Error(`Preview source has staged changes: ${file}`)
        // The complete tree/blob comparison below rejects content changes while
        // accepting only Git's LF/CRLF checkout conversion and derived branding.
    }
    for (const [file, expected] of expectedPackages) {
        let actual
        try { actual = await readFile(path.join(root, file)) } catch { throw new Error(`Preview package file is missing: ${file}`) }
        if (!actual.equals(expected)) throw new Error(`Preview package file differs from exact version rewrite: ${file}`)
    }
    const changedBrandingFiles = []
    for (const [file, entry] of tree) {
        if (entry.type !== 'blob') throw new Error(`Unsupported preview source tree entry: ${file}`)
        const committedOid = entry.oid
        const expected = expectedPackages.get(file)
        let actual
        try {
            const target = path.join(root, file)
            const info = await lstat(target)
            if (info.isSymbolicLink() !== (entry.mode === '120000')) throw new Error('Tracked file type changed')
            actual = info.isSymbolicLink() ? Buffer.from(await readlink(target)) : await readFile(target)
        } catch { throw new Error(`Preview tracked source file is missing: ${file}`) }
        if (expectedPackages.has(file)) {
            if (!actual.equals(expected)) throw new Error(`Preview package file differs from exact version rewrite: ${file}`)
            continue
        }
        if (blobOid(actual, entry.format) === committedOid) continue
        // Windows checkout may expand committed text to CRLF. Accept only that
        // byte-preserving EOL conversion, never normalize binary assets.
        if (entry.mode !== '120000' && !actual.subarray(0, 8000).includes(0)) {
            const lf = Buffer.from(actual.toString('latin1').replace(/\r\n/g, '\n'), 'latin1')
            if (blobOid(lf, entry.format) === committedOid) continue
        }
        if (generatedPreviewBrandingFiles.has(file)) changedBrandingFiles.push(file)
        else throw new Error(`Preview source has unexpected tracked changes: ${file}`)
    }
    const expectedBranding = await expectedPreviewBrandingOutputs(root, changedBrandingFiles)
    for (const file of changedBrandingFiles) {
        if (!(await readFile(path.join(root, file))).equals(expectedBranding.get(file))) {
            throw new Error(`Preview branding output differs from committed generator result: ${file}`)
        }
    }
}

export async function preparePreview(root, env) {
    if (!/^[a-f0-9]{40}$/.test(env.ZYRA_BUILD_SOURCE_SHA || '')) throw new Error('Preview requires an exact source SHA')
    if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]+$/.test(env.ZYRA_BUILD_SOURCE_REPOSITORY || '')) throw new Error('Invalid source repository')
    const identity = previewRequestIdentity(env)
    const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
    if (actual !== env.ZYRA_BUILD_SOURCE_SHA) throw new Error('Checked-out source does not match requested SHA')
    if (execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim()) throw new Error('Preview preparation requires a clean source checkout')
    const files = previewPackageFiles
    const packages = await Promise.all(files.map(async file => JSON.parse(await readFile(path.join(root, file), 'utf8'))))
    const sourceVersion = packages[0].version
    if (packages.some(pkg => pkg.version !== sourceVersion) || packages[1].packages[''].version !== sourceVersion || packages[3].packages[''].version !== sourceVersion) throw new Error('Preview source versions are not lockstep')
    const version = previewVersion(sourceVersion, env.GITHUB_RUN_NUMBER)
    for (const pkg of packages) { pkg.version = version; if (pkg.packages) pkg.packages[''].version = version }
    await Promise.all(files.map((file, index) => writeFile(path.join(root, file), `${JSON.stringify(packages[index], null, 4)}\n`)))
    const output = path.join(root, 'desktop', 'dist', 'previews', env.GITHUB_RUN_ID)
    await mkdir(path.join(root, '.release'), { recursive: true })
    const config = previewBuilderConfig(packages[2].build, path.join(output, 'raw'))
    await writeFile(path.join(root, '.release', 'preview-builder.json'), `${JSON.stringify(config, null, 2)}\n`)
    await writeFile(path.join(root, '.release', 'preview-request.json'), JSON.stringify({ ...identity, sourceSha: actual, sourceRepository: env.ZYRA_BUILD_SOURCE_REPOSITORY, sourceVersion, version }))
    return { version, sourceVersion, output }
}

function run(command, args, cwd, env) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, { cwd, env, stdio: 'inherit', shell: process.platform === 'win32' && /\.cmd$/.test(command) })
        child.once('error', reject)
        child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)))
    })
}

async function build(root, env) {
    assertHostedInstallLocation(process.platform, env)
    const desktop = path.join(root, 'desktop')
    const version = JSON.parse(await readFile(path.join(desktop, 'package.json'), 'utf8')).version
    const request = JSON.parse(await readFile(path.join(root, '.release', 'preview-request.json'), 'utf8'))
    const identity = previewRequestIdentity(env)
    if (version !== previewVersion(request.sourceVersion, env.GITHUB_RUN_NUMBER) || version !== request.version || request.sourceSha !== env.ZYRA_BUILD_SOURCE_SHA || request.sourceRepository !== env.ZYRA_BUILD_SOURCE_REPOSITORY || Object.entries(identity).some(([key, value]) => request[key] !== value)) throw new Error('Preview request/version identity changed after preparation')
    if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== request.sourceSha) throw new Error('Preview source checkout changed after preparation')
    const output = path.join(desktop, 'dist', 'previews', env.GITHUB_RUN_ID)
    const raw = path.join(output, 'raw')
    const upload = path.join(output, 'upload')
    const buildEnv = { ...env, ZYRA_BUILD_DISTRIBUTION: 'preview', CSC_IDENTITY_AUTO_DISCOVERY: 'false', ZYRA_EXPECT_SIGNED: '0' }
    for (const key of ['CSC_LINK', 'CSC_KEY_PASSWORD', 'APPLE_API_KEY', 'APPLE_API_KEY_CONTENT', 'APPLE_API_KEY_ID', 'APPLE_API_ISSUER', 'EVS_ACCOUNT_NAME', 'EVS_PASSWD']) delete buildEnv[key]
    await validatePreviewWorktree(root, env)
    await run('npx.cmd', ['--no-install', 'electron-vite', 'build'], desktop, buildEnv)
    await run(process.execPath, ['scripts/release/prepare-release-resources.mjs', '--platform=windows'], desktop, buildEnv)
    await validatePreviewWorktree(root, env)
    await run('npx.cmd', ['--no-install', 'electron-builder', '--win', '--x64', '--publish', 'never', '--config', '../.release/preview-builder.json'], desktop, buildEnv)
    await validatePreviewWorktree(root, env)
    await run(process.execPath, ['scripts/release/validate-packaged-app.mjs', '--platform=windows', `--version=${version}`, `--raw-dir=${raw}`, '--executable-name=Zyra Preview', '--expected-distribution=preview', `--expected-source-sha=${env.ZYRA_BUILD_SOURCE_SHA}`], desktop, buildEnv)
    await run(process.execPath, ['scripts/release/verify-platform-signature.mjs', '--platform=windows', `--version=${version}`, `--raw-dir=${raw}`, `--marker=${output}/signature.json`, '--expected-signed=false'], desktop, buildEnv)
    const installers = (await readdir(raw)).filter(name => /^Zyra-Preview-.*-Windows-x64\.exe$/.test(name))
    if (installers.length !== 1) throw new Error('Preview build did not produce exactly one installer')
    const installer = installers[0]
    console.log(`Preview Desktop archive: ${(await stat(path.join(raw, 'win-unpacked', 'resources', 'app.asar'))).size} bytes`)
    await run(process.execPath, ['scripts/release/validate-preview-install.mjs', `--installer=${path.join(raw, installer)}`, `--version=${version}`, `--source-sha=${env.ZYRA_BUILD_SOURCE_SHA}`], desktop, buildEnv)
    const hash = createHash('sha256')
    for await (const chunk of createReadStream(path.join(raw, installer))) hash.update(chunk)
    const sha256 = hash.digest('hex')
    const manifest = {
        schemaVersion: 1, distribution: 'preview', channel: 'dev', target: request.target, signed: false, version,
        source: { repository: env.ZYRA_BUILD_SOURCE_REPOSITORY, sha: env.ZYRA_BUILD_SOURCE_SHA, version: request.sourceVersion, pr: request.sourcePr },
        build: { repository: env.GITHUB_REPOSITORY, workflowSha: request.workflowSha, requestId: request.requestId, runId: request.runId, runNumber: env.GITHUB_RUN_NUMBER, runAttempt: request.runAttempt },
        installer: { name: installer, size: (await stat(path.join(raw, installer))).size, sha256 },
        profile: 'Zyra Preview', automaticUpdates: false
    }
    await mkdir(upload, { recursive: true })
    // Only the installer and provenance enter Actions storage, not unpacked resources.
    await copyFile(path.join(raw, installer), path.join(upload, installer))
    const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`
    await writeFile(path.join(upload, 'preview.json'), manifestBytes)
    await writeFile(path.join(upload, 'SHA256SUMS'), `${sha256}  ${installer}\n${createHash('sha256').update(manifestBytes).digest('hex')}  preview.json\n`)
    console.log(`Preview validated: ${version} from ${env.ZYRA_BUILD_SOURCE_SHA}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const phase = process.argv[2]
    const root = path.resolve(process.argv[3] || '.')
    if (process.env.GITHUB_ACTIONS !== 'true') throw new Error('Use the explicitly requested hosted preview workflow, not local packaging')
    if (phase === 'prepare') {
        const result = await preparePreview(root, process.env)
        console.log(`Prepared ${result.version} from ${process.env.ZYRA_BUILD_SOURCE_SHA}`)
    } else if (phase === 'validate') await validatePreviewWorktree(root, process.env)
    else if (phase === 'build') await build(root, process.env)
    else throw new Error('Expected prepare, validate or build phase')
}
