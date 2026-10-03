import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { directoryMcpContributions, directorySkills, matchesDirectoryQuery, pluginDirectoryTab } from '../src/renderer/src/pages/plugins/plugin-contribution-directory'
import { McpList, PluginList, SkillList } from '../src/renderer/src/pages/plugins/PluginDirectoryLists'
import { makePluginDirectoryFixture, fixtureStandaloneSkills } from './fixtures/plugin-directory-data'
import { PluginStore } from '../src/renderer/src/pages/plugins/PluginStore'
import { PluginProductPage } from '../src/renderer/src/pages/plugins/PluginProductPage'
import { PluginDownloadPanel } from '../src/renderer/src/pages/plugins/PluginDownloadPanel'
import { AssistantPluginInstallDialog } from '../src/renderer/src/pages/plugins/AssistantPluginInstallDialog'
import type { AssistantPluginInspection } from '../src/shared/assistant/contracts'
import storeCatalog from '../src/shared/plugins/openai-directory.json'
import descriptionOverrides from '../src/shared/plugins/plugin-description-overrides.json'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const catalog = makePluginDirectoryFixture()
const before = JSON.stringify(catalog)
const skills = directorySkills(catalog, fixtureStandaloneSkills)
assert.equal(skills.length, 9)
assert.equal(new Set(skills.map((skill) => skill.id)).size, 9)
assert.equal(skills.find((skill) => skill.name === 'test-manual-check')?.manualOnly, true)
assert.equal(skills.find((skill) => skill.pluginId === catalog.plugins[3].id)?.version, '1.0.0', 'disabled Plugin contents stay inspectable without claiming they are active')
const pinned = structuredClone(catalog.releases[0])
pinned.id = 'retained-release'
pinned.version = '0.9.0'
pinned.skills[0].name = 'old-skill'
catalog.releases.push(pinned)
assert.equal(directorySkills(catalog, []).some((skill) => skill.name === 'old-skill'), false, 'directory uses installation release, not every retained or pinned Chat release')
const duplicateName = { ...fixtureStandaloneSkills[0], name: 'review-helper' }
assert.equal(directorySkills(catalog, [duplicateName]).filter((skill) => skill.name === 'review-helper').length, 2, 'source and Plugin contributions remain distinct')
assert.equal(directorySkills(catalog, [{ ...duplicateName, pluginId: catalog.plugins[0].id }]).length, 6, 'do not duplicate Plugin provenance from prompt projections')
assert.deepEqual(directorySkills(null, []), [])
assert.deepEqual(directoryMcpContributions(null), [])
const mcps = directoryMcpContributions(catalog)
assert.equal(mcps.length, 2, 'count contribution packages, not unparsed servers')
assert.equal(pluginDirectoryTab('skills'), 'skills')
assert.equal(pluginDirectoryTab('mcps'), 'mcps')
assert.equal(pluginDirectoryTab('invalid'), 'plugins')
assert.equal(matchesDirectoryQuery('  DOCS ', 'Docs Toolkit'), true)
assert.equal(matchesDirectoryQuery('missing', 'Docs Toolkit'), false)
assert.equal(matchesDirectoryQuery(' ', undefined), true)
const mcpHtml = renderToStaticMarkup(<McpList contributions={mcps} onSelect={() => {}} />)
assert.ok(mcpHtml.includes('Open a Plugin to connect them.'))
assert.ok(!mcpHtml.includes('role="switch"'), 'unavailable MCP execution has no live-looking toggle')
const listHtml = renderToStaticMarkup(<PluginList catalog={catalog} plugins={catalog.plugins} busy={false} onSelect={() => {}} onToggle={() => {}} />)
assert.equal((listHtml.match(/role="switch"/g) || []).length, 6)
assert.ok(listHtml.includes('aria-label="Open Review Helper"'))
assert.ok(!listHtml.includes('C:/fixture'), 'primary rows do not expose package paths')
const skillsHtml = renderToStaticMarkup(<SkillList skills={skills} onSelect={() => {}} />)
assert.ok(!skillsHtml.includes('role="switch"'), 'source-level settings must not become invented per-Skill enablement')
assert.ok(skillsHtml.includes('Open Skill test-code-review'))
catalog.releases.pop()
assert.equal(JSON.stringify(catalog), before, 'directory projections do not mutate the catalog')
const storeHtml = renderToStaticMarkup(<PluginStore canInstall={true} busy={false} installedCatalog={catalog} loading={false} onManage={() => {}} onSelectInstalled={() => {}} onUseInChat={() => {}} onOpenEntry={() => {}} onImportFolder={() => {}} />)
assert.ok(storeHtml.indexOf('Installed preview') < storeHtml.indexOf('aria-label="Developer Tools"'), 'Installed is the first store section')
assert.ok(storeHtml.includes('View all Plugins, Skills, and MCPs'))
assert.ok(storeHtml.includes('aria-label="About this catalog"'))
const storeCards = storeHtml.match(/<li class="plugin-store-item">[\s\S]*?<\/li>/g) || []
assert.ok(storeCards.length >= storeCatalog.entries.length)
for (const card of storeCards) assert.equal(card.includes('plugin-row-chevron'), !card.includes('title="Use in Chat"'), 'show the chevron only when the card has no Use in Chat button')
const gmailCatalog = structuredClone(catalog)
gmailCatalog.plugins[0].name = 'gmail'
gmailCatalog.plugins[0].sourceId = 'openai-catalog:gmail'
gmailCatalog.releases[0].manifest.interface.displayName = 'Gmail'
const gmailCard = (busy = false) => {
    const html = renderToStaticMarkup(<PluginStore canInstall busy={busy} installedCatalog={gmailCatalog} loading={false} onManage={() => {}} onSelectInstalled={() => {}} onUseInChat={() => {}} onOpenEntry={() => {}} onImportFolder={() => {}} />)
    return (html.match(/<li class="plugin-store-item">[\s\S]*?<\/li>/g) || []).find(card => card.includes('aria-label="View Gmail"')) || ''
}
assert.ok(gmailCard().includes('title="Use in Chat"'))
assert.ok(!gmailCard().includes('plugin-row-chevron'), 'installed Gmail with a chat action has no chevron')
assert.ok(!gmailCard(true).includes('plugin-row-chevron'), 'a temporarily disabled chat button still replaces the chevron')
gmailCatalog.plugins[0].state = 'disabled'
assert.ok(!gmailCard().includes('title="Use in Chat"'))
assert.ok(gmailCard().includes('plugin-row-chevron'), 'cards without a chat action retain navigation')
assert.ok(storeHtml.includes('aria-label="View Gmail"'), 'the Gmail card still opens its product page')
assert.ok(storeHtml.includes('aria-label="Use Review Helper in a new Chat"'), 'the separate chat action stays available')
const logoTags = storeHtml.match(/<img\b[^>]*>/g) || []
assert.equal(logoTags.length, storeCatalog.entries.length, 'every catalog entry has its official logo')
assert.ok(logoTags.every(tag => !/src="https?:/.test(tag)), 'store logos use bundled assets, not remote image requests')
for (const name of ['adobe', 'lovable', 'consensus', 'higgsfield']) assert.ok(logoTags.some(tag => tag.includes(`/plugin-logos/${name}.`)), `${name} no longer falls back to a Plug icon`)
assert.ok(!storeHtml.includes('externally hosted entries'), 'catalog notes stay behind the info control')
assert.ok(!storeHtml.includes('Manage your Plugins, Skills, and MCP contributions.'), 'the store does not narrate its Installed section')
const emptyStoreHtml = renderToStaticMarkup(<PluginStore canInstall={true} busy={false} installedCatalog={{ ...catalog, plugins: [] }} loading={false} onManage={() => {}} onSelectInstalled={() => {}} onUseInChat={() => {}} onOpenEntry={() => {}} onImportFolder={() => {}} />)
const emptyInstalled = emptyStoreHtml.match(/<section class="plugin-store-installed"[\s\S]*?<\/section>/)?.[0] || ''
assert.ok(emptyInstalled.includes('None yet'))
assert.ok(emptyInstalled.includes('View all'))
assert.ok(!/<(?:p|ul)(?:\s|>)/.test(emptyInstalled), 'empty Installed uses one header row, not a padded content block')
assert.equal(new Set(storeCatalog.entries.map((entry) => entry.name)).size, storeCatalog.entries.length)
assert.ok(storeCatalog.entries.length > 0 && storeCatalog.entries.length <= 512)
assert.match(storeCatalog.commit, /^[a-f0-9]{40}$/)
for (const entry of storeCatalog.entries) {
    assert.ok(entry.sourceUrl.startsWith(`https://github.com/openai/plugins/tree/${storeCatalog.commit}/plugins/`))
    if (entry.iconUrl) assert.ok(entry.iconUrl.startsWith(`https://raw.githubusercontent.com/openai/plugins/${storeCatalog.commit}/plugins/`))
}
const detailHtml = renderToStaticMarkup(<PluginProductPage entry={storeCatalog.entries.find(e => e.name === 'vercel')!} installation={null} catalog={null} canInstall busy={false} installContent={<div data-testid="install-flow-fixture" />} onBack={() => {}} onInstall={() => {}} onUseInChat={() => {}} onManage={() => {}} />)
assert.ok(detailHtml.includes('aria-label="Breadcrumb"'))
assert.match(detailHtml, /<img[^>]*loading="eager"/, 'a product page loads its main logo immediately, including when opened in the background')
assert.ok(detailHtml.includes('Included</h2>'))
assert.ok(detailHtml.indexOf('install-flow-fixture') > detailHtml.indexOf('</header>'), 'install progress belongs below the product header')
assert.ok(detailHtml.indexOf('install-flow-fixture') < detailHtml.indexOf('Included</h2>'), 'progress precedes the product content')
const storeWithProgress = renderToStaticMarkup(<PluginStore canInstall busy={false} installedCatalog={catalog} loading={false} installContent={<div data-testid="store-progress-fixture" />} onManage={() => {}} onSelectInstalled={() => {}} onUseInChat={() => {}} onOpenEntry={() => {}} onImportFolder={() => {}} />)
assert.ok(storeWithProgress.indexOf('store-progress-fixture') > storeWithProgress.indexOf('plugin-store-toolbar'), 'store progress stays beneath its top controls')
assert.ok(storeWithProgress.indexOf('store-progress-fixture') < storeWithProgress.indexOf('plugin-store-installed'), 'store progress precedes browse content')
assert.ok(detailHtml.includes('aria-label="Plugin details"') && !detailHtml.includes('App views'), 'footer retains plugin details without advertising unavailable views')
assert.ok(detailHtml.includes('>Install</button>'))
assert.ok(!detailHtml.includes('<dialog') && !detailHtml.includes('Choose downloaded folder'))
for (const entryName of ['canva', 'adobe'] as const) {
    const entry = storeCatalog.entries.find(entry => entry.name === entryName)!
    assert.equal(entry.longDescriptionSource, 'zyra')
    assert.equal(entry.longDescription, descriptionOverrides[entryName].longDescription)
    const summaryHtml = renderToStaticMarkup(<PluginProductPage entry={entry} installation={null} catalog={null} canInstall busy={false} onBack={() => {}} onInstall={() => {}} onUseInChat={() => {}} onManage={() => {}} />)
    assert.ok(summaryHtml.includes('aria-label="Plugin links"'))
    assert.ok(!summaryHtml.includes('Publisher description'), 'source attribution does not clutter the product page')
}
assert.ok(!detailHtml.includes('Account connections and app integrations are not available yet.'), 'stale capability copy is gone')
const notionHtml = renderToStaticMarkup(<PluginProductPage entry={storeCatalog.entries.find(e => e.name === 'notion')!} installation={null} catalog={null} canInstall busy={false} onBack={() => {}} onInstall={() => {}} onUseInChat={() => {}} onManage={() => {}} />)
assert.ok(notionHtml.includes('Tools</strong>') && notionHtml.includes('Connect after install'))
assert.ok(notionHtml.includes('Install &amp; connect</button>'), 'installation explicitly includes the subsequent account/server connection')
const unsupportedProductHtml = renderToStaticMarkup(<PluginProductPage entry={storeCatalog.entries.find(entry => entry.name === 'slack')!} installation={null} catalog={null} canInstall busy={false} onBack={() => {}} onInstall={() => {}} onUseInChat={() => {}} onManage={() => {}} />)
assert.match(unsupportedProductHtml, /<button[^>]*disabled[^>]*>[\s\S]*?Not available in Zyra<\/button>/, 'an app-only reference without a portable connection is not falsely offered as a working install')
assert.ok(notionHtml.includes('App views</strong>') && notionHtml.includes('If available'), 'MCP app views are presented as conditional, not promised for Notion')
assert.ok(!notionHtml.includes('Publisher</dt>') && !notionHtml.includes('OpenAI app entry'), 'package metadata and implementation details stay out of the main product surface')
assert.ok(notionHtml.includes('Open website') && notionHtml.includes('MIT license'), 'footer retains source links and package metadata')
assert.ok(!notionHtml.includes('About this plugin') && !notionHtml.includes('<dialog'), 'product details no longer require an info dialog')
assert.ok(!notionHtml.includes('Zyra supports the Skills only'), 'Notion no longer shows obsolete connection guidance')
assert.match(notionHtml, /Skills<span class="plugin-product-count" aria-label="4 skills">4<\/span>/, 'the pinned catalog supplies skill counts before installation')
for (const kind of ['website', 'privacy', 'terms', 'source']) {
    assert.ok(notionHtml.includes(`plugin-product-link-icon-${kind}`), `${kind} link has a distinct icon`)
}
assert.ok(notionHtml.includes('plugin-product-link-arrow'), 'link arrows have a separately collapsible slot')
for (const name of ['clickup', 'monday-com', 'stripe', 'supabase', 'atlassian-rovo', 'granola', 'posthog']) {
    const entry = storeCatalog.entries.find(entry => entry.name === name)!
    assert.equal(entry.hasMcp, true, `${name} has a public MCP bridge`)
    const html = renderToStaticMarkup(<PluginProductPage entry={entry} installation={null} catalog={null} canInstall busy={false} onBack={() => {}} onInstall={() => {}} onUseInChat={() => {}} onManage={() => {}} />)
    assert.ok(html.includes('Connect after install') && !html.includes('no features Zyra can use'))
    assert.ok(!/<button[^>]*disabled[^>]*>[^<]*<svg[^>]*>[\s\S]*?<\/svg>Install<\/button>/.test(html), `${name} Install is enabled`)
}
const gmailHtml = renderToStaticMarkup(<PluginProductPage entry={storeCatalog.entries.find(e => e.name === 'vercel')!} installation={null} catalog={null} canInstall busy={false} onBack={() => {}} onInstall={() => {}} onUseInChat={() => {}} onManage={() => {}} />)
assert.ok(gmailHtml.includes('Provider-hosted tools') && gmailHtml.includes('Connection needed'), 'unresolved registered connections explain the exact limitation')
assert.ok(!gmailHtml.includes('App views</strong>'), 'registered app connections do not promise interactive app views')
assert.ok(gmailHtml.includes('aria-label="About this connection"'), 'endpoint guidance belongs to the connection info tip')
assert.ok(!gmailHtml.includes('This package includes a connection for its provider'), 'long connection notices are hidden until requested')
const installedDetail = renderToStaticMarkup(<PluginProductPage entry={null} installation={catalog.plugins[0]} catalog={catalog} canInstall busy={false} onBack={() => {}} onInstall={() => {}} onUseInChat={() => {}} onManage={() => {}} />)
assert.ok(installedDetail.includes('Use in Chat'))
assert.ok(!installedDetail.includes('plugin-product-status'), 'active installation does not leave a redundant Installed label')
assert.ok(installedDetail.includes('aria-expanded="false"') && installedDetail.includes('aria-controls="plugin-product-skills"'), 'skill disclosure is an accessible animated toggle')
assert.ok(installedDetail.includes('review-helper'))
assert.ok(!installedDetail.includes('>Install</button>'))
assert.match(installedDetail, /Skills<span class="plugin-product-count" aria-label="1 skill">1<\/span><\/strong>/, 'the real skill count sits beside Skills')
assert.ok(!installedDetail.includes('>1 skill<'), 'counts are not repeated at the end of the row')
const source = (path: string) => readFileSync(join(import.meta.dir, '../src/renderer/src', path), 'utf8')
const railSource = source('pages/assistant/AssistantChatSessionsRail.tsx')
const header = railSource.slice(railSource.indexOf('const baseSidebarActions'), railSource.indexOf('return (', railSource.indexOf('const baseSidebarActions')))
assert.ok(header.includes('aria-label="Search chats"'))
assert.ok(header.includes('label="Plugins"'))
assert.ok(!header.includes('label="Search"'), 'Search is an icon in the New Chat row')
assert.ok(!railSource.slice(railSource.indexOf('mt-auto shrink-0 space-y-0.5 border-t')).includes("navigate('/plugins')"), 'Plugins is not in the footer')
assert.ok(source('pages/assistant/AssistantWorkspaceLayout.tsx').includes('<ConnectedAssistantSessionsRail'), 'Chat and Plugins share one persistent connected sidebar')
assert.ok(source('pages/plugins/PluginsPage.tsx').includes("params.get('view') !== 'manage'"), 'the store is the default destination')
assert.ok(source('pages/plugins/PluginsPage.css').includes('scrollbar-gutter: stable both-edges'))
assert.match(source('pages/plugins/PluginsPage.tsx'), /aria-label="Browse store" title="Browse store"><Store size=/, 'store navigation is a labeled icon button')
const storeSource = source('pages/plugins/PluginStore.tsx')
assert.equal((storeSource.match(/className="plugin-store-item"/g) || []).length, 2, 'installed and catalog actions belong to the same plugin block')
assert.ok(storeHtml.includes('class="plugin-store-item"'), 'shared plugin containment renders in the store')
assert.ok(source('pages/plugins/PluginsPage.css').includes('.plugin-store-item:hover, .plugin-store-item:focus-within'), 'plugin content and chat action share one hover and keyboard-focus surface')
assert.ok(source('pages/plugins/PluginsPage.css').includes('.plugin-store-item > .plugin-row-content:hover { background: transparent; }'), 'the main button no longer creates a separate hover block')
assert.ok(storeSource.includes('Each release requires review; installation runs no code.'))
assert.ok(!storeSource.includes('Choose downloaded folder'))
assert.ok(!storeHtml.includes('Add from folder'))
assert.ok(!storeSource.includes('Download the package from its source, then choose its folder'))
assert.ok(storeSource.includes('Supported when a connected MCP server provides one'), 'catalog describes conditional MCP app view support')
assert.ok(source('pages/plugins/AssistantPluginInstallDialog.tsx').includes('Active Plugins are available automatically in existing and new regular Chats.'))
const progressHtml = renderToStaticMarkup(<PluginDownloadPanel state={{ phase: 'preparing', name: 'vercel', download: { id: 'test', status: 'downloading', progress: { phase: 'downloading', completedFiles: 8, totalFiles: 20, completedBytes: 1024, totalBytes: 2048, cacheHits: 3 } } }} onCancel={() => {}} onRetry={() => {}} />)
assert.ok(progressHtml.includes('8 of 20 files'))
assert.ok(progressHtml.includes('3 files reused'))
assert.match(progressHtml, /<progress[^>]*max="20"[^>]*value="8"/)
assert.ok(!progressHtml.includes('<dialog'), 'preparation is non-blocking')
assert.ok(progressHtml.includes('plugin-install-job-reveal') && progressHtml.includes('transition-duration:240ms'), 'preparation uses the shared height/fade transition')
const idleProgress = renderToStaticMarkup(<PluginDownloadPanel state={{ phase: 'idle', name: null }} onCancel={() => {}} onRetry={() => {}} />)
assert.ok(idleProgress.includes('aria-hidden="true"') && !idleProgress.includes('<progress'), 'idle progress reserves no visible content or controls')
const inspectingHtml = renderToStaticMarkup(<PluginDownloadPanel state={{ phase: 'preparing', name: 'vercel', download: { id: 'test', status: 'downloading', progress: { phase: 'inspecting', completedFiles: 20, totalFiles: 20, completedBytes: 2048, totalBytes: 2048, cacheHits: 0 } } }} onCancel={() => {}} onRetry={() => {}} />)
assert.ok(inspectingHtml.includes('Checking this release'))
const connectingHtml = renderToStaticMarkup(<PluginDownloadPanel state={{ phase: 'connecting', name: 'notion', connectingServer: 'notion' }} onCancel={() => {}} onRetry={() => {}} />)
assert.ok(connectingHtml.includes('Connecting notion') && connectingHtml.includes('Complete any account sign-in'))
assert.ok(!connectingHtml.includes('>Retry</button>'), 'sign-in is not a failed download to reinstall')
assert.doesNotMatch(inspectingHtml, /<progress[^>]*value=/, 'inspection has no invented percentage')
const failedHtml = renderToStaticMarkup(<PluginDownloadPanel state={{ phase: 'failed', name: 'vercel', error: 'Test failure' }} onCancel={() => {}} onRetry={() => {}} />)
assert.ok(failedHtml.includes('role="alert"') && failedHtml.includes('Retry') && failedHtml.includes('Dismiss'))
const reviewed = catalog.releases[0]
const inspection: AssistantPluginInspection = { reviewId: 'test', expiresAt: '2099-01-01T00:00:00.000Z', manifest: reviewed.manifest, release: { name: reviewed.manifest.name, version: reviewed.version, contentDigest: reviewed.contentDigest, fileCount: reviewed.fileCount, totalBytes: reviewed.totalBytes, containsExecutableFiles: true, skills: reviewed.skills, contributions: [{ kind: 'skills', relativePath: './skills', support: 'supported' }, { kind: 'mcp', relativePath: './.mcp.json', support: 'planned' }], diagnostics: [] } }
const reviewHtml = renderToStaticMarkup(<AssistantPluginInstallDialog inline inspection={inspection} packageLabel="Catalog" installing={false} error={null} onCancel={() => {}} onInstall={() => {}} onInstallAndUse={() => {}} />)
assert.ok(!reviewHtml.includes('<dialog'))
assert.ok(reviewHtml.includes('Unavailable in Zyra: MCP connections'))
assert.ok(reviewHtml.includes('These will not run or connect accounts.'))
assert.ok(reviewHtml.includes('Install &amp; new Chat'))
assert.ok(reviewHtml.includes('Release details') && reviewHtml.includes(reviewed.contentDigest))
const unsupported = { ...inspection, release: { ...inspection.release, skills: [] } }
const unsupportedHtml = renderToStaticMarkup(<AssistantPluginInstallDialog inline inspection={unsupported} packageLabel="Catalog" installing={false} error={null} onCancel={() => {}} onInstall={() => {}} onInstallAndUse={() => {}} />)
assert.ok(!unsupportedHtml.includes('Install &amp; new Chat'), 'unsupported-only packages have no executable-looking new Chat action')
const page = source('pages/plugins/PluginsPage.tsx')
assert.ok(page.includes('/settings/assistant/plugins?plugin='), 'Manage opens the real plugin settings page')
assert.ok(!page.includes('Downloading and checking this release.'), 'the opaque preparation modal is retired')
assert.equal((page.match(/<PluginDownloadPanel/g) || []).length, 1, 'one shared install-flow declaration retains controller ownership')
assert.ok(page.includes('installContent={!productOpen ? installContent : undefined}'), 'the hidden store must not render a second progress panel')
assert.ok(source('pages/plugins/PluginsPage.css').includes('@starting-style'), 'a progress panel mounted during navigation also animates in')
assert.ok(!page.includes('managedInspection'), 'catalog installs no longer pause for a second review screen')
const hook = source('pages/plugins/usePluginDirectory.ts')
assert.ok(hook.includes('pluginDownloadController.start(name, { install: true, connect:'), 'the explicit install action owns activation and its declared connection continuation')
assert.ok(installedDetail.includes('Checking connection…') && !installedDetail.includes('No servers declared'), 'installed plugins reveal connection setup without a false empty state while loading')
assert.ok(hook.includes('useSyncExternalStore'))
assert.ok(hook.includes('download.installationRevision'), 'catalog refresh follows an install that finishes after route remount')
assert.ok(hook.includes('Plugin installed, but the new Chat could not start.'), 'post-install Chat failures do not claim installation failed')
assert.doesNotMatch(hook.slice(hook.indexOf('return () => {'), hook.indexOf('const loadCatalog')), /cancelPluginDownload|cancelDownload/, 'route cleanup does not cancel background work')
console.log('Assistant Plugin directory: navigation, progress, compact review, supported contributions and explicit install-and-Chat wiring: ok')
