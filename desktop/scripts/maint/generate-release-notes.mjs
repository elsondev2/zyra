import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildReleaseNotes } from './release-notes.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..', '..')
const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'))
const publishConfig = Array.isArray(packageJson.build?.publish)
    ? packageJson.build.publish[0]
    : packageJson.build?.publish

const version = packageJson.version
const tagName = `v${version}`
const notes = await buildReleaseNotes({
    rootDir,
    owner: publishConfig?.owner,
    repo: publishConfig?.repo,
    version,
    currentTag: tagName
})

process.stdout.write(notes.body)
