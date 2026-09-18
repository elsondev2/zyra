import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { build } from 'vite'
import { resolveConfig as resolveElectronViteConfig } from 'electron-vite'

const desktopRoot = path.resolve(import.meta.dirname, '..')
const configPath = path.join(desktopRoot, 'electron.vite.config.ts')
const nodeFirstPluginName = 'zyra:main-node-first-package-entries'

async function put(root, file, content) {
    const target = path.join(root, file)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, content)
}

async function createFixture(root) {
    await put(root, 'package.json', '{"type":"module"}')
    await put(root, 'node_modules/@xterm/headless/package.json', JSON.stringify({
        name: '@xterm/headless', main: 'lib-headless/xterm-headless.js', module: 'lib/xterm.mjs'
    }))
    await put(root, 'node_modules/@xterm/headless/lib-headless/xterm-headless.js', "module.exports = { Terminal: class Terminal { constructor() { this.kind = 'headless-cjs' } } }\n")
    // This stale browser entry is deliberately absent. The old electron-vite
    // preset resolves it before main unless the post-preset policy is present.
    await put(root, 'node_modules/@xterm/addon-serialize/package.json', JSON.stringify({
        name: '@xterm/addon-serialize', main: 'lib/addon-serialize.js', module: 'lib/addon-serialize.mjs'
    }))
    await put(root, 'node_modules/@xterm/addon-serialize/lib/addon-serialize.js', "module.exports = { SerializeAddon: class SerializeAddon { constructor() { this.kind = 'serialize-cjs' } } }\n")
    await put(root, 'node_modules/@xterm/addon-serialize/lib/addon-serialize.mjs', "export class SerializeAddon { constructor() { this.kind = 'serialize-esm' } }\n")
    await put(root, 'gateway-entry.mjs', [
        "import xterm from '@xterm/headless'",
        "import serialize from '@xterm/addon-serialize'",
        'const { Terminal } = xterm, { SerializeAddon } = serialize',
        'export const gatewayExports = { terminal: new Terminal().kind, serialize: new SerializeAddon().kind }'
    ].join('\n'))
}

async function configuredMainBuild(root, outDir, includeNodeFirstPolicy) {
    const resolved = await resolveElectronViteConfig({
        // Electron-Vite writes its bundled temporary config beside this root;
        // use the installed desktop root so its imports remain resolvable.
        root: desktopRoot,
        configFile: configPath,
        mode: 'production',
        logLevel: 'error',
        build: {
            outDir,
            emptyOutDir: true,
            rollupOptions: {
                input: path.join(root, 'gateway-entry.mjs'),
                output: { entryFileNames: 'gateway-entry.mjs' }
            }
        }
    }, 'build', 'production')
    const main = resolved.config?.main
    assert.ok(main, 'Electron-Vite must produce a main build configuration')
    const hasNodeFirstPolicy = main.plugins?.some(plugin => plugin && !Array.isArray(plugin) && plugin.name === nodeFirstPluginName)
    assert.ok(hasNodeFirstPolicy, 'main build must include the post-preset Node-first policy plugin')

    return {
        ...main,
        // Resolve fixture packages and write output only under the temp root.
        root,
        plugins: includeNodeFirstPolicy
            ? main.plugins
            : main.plugins?.filter(plugin => !plugin || Array.isArray(plugin) || plugin.name !== nodeFirstPluginName)
    }
}

async function bundle(root, outputName, includeNodeFirstPolicy) {
    const outDir = path.join(root, outputName)
    const main = await configuredMainBuild(root, outDir, includeNodeFirstPolicy)
    const result = await build(main)
    const outputs = (Array.isArray(result) ? result : [result]).flatMap(bundle => bundle.output ?? [])
    const fixtureEntry = path.normalize(path.join(root, 'gateway-entry.mjs'))
    const entry = outputs.find(output => output.type === 'chunk' && output.facadeModuleId && path.normalize(output.facadeModuleId) === fixtureEntry)
    assert.ok(entry, 'Electron-Vite main build must emit the fixture entry')
    assert.ok(main.build?.outDir, 'Electron-Vite main build must have an output directory')
    return path.resolve(main.build.outDir, entry.fileName)
}

const originalCwd = process.cwd()
const temp = await mkdtemp(path.join(os.tmpdir(), 'zyra-gateway-bundle-'))
try {
    // electron-vite discovers the Electron target from the desktop installation.
    process.chdir(desktopRoot)
    await createFixture(temp)
    await assert.rejects(
        bundle(temp, 'old-policy', false),
        /xterm\.mjs|Failed to resolve entry|Could not resolve/,
        'removing the post-preset policy must select the broken module entry'
    )
    const output = await bundle(temp, 'node-first-policy', true)
    const { gatewayExports } = await import(pathToFileURL(output).href)
    assert.deepEqual(gatewayExports, { terminal: 'headless-cjs', serialize: 'serialize-cjs' })
    console.log('Gateway Electron-Vite main preset bundle: ok')
} finally {
    process.chdir(originalCwd)
    await rm(temp, { recursive: true, force: true })
}
