import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
const source = (name: string) => readFileSync(new URL(`../src/renderer/src/pages/accessories/${name}`, import.meta.url), 'utf8')
assert.match(source('AccessoryWindowHeader.tsx'), /slotRef/, 'window header owns the workspace chrome slot')
assert.match(source('AccessoryWindowPage.tsx'), /<AccessoryHeaderProvider/)
assert.match(source('AccessoryDirectoryBar.tsx'), /<AccessoryHeaderPortal/)
const { AccessoryDirectoryControls } = await import('../src/renderer/src/pages/accessories/AccessoryDirectoryBar')
let calls = 0
const props = { path: 'C:/fixture/folder', onChoose: () => { calls++ } }
const html = renderToStaticMarkup(<AccessoryDirectoryControls {...props} />)
assert.equal((html.match(/<button\b/g) || []).length, 1)
assert.match(html, /aria-label="Choose folder"/)
assert.doesNotMatch(html, />Choose folder<|>Choosing/)
assert.match(html, /C:\/fixture\/folder/)
assert.match(html, /no-drag/)
assert.match(html, /data-accessory-drag-region="true"/)
assert.ok(html.indexOf('C:/fixture/folder') < html.indexOf('aria-label="Choose folder"'), 'folder action follows the path')
assert.match(source('AccessoryWindowPage.tsx'), /separated=\{state\?\.kind === 'terminal' \|\| state\?\.kind === 'files'\}/)
assert.equal(calls, 0)
assert.match(renderToStaticMarkup(<AccessoryDirectoryControls {...props} disabled />), /disabled=""/)
assert.match(renderToStaticMarkup(<AccessoryDirectoryControls {...props} busy />), /aria-busy="true"/)
for (const name of ['AccessoryHeaderContext.tsx', 'AccessoryWindowHeader.tsx', 'AccessoryWindowPage.tsx', 'AccessoryDirectoryBar.tsx']) new Bun.Transpiler({ loader: 'tsx' }).transformSync(source(name))
assert.match(source('AccessoryBrowser.tsx'), /<AccessoryHeaderPortal/, 'browser tabs occupy the same titlebar row')
console.log('Accessory headers: shared chrome slot, icon-only folder action, actual path and preserved disabled/loading guards: ok')
