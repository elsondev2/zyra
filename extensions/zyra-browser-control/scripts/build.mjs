import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const out = path.join(root, 'dist', 'unpacked')
await rm(path.join(root, 'dist'), { recursive: true, force: true })
await mkdir(out, { recursive: true })
await cp(path.join(root, 'manifest.json'), path.join(out, 'manifest.json'))
for (const name of (await readdir(path.join(root, 'src'))).sort()) {
  const source = path.join(root, 'src', name)
  if (name.endsWith('.html')) {
    await cp(source, path.join(out, name))
    continue
  }
  if (!name.endsWith('.ts')) continue
  const text = await readFile(source, 'utf8')
  await writeFile(path.join(out, name.replace(/\.ts$/, '.js')), text.replace(/^\/\/ @ts-nocheck\r?\n/, ''), 'utf8')
}
console.log(`Built unpacked extension: ${path.relative(root, out)}`)
