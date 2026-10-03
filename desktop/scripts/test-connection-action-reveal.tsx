import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { ThisDeviceSettings } from '../src/renderer/src/pages/settings/ConnectionsSettings'
import { ChromeBrowserConnectionSettings } from '../src/renderer/src/pages/settings/ChromeBrowserConnectionSettings'

const markup = renderToStaticMarkup(<ThisDeviceSettings desktopHost />)
for (const label of ['Copy link', 'Open Zyra in your browser']) {
    assert.match(markup, new RegExp(`aria-label="${label}"`), `${label} remains named while collapsed`)
}
assert.equal((markup.match(/group\/connection-action/g) || []).length, 2, 'both actions reveal their labels independently')
assert.match(markup, /group-hover\/connection-action:max-w-20/, 'Copy link has a fitted reveal width')
assert.match(markup, /group-hover\/connection-action:max-w-12/, 'Open has a fitted reveal width')
assert.equal((markup.match(/group-focus-visible\/connection-action:max-w-(?:12|20)/g) || []).length, 2, 'keyboard focus expands both labels')
assert.equal((markup.match(/duration-\[420ms\]/g) || []).length, 2, 'both actions use the smoother transition')
assert.equal((markup.match(/motion-reduce:transition-none/g) || []).length, 2, 'reduced motion disables both label animations')
const chromeMarkup = renderToStaticMarkup(<ChromeBrowserConnectionSettings />)
assert.match(chromeMarkup, /aria-label="Install extension"/, 'extension action remains named while collapsed')
assert.match(chromeMarkup, /aria-label="Pause connection"/, 'pause action remains named while collapsed')
assert.equal((chromeMarkup.match(/group\/connection-action/g) || []).length, 2, 'Chrome actions share the same icon-first reveal')
assert.equal((chromeMarkup.match(/group-hover\/connection-action:max-w-36/g) || []).length, 2, 'Chrome labels expand on hover')
assert.equal((chromeMarkup.match(/group-focus-visible\/connection-action:max-w-36/g) || []).length, 2, 'Chrome labels expand on keyboard focus')
assert.equal((chromeMarkup.match(/duration-\[420ms\]/g) || []).length, 2, 'Chrome actions use the smoother transition')
console.log('Connection action reveal: ok')
