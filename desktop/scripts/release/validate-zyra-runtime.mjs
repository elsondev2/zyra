import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { validateRuntimeStage } from './runtime-contract.mjs'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const desktopRoot = path.resolve(scriptDirectory, '..', '..')
const repositoryRoot = path.resolve(desktopRoot, '..')

function getArg(name, fallback) {
    const prefix = `--${name}=`
    const inline = process.argv.slice(2).find((value) => value.startsWith(prefix))
    if (inline) return inline.slice(prefix.length)
    const index = process.argv.indexOf(`--${name}`)
    return index >= 0 ? process.argv[index + 1] : fallback
}

const rootPackage = JSON.parse(await readFile(path.join(repositoryRoot, 'package.json'), 'utf8'))
const runtimeRoot = path.resolve(desktopRoot, getArg('runtime', path.join('.release', 'zyra-runtime')))
const manifest = await validateRuntimeStage(runtimeRoot, {
    expectedVersion: rootPackage.version,
    requireDependencies: getArg('require-dependencies', 'true') !== 'false'
})

console.log(
    `Validated Zyra runtime ${manifest.version}: ${manifest.sourceFiles.length} source/metadata files, ${Object.keys(manifest.dependencies).length} production dependencies.`
)
