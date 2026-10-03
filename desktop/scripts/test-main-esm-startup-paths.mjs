import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { transform } from 'esbuild'

const temporaryRoot = await mkdtemp(join(tmpdir(), 'zyra esm startup #'))
try {
    const mainDirectory = join(temporaryRoot, 'checkout', 'desktop', 'out', 'main')
    const preloadDirectory = join(mainDirectory, '..', 'preload')
    await mkdir(mainDirectory, { recursive: true })
    await mkdir(preloadDirectory, { recursive: true })
    await mkdir(join(temporaryRoot, 'checkout', 'src'), { recursive: true })
    await writeFile(join(temporaryRoot, 'checkout', 'src', 'zyra-sdk.mjs'), '')

    // Exercise the actual startup path code independently of Electron's app
    // side effects. Node ESM provides no implicit __dirname, just like main.
    const mainSource = readFileSync(new URL('../src/main/index.ts', import.meta.url), 'utf8')
    const pathImports = mainSource.match(/^import \{[^\r\n]*\} from '(?:path|node:path|node:url|fs|node:fs)'$/gm) || []
    const directoryBinding = mainSource.match(/^const __dirname = .+$/m)?.[0] || ''
    const preloadSource = mainSource.slice(mainSource.indexOf('const getPreloadPath ='), mainSource.indexOf('const getAppIconPath ='))
    assert(preloadSource.includes('getPreloadPath'), 'The fixture must exercise the real startup preload resolver.')
    const preloadFixture = await transform([
        ...pathImports,
        directoryBinding,
        preloadSource,
        'export { getPreloadPath }',
    ].join('\n'), { loader: 'ts', format: 'esm' })
    const preloadFixturePath = join(mainDirectory, 'preload-paths.mjs')
    await writeFile(preloadFixturePath, preloadFixture.code)
    const { getPreloadPath } = await import(pathToFileURL(preloadFixturePath).href)
    assert.equal(getPreloadPath(), join(preloadDirectory, 'index.js'), 'Legacy preload fallback resolves from the compiled main module.')
    await writeFile(join(preloadDirectory, 'index.cjs'), '')
    assert.equal(getPreloadPath(), join(preloadDirectory, 'index.cjs'), 'Sandboxed CommonJS preload takes precedence.')

    const rootSource = readFileSync(new URL('../src/main/zyra/zyra-root.ts', import.meta.url), 'utf8')
    const rootFixture = await transform(rootSource, { loader: 'ts', format: 'esm' })
    const rootFixturePath = join(mainDirectory, 'zyra-root.mjs')
    await writeFile(rootFixturePath, rootFixture.code)
    const { resolveZyraRoot, resolvePackagedZyraRoot } = await import(pathToFileURL(rootFixturePath).href)
    assert.equal(resolveZyraRoot(), join(temporaryRoot, 'checkout'), 'The compiled ESM module finds its own checkout instead of the caller cwd.')
    const resources = join(temporaryRoot, 'resources')
    await mkdir(join(resources, 'zyra-runtime', 'src'), { recursive: true })
    await writeFile(join(resources, 'zyra-runtime', 'src', 'zyra-sdk.mjs'), '')
    assert.equal(resolvePackagedZyraRoot(resources), join(resources, 'zyra-runtime'), 'Packaged runtime discovery still resolves resources/zyra-runtime.')
    console.log('Electron main ESM startup paths passed')
} finally {
    await rm(temporaryRoot, { recursive: true, force: true })
}
