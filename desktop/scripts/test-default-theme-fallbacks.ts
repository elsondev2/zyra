import assert from 'node:assert/strict'
import { defaultThemeTokens, resolveDefaultAppearance } from '../src/shared/preferences/default-theme-tokens'
import { THEMES } from '../src/renderer/src/lib/settings-theme-catalog'
import { assistantUtilityProvisionalUrl } from '../src/main/assistant-utility-provisional-document'
import { WINDOWS_CONTROL_SAFETY_HTML } from '../src/main/agent-control/windows-control-overlay-document'

for (const [appearance, id] of [['dark', 'vercel'], ['light', 'paper-light']] as const) {
    const palette = defaultThemeTokens(appearance)
    assert.deepEqual(THEMES.find(theme => theme.id === id)?.tokens, palette)
    const url = assistantUtilityProvisionalUrl({label:'<img src=x onerror=alert(1)>',accentColor:'red;display:none'}, appearance)
    const html = decodeURIComponent(url.substring(url.indexOf(',') + 1))
    assert.ok(html.includes(`content="${appearance}"`))
    assert.ok(html.includes(`background:${palette.bg}`))
    assert.ok(html.includes(`color:${palette.text}`))
    assert.ok(html.includes(`background:${palette.primary}`))
    assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'))
    assert.ok(!html.includes('<img'))
    assert.ok(!html.includes('red;display:none'))
    assert.ok(!html.includes('#0c121f') && !html.includes('#131c2c'))
    assert.ok(!html.includes('${'))
}
assert.equal(resolveDefaultAppearance('light', true), 'light')
assert.equal(resolveDefaultAppearance('dark', false), 'dark')
assert.equal(resolveDefaultAppearance('system', true), 'dark')
assert.equal(resolveDefaultAppearance(undefined, false), 'light')
assert.ok(WINDOWS_CONTROL_SAFETY_HTML.includes('--theme-background:#000000'))
assert.ok(!WINDOWS_CONTROL_SAFETY_HTML.includes('#0c121f'))
assert.ok(!WINDOWS_CONTROL_SAFETY_HTML.includes('${fallbackTheme'))
console.log('Shared default palettes, explicit/system appearance, startup document and overlay fallback passed')
const customAccentHtml = decodeURIComponent(assistantUtilityProvisionalUrl({accentColor:'#123456'}, 'light'))
assert.ok(customAccentHtml.includes('background:#123456'))
