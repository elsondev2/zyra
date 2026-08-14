import { spawn } from 'node:child_process'
import { mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { normalizeReleasePlatform, platformReleaseContract } from './release-contract.mjs'

function arg(name, fallback = null) {
    const inline = process.argv.slice(2).find((value) => value.startsWith(`--${name}=`))
    if (inline) return inline.slice(name.length + 3)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

async function walk(root, relative = '') {
    const entries = await readdir(path.join(root, relative), { withFileTypes: true })
    const results = []
    for (const entry of entries) {
        const child = path.join(relative, entry.name)
        if (entry.isDirectory()) {
            results.push({ path: child, directory: true })
            results.push(...await walk(root, child))
        } else if (entry.isFile()) {
            results.push({ path: child, directory: false })
        }
    }
    return results
}

function run(executable, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            cwd: options.cwd,
            env: { ...process.env, ...options.env },
            stdio: ['ignore', 'pipe', 'pipe'],
            shell: false
        })
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (chunk) => { stdout += String(chunk) })
        child.stderr.on('data', (chunk) => { stderr += String(chunk) })
        child.on('error', reject)
        child.on('exit', (code) => {
            if (code === 0) resolve({ stdout: stdout.trim(), stderr: stderr.trim() })
            else reject(new Error(`${executable} ${args.join(' ')} failed (${code ?? 'unknown'}): ${stderr || stdout}`))
        })
    })
}

const platform = normalizeReleasePlatform(arg('platform', process.platform))
const rawDirectory = path.resolve(arg('raw-dir', '.'))
const markerPath = path.resolve(arg('marker', path.join(rawDirectory, `.verification-${platform}.json`)))
const expectedSigned = arg('expected-signed', process.env.ZYRA_EXPECT_SIGNED || 'false') === 'true'
    || arg('expected-signed', process.env.ZYRA_EXPECT_SIGNED || '0') === '1'
const entries = await walk(rawDirectory)
const result = {
    schemaVersion: 1,
    platform,
    signed: false,
    notarized: false,
    checks: []
}

if (expectedSigned && platform === 'windows') {
    const version = arg('version')
    if (!version) throw new Error('Cannot verify Windows signing without a release version')
    const installerName = platformReleaseContract(version, platform).primaryUpdateArtifact
    const installer = entries.find((entry) => !entry.directory && path.basename(entry.path) === installerName)
    if (!installer) throw new Error(`Cannot verify Windows signing: ${installerName} was not found`)
    const target = path.join(rawDirectory, installer.path)
    const verification = await run('powershell.exe', [
        '-NoLogo',
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        "$signature = Get-AuthenticodeSignature -LiteralPath $env:ZYRA_SIGNATURE_TARGET; if ($signature.Status -ne 'Valid') { throw \"Authenticode status: $($signature.Status) $($signature.StatusMessage)\" }; Write-Output $signature.SignerCertificate.Subject"
    ], { env: { ZYRA_SIGNATURE_TARGET: target } })
    result.signed = true
    result.checks.push({ name: 'authenticode', target: path.basename(target), output: verification.stdout })
}

if (expectedSigned && platform === 'macos') {
    const application = entries.find((entry) => entry.directory && entry.path.endsWith('Zyra.app'))
    if (!application) throw new Error('Cannot verify macOS signing: Zyra.app was not found')
    const target = path.join(rawDirectory, application.path)
    const codesign = await run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', target])
    const gatekeeper = await run('spctl', ['--assess', '--type', 'execute', '--verbose=2', target])
    const stapler = await run('xcrun', ['stapler', 'validate', target])
    result.signed = true
    result.notarized = true
    result.checks.push(
        { name: 'codesign', target: path.basename(target), output: codesign.stderr || codesign.stdout },
        { name: 'gatekeeper', target: path.basename(target), output: gatekeeper.stderr || gatekeeper.stdout },
        { name: 'notarization-staple', target: path.basename(target), output: stapler.stdout || stapler.stderr }
    )
}

if (expectedSigned && platform === 'linux') {
    throw new Error('Linux release integrity is verified with SHA256SUMS, not a platform signature')
}
if (!expectedSigned) {
    result.checks.push({ name: 'unsigned-rehearsal', output: 'Signing verification was not requested.' })
}

await mkdir(path.dirname(markerPath), { recursive: true })
await writeFile(markerPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8')
console.log(`Signature verification marker: ${markerPath}`)
