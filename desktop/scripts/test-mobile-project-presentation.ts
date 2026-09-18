import assert from 'node:assert/strict'
import { mock } from 'bun:test'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
let rasterReads = 0
mock.module('electron', () => ({ nativeImage: { createFromPath: () => { rasterReads++; return { isEmpty: () => false, resize: () => ({ toPNG: () => Buffer.from('fixture-png') }) } } } }))
const { MobileProjectPresentations } = await import('../src/main/mobile-project-presentation')
const root = mkdtempSync(path.join(os.tmpdir(), 'zyra-project-presentation-'))
try {
    writeFileSync(path.join(root, 'package.json'), JSON.stringify({ dependencies: { react: '1' } }))
    const base = new MobileProjectPresentations()
    let catalogReads = 0
    const named = new MobileProjectPresentations(undefined, async () => {
        catalogReads++
        return [{ id: 'saved-one', name: 'My project', homePath: root, folders: [{ path: path.join(root, 'source') }] }]
    })
    const home = await named.get(root)
    assert.equal(home.name, 'My project'); assert.equal(home.projectId, 'saved-one'); assert.equal(home.preferred, true)
    const folder = await named.get(path.join(root, 'source'))
    assert.equal(folder.name, 'My project'); assert.equal(folder.projectId, 'saved-one'); assert.equal(folder.preferred, false)
    assert.equal(catalogReads, 1, 'concurrent project metadata shares a bounded catalog cache')
    named.clear(); await named.get(root); assert.equal(catalogReads, 2)
    const brand = await base.get(root)
    assert.equal(brand.iconSlug, 'react'); assert.equal(brand.color, '#61DAFB'); assert.equal(brand.icon, undefined)
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0L24 24"/></svg>'
    writeFileSync(path.join(root, 'logo.svg'), svg)
    base.clear()
    const custom = await base.get(root)
    assert.equal(custom.iconMime, 'image/svg+xml'); assert.equal(Buffer.from(custom.icon!, 'base64').toString(), svg)
    assert.equal(rasterReads, 0, 'SVG metadata does not go through an unsupported raster decoder')
    writeFileSync(path.join(root, 'chosen.png'), 'fixture')
    const overrides = new MobileProjectPresentations(async () => ({ [root.toUpperCase().replaceAll('\\', '/') + '/']: path.join(root, 'chosen.png') }))
    assert.equal(Buffer.from((await overrides.get(root)).icon!, 'base64').toString(), 'fixture-png'); assert.equal(rasterReads, 1)
    await overrides.get(root); assert.equal(rasterReads, 1, 'repeated card appearances reuse metadata')
    writeFileSync(path.join(root, 'logo.svg'), 'x'.repeat(16385)); base.clear()
    const oversize = await base.get(root); assert.equal(oversize.icon, undefined); assert.equal(oversize.iconSlug, 'react')
    console.log('Project icons: framework fallback, SVG, desktop override, cache and bounds passed.')
} finally { rmSync(root, { recursive: true, force: true }) }
