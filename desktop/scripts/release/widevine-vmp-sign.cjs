const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

function run(executable, args, cwd) {
    return new Promise((resolve, reject) => {
        const child = spawn(executable, args, { cwd, env: process.env, stdio: 'inherit', shell: false })
        child.on('error', reject)
        child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`Widevine VMP signing exited with code ${code ?? 'unknown'}`)))
    })
}

async function signWidevinePackage(context, expectedPhase) {
    if (process.env.ZYRA_EXPECT_SIGNED !== '1') return
    const platform = context.electronPlatformName
    if ((expectedPhase === 'before-code-sign' && platform !== 'darwin') || (expectedPhase === 'after-code-sign' && platform !== 'win32')) return
    if (!process.env.EVS_ACCOUNT_NAME || !process.env.EVS_PASSWD) {
        throw new Error('Production Widevine playback requires EVS_ACCOUNT_NAME and EVS_PASSWD for VMP signing.')
    }
    await run(process.env.PYTHON || 'python', [
        '-m',
        'castlabs_evs.vmp',
        '--no-ask',
        'sign-pkg',
        context.appOutDir
    ], context.appOutDir)
    const resourcesDirectory = platform === 'darwin'
        ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
        : path.join(context.appOutDir, 'resources')
    fs.mkdirSync(resourcesDirectory, { recursive: true })
    fs.writeFileSync(path.join(resourcesDirectory, 'zyra-widevine-vmp.json'), JSON.stringify({
        schemaVersion: 1,
        productionVmp: true,
        platform
    }))
}

module.exports = { signWidevinePackage }
