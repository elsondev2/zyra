import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const settingsRoot = join(import.meta.dir, '../src/renderer/src/pages/settings')
const names = [
    'ProjectsSettings.tsx',
    'FilesEditorSettings.tsx',
    'TerminalRuntimeSettings.tsx',
    'TerminalCommandSettings.tsx',
    'GitSettings.tsx',
    'GitTextGenerationSettings.tsx',
    'BrowserControlSettings.tsx',
    'AboutSettings.tsx'
]
const sources = Object.fromEntries(names.map((name) => [name, readFileSync(join(settingsRoot, name), 'utf8')]))

for (const [name, source] of Object.entries(sources)) {
    new Bun.Transpiler({ loader: 'tsx' }).transformSync(source)
    for (const match of source.matchAll(/\bdescription="([^"]+)"/g)) {
        assert.ok((match[1].match(/\.(?:\s|$)/g) || []).length <= 1, `${name} descriptions stay concise`)
    }
}

const projects = sources['ProjectsSettings.tsx']
assert.match(projects, /ProjectsSettings\(\{ view = 'catalog' \}: \{ view\?: 'catalog' \| 'discovery' \| 'presentation' \}\)/)
assert.match(projects, /view === 'catalog' \? <ProjectCatalogSettings \/> : view === 'discovery' \? <ProjectDiscoverySettings \/> : <ProjectPresentationSettings \/>/)
const projectCatalog = projects.split('function ProjectCatalogSettings()')[1].split('function ProjectDiscoverySettings()')[0]
assert.match(projectCatalog, /useAssistantProjectCatalog\(\)/, 'the Project catalog hook mounts only with the catalog view')
assert.equal((projects.match(/useAssistantProjectCatalog\(\)/g) || []).length, 1)
const projectDiscovery = projects.split('function ProjectDiscoverySettings()')[1].split('function ProjectPresentationSettings()')[0]
assert.match(projectDiscovery, /title="Project roots"[\s\S]*title="Indexing"/)
assert.doesNotMatch(projectDiscovery, /ProjectSettingsCatalog|useAssistantProjectCatalog/)
const projectPresentation = projects.split('function ProjectPresentationSettings()')[1]
assert.match(projectPresentation, /<ExplorerPreferencesSections \/>[\s\S]*title="Project icons"/)

const files = sources['FilesEditorSettings.tsx']
assert.match(files, /FilesEditorSettings\(\{ view = 'preview' \}: \{ view\?: 'preview' \| 'editor' \| 'run' \}\)/)
assert.match(files, /view === 'preview'[\s\S]*title="File preview"[\s\S]*view === 'editor'[\s\S]*title="Editor defaults"[\s\S]*title="Run & output"/)
assert.match(files, /createSettingsRowTargetId\('File preview', 'Python run target'\)/, 'the moved Python row keeps its exact search target')
assert.match(files, /createSettingsRowTargetId\('Terminal', 'Preview panel height'\)/, 'the moved panel-height row keeps its exact search target')
assert.match(files, /filePreviewTerminalPanelHeight: Math\.max\(140, Math\.min\(720, Number\(event\.target\.value\) \|\| 220\)\)/)

const terminal = sources['TerminalRuntimeSettings.tsx']
const terminalCommand = sources['TerminalCommandSettings.tsx']
const about = sources['AboutSettings.tsx']
assert.match(terminal, /<TerminalCommandSettings \/>/)
assert.doesNotMatch(terminal, /filePreviewTerminalPanelHeight|title="Preview panel height"/)
assert.match(terminalCommand, /searchSection="Terminal"[\s\S]*title="zyra command"/)
assert.match(terminalCommand, /getTerminalCommandStatus\(\)[\s\S]*removeTerminalCommand\(\)[\s\S]*installTerminalCommand\(\)/)
assert.doesNotMatch(about, /TerminalCommand|zyra command|getTerminalCommandStatus|installTerminalCommand|removeTerminalCommand/)
assert.ok(about.indexOf('title="Updates"') < about.indexOf('title="About Zyra"'), 'update controls appear first')
for (const label of ['Package version', 'Release channel', 'Platform', 'Application stack']) {
    assert.ok(about.includes(`createSettingsRowTargetId('About Zyra', '${label}')`), `${label} keeps its exact search target`)
}

const git = sources['GitSettings.tsx']
const gitWriting = sources['GitTextGenerationSettings.tsx']
assert.match(git, /GitSettings\(\{ view = 'git' \}: \{ view\?: 'git' \| 'pull-requests' \| 'writing' \}\)/)
assert.match(git, /if \(view !== 'git'\) return[\s\S]*getGlobalGitUser\(\)/, 'hidden Git views do not load global identity')
assert.match(git, /view === 'writing' \? <GitTextGenerationSettings \/> : view === 'pull-requests'/)
assert.match(gitWriting, /to="\/settings\/workspace\/source-control\/writing\/connections" title="Writing services"/)
assert.match(gitWriting, /to="\/settings\/workspace\/source-control\/writing\/logs" title="Writing logs"/)
for (const target of [
    "createSettingsRowTargetId('Providers', 'Default Git AI provider')",
    "createSettingsRowTargetId('Zyra · ChatGPT', 'Commit model')",
    "createSettingsRowTargetId('Zyra · ChatGPT', 'Pull-request model')"
]) assert.ok(gitWriting.includes(target), `${target} stays stable`)

const browser = sources['BrowserControlSettings.tsx']
assert.match(browser, /BrowserControlSettings\(\{ view = 'browsing' \}: \{ view\?: 'browsing' \| 'privacy' \| 'data' \}\)/)
assert.match(browser, /useEffect\(\(\) => \{\s*if \(view !== 'data'\) return[\s\S]*getBrowserHistory/, 'site-data inspection runs only in the data view')
assert.match(browser, /view === 'browsing'[\s\S]*title="Browsing"[\s\S]*view === 'privacy'[\s\S]*title="Browser privacy"[\s\S]*title="Site data"/)
assert.equal((browser.match(/searchSection="Browser workspace"/g) || []).length, 3, 'Browser exact-row IDs remain under their original search section')
assert.match(browser, /window\.confirm\('Clear visited addresses and omnibox suggestions from Zyra Browser\?'\)/)
assert.match(browser, /window\.confirm\('Sign out of every website in Zyra Browser\? History and cached files will stay\.'\)/)
assert.match(browser, /window\.confirm\('Reset Zyra’s complete local Browser profile,[^']+cannot be undone\.'\)/)
assert.doesNotMatch(browser, /setBrowserAdBlockEnabled[\s\S]{0,500}updateSettings\(\{[\s\S]{0,160}assistantBrowserAdBlockEnabled/, 'ad-block failures cannot persist an optimistic toggle')

console.log('Scoped Settings redistribution, lazy view state, stable row targets and preserved safety controls: ok')
