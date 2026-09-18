import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserNewTab.tsx', import.meta.url), 'utf8')
assert.doesNotMatch(source, /rgba\(5, 8, 12|text-white|bg-white|border-white/, 'controls cannot mix fixed dark surfaces and white utilities with adaptive theme text')
for (const opacity of [96, 94]) {
    assert.ok(source.includes(`backgroundColor: 'color-mix(in srgb, var(--color-bg) ${opacity}%, transparent)'`), 'search and server panels use near-opaque theme backgrounds')
}
assert.match(source, /text-sparkle-text outline-none placeholder:text-sparkle-text-muted/, 'search text and placeholder follow the same theme as their surface')
assert.match(source, /role="option"[^\n]*text-sparkle-text[^\n]*bg-\[var\(--surface-hover\)\]/, 'suggestions have themed text and active states')
assert.doesNotMatch(source, /text-sparkle-text-muted\/|drop-shadow-\[/, 'panel metadata retains full theme contrast without dark text shadows')
assert.match(source, /contrast\.clock === 'dark'[\s\S]*contrast\.actions === 'dark'[\s\S]*contrast\.attribution === 'dark'/, 'wallpaper foreground contrast remains independent of app theme')
console.log('Browser New Tab theme contract passed')
