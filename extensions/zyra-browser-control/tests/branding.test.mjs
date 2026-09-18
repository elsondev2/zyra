import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../', import.meta.url)
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
test('Chrome icons are generated from the actual shipping Zyra app logo', async () => {
  const source = JSON.parse(await readFile(new URL('scripts/icon-source.json', root), 'utf8'))
  assert.equal(source.source, 'desktop/resources/icon.png')
  assert.equal(digest(await readFile(new URL(`../../${source.source}`, root))), source.sha256, 'regenerate icons after changing the app logo')
  const manifest = JSON.parse(await readFile(new URL('manifest.json', root), 'utf8'))
  for (const size of [16, 32, 48, 128]) {
    const name = `icon${size}.png`
    const bytes = await readFile(new URL(`assets/${name}`, root))
    assert.equal(bytes.subarray(1, 4).toString(), 'PNG')
    assert.equal(bytes.readUInt32BE(16), size)
    assert.equal(bytes.readUInt32BE(20), size)
    assert.equal(digest(bytes), source.icons[name])
    assert.equal(manifest.icons[size], name)
    if (size <= 32) assert.equal(manifest.action.default_icon[size], name)
  }
})
