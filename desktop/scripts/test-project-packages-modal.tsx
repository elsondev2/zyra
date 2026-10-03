import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mock } from 'bun:test'
import type { ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

mock.module('../src/renderer/src/components/ui/native-overlay-portal', () => ({ NativeOverlayPortal: ({ children }: { children: ReactNode }) => <>{children}</> }))
mock.module('../src/renderer/src/lib/settings', () => ({ useSettings: () => ({ settings: { theme: 'vercel', appearanceResolvedMode: 'dark' } }) }))
const { DependenciesModal } = await import('../src/renderer/src/pages/project-details/ProjectDetailsModals')
const { getPackageLogo } = await import('../src/renderer/src/pages/project-details/package-logos')
const { PackageLogo } = await import('../src/renderer/src/pages/project-details/PackageLogo')
const props = { projectName: 'Harbor', projectPath: 'C:/work/harbor', dependencies: { react: '^19.0.0', vite: '^6.0.0' }, devDependencies: { typescript: '^5.0.0' }, onClose: () => {} }
const status = { installed: true, checked: true, ecosystem: 'node' as const, totalPackages: 3, installedPackages: 3, missingPackages: 0 }
const render = (overrides = {}) => renderToStaticMarkup(<DependenciesModal {...props} dependencyInstallStatus={status} {...overrides} />)
const header = (html: string) => html.match(/<header\b[\s\S]*?<\/header>/)?.[0] || ''
const html = render()
const footer = (html: string) => html.match(/<footer\b[\s\S]*?<\/footer>/)?.[0] || ''
assert.doesNotMatch(header(html), /All installed|3\/3 found/, 'the header is reserved for project identity and close/actions')
assert.match(footer(html), /All installed/, 'install health is kept in the footer')
assert.match(footer(html), /3\/3 found/, 'the checked package count remains available')
assert.match(header(html), /aria-label="Package actions"/, 'repair actions no longer reserve a separate row')
assert.match(header(html), /aria-label="Close packages"/)
assert.match(header(html), /py-2\.5/, 'header uses compact vertical padding')
assert.match(header(html), /title="C:\/work\/harbor"/, 'the full path remains available on hover')
assert.doesNotMatch(header(html), />Harbor · C:\//, 'the header does not repeat the full filesystem path')
assert.match(html, /h-\[min\(720px,calc\(100dvh-2rem\)\)\]/, 'modal height is fixed and viewport-bounded')
assert.equal((html.match(/data-package-logo=/g) || []).length, 3, 'each package gets a logo slot')
assert.doesNotMatch(html.slice(html.indexOf('</header>') + 9, html.indexOf('aria-label="Search packages"')), /All installed|Package actions/, 'there is no redundant status strip above search')
assert.match(html, /px-5 pt-2/, 'search has only a small top gap')
assert.match(html, /aria-label="Search packages"/)
for (const text of ['All 3', 'Runtime 2', 'Dev 1', '3 of 3 packages']) assert.ok(html.includes(text), `${text} is retained`)
assert.equal((html.match(/aria-label="View [^"]+ on npm"/g) || []).length, 3, 'all package links remain')
assert.doesNotMatch(header(html), />Install missing</)
const missing = render({ dependencyInstallStatus: { ...status, installed: false, installedPackages: 2, missingPackages: 1, missingDependencies: ['vite'] } })
assert.doesNotMatch(header(missing), /1 missing|Install missing/)
assert.match(footer(missing), /1 missing/)
assert.match(footer(missing), />Install missing</)
assert.match(missing, /Runtime · Missing/)
assert.match(footer(render({ dependencyInstallStatus: null })), /Install status unknown/)
assert.match(footer(render({ dependencyInstallStatus: { ...status, installed: null, checked: false, reason: 'No lockfile found' } })), /No lockfile found/)
assert.match(render({ dependencies: {}, devDependencies: {} }), /No packages in this section\./)
const source = readFileSync(new URL('../src/renderer/src/pages/project-details/ProjectDetailsModals.tsx', import.meta.url), 'utf8')
new Bun.Transpiler({ loader: 'tsx' }).transformSync(source)
assert.match(source, /role="status"/, 'installation feedback remains announced')
assert.match(source, /runInstall\('missing'\)/)
assert.match(source, /runInstall\('all'\)/)
assert.match(source, /onlyMissing: mode === 'missing'/)
assert.match(source, /setSearch\(event\.target\.value\)/)
assert.match(source, /setScope\(key\)/)
for (const [name, brand] of [['react', 'React'], ['@types/react', 'React'], ['@types/cross-spawn', 'TypeScript'], ['@anthropic-ai/sdk', 'Anthropic'], ['@aws-sdk/client-bedrock-runtime', 'AWS'], ['@google/genai', 'Google'], ['@modelcontextprotocol/client', 'Model Context Protocol'], ['@vitejs/plugin-react', 'Vite']]) {
    assert.equal(getPackageLogo(name)?.label, brand, `${name} resolves to its package family artwork`)
}
for (const name of ['unknown-private-package', 'constructor', '__proto__', '@aws-sdk-lookalike/sdk', '']) assert.equal(getPackageLogo(name), null)
assert.equal(getPackageLogo('@types/constructor')?.label, 'TypeScript')
const knownLogo = renderToStaticMarkup(<PackageLogo packageName="@anthropic-ai/sdk" />)
assert.match(knownLogo, /cdn\.simpleicons\.org\/anthropic\/[a-f0-9]{6}/, 'logos use the existing contrast-aware CDN helper')
assert.doesNotMatch(knownLogo, /cdn\.simpleicons\.org[^" ]*anthropic-ai/, 'package names are not sent to the image service')
assert.match(knownLogo, /loading="lazy"/)
assert.doesNotMatch(renderToStaticMarkup(<PackageLogo packageName="unknown-private-package" />), /<img/, 'unknown packages use a local icon without network requests')
const logoSource = readFileSync(new URL('../src/renderer/src/pages/project-details/PackageLogo.tsx', import.meta.url), 'utf8')
assert.match(logoSource, /onError=\{[\s\S]*failedLogoUrls\.add\(src\); setFailedUrl\(src\)/, 'failed images fall back and are not retried on remount')
assert.match(logoSource, /referrerPolicy="no-referrer"/)
new Bun.Transpiler({ loader: 'tsx' }).transformSync(logoSource)
console.log('Package modal: clean header, footer health/actions, stable height, verified logo families/fallbacks, search and filters: ok')
