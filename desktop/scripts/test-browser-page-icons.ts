import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { browserPageIconCandidates } from '../src/renderer/src/pages/assistant/AssistantBrowserPageIcon'
import { isSameBrowserFaviconOrigin, resolveBrowserOriginFaviconUrl } from '../src/shared/browser-favicon'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
const pageIconSource = read('../src/renderer/src/pages/assistant/AssistantBrowserPageIcon.tsx')
const faviconServiceSource = read('../src/main/browser-favicon-service.ts')

assert.deepEqual(
    browserPageIconCandidates(null, 'https://www.google.com/search?q=zyra'),
    ['https://www.google.com/favicon.ico'],
    'Google pages fall back to the site origin favicon when Chromium emits no usable icon'
)
assert.deepEqual(
    browserPageIconCandidates(null, 'https://claude.ai/new'),
    ['https://claude.ai/favicon.ico'],
    'Claude pages fall back to the site origin favicon when protected page metadata is unavailable'
)
assert.deepEqual(
    browserPageIconCandidates('https://cdn.example.com/site-icon.png', 'https://example.com/path'),
    ['https://cdn.example.com/site-icon.png', 'https://example.com/favicon.ico'],
    'page-provided icons remain first and the origin icon is a deterministic fallback'
)
assert.deepEqual(
    browserPageIconCandidates('https://example.com/favicon.ico', 'https://example.com/path'),
    ['https://example.com/favicon.ico'],
    'duplicate icon candidates are removed'
)
assert.equal(
    browserPageIconCandidates('javascript:alert(1)', 'not a page').length,
    0,
    'unsafe icon and page schemes never become image candidates'
)
assert.equal(resolveBrowserOriginFaviconUrl('https://claude.ai/new'), 'https://claude.ai/favicon.ico')
assert.equal(isSameBrowserFaviconOrigin('/assets/favicon.ico', 'https://claude.ai/favicon.ico'), true)
assert.equal(isSameBrowserFaviconOrigin('http://127.0.0.1/favicon.ico', 'https://claude.ai/favicon.ico'), false, 'favicon redirects cannot pivot into another origin')
assert.match(faviconServiceSource, /FAVICON_MAX_BYTES = 256 \* 1024/, 'main-owned favicon bytes are bounded')
assert.match(faviconServiceSource, /redirect: 'manual'/, 'favicon redirects are inspected before following')
assert.match(faviconServiceSource, /isSameBrowserFaviconOrigin\(redirectedUrl, initialUrl\)/, 'favicon redirects stay on the active page origin')
assert.doesNotMatch(faviconServiceSource, /cookie|authorization/i, 'the fallback does not forward Browser cookies or credentials')
assert.match(pageIconSource, /const getPageIcon = window\.devscope\?\.getBrowserPageIcon[\s\S]{0,500}getPageIcon\(pageUrl\)/, 'CORP-blocked origin icons fall back through trusted Zyra chrome')
assert.match(
    browserPageIconCandidates('data:image/png;base64,AA==')[0],
    /^data:image\/png/,
    'inline image favicons remain supported'
)

console.log('Browser page icon fallback: ok')
