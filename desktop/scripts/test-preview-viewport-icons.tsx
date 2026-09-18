import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { VIEWPORT_PRESETS } from '../src/renderer/src/components/ui/file-preview/viewport'
for (const [key, preset] of Object.entries(VIEWPORT_PRESETS)) {
    assert.ok(preset.icon, `${key} has a viewport icon`)
    assert.match(renderToStaticMarkup(createElement(preset.icon!, { size: 14 })), /<svg/)
}
console.log('Every preview viewport, including Full Width, has a real icon: ok')
