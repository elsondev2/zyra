import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { SETTINGS_PAGE_VIEWS } from '../src/renderer/src/pages/settings/settings-page-views'
import { SETTINGS_DESTINATIONS } from '../src/renderer/src/pages/settings/settings-navigation'
import { SETTINGS_SEARCH_TARGETS, createSettingsRowTargetId, findAllSettingsSearchMatches, resolveSettingsSearchLocation } from '../src/renderer/src/pages/settings/settings-search'

mock.module('../src/renderer/src/lib/settings', () => ({ useSettings: () => ({ settings: {
    filePreviewOpenInFullscreen: false, filePreviewDefaultMode: 'preview', filePreviewFullscreenShowLeftPanel: true,
    filePreviewFullscreenShowRightPanel: false, filePreviewExplorerNameLayout: 'wrap', fileEditorWordWrap: 'on',
    fileEditorMinimapEnabled: false, fileEditorFontSize: 13, fileCsvDistinctColorsEnabled: true, fileDiffRenderMode: 'stacked'
}, updateSettings: () => {} }) }))
const { default: FilesEditorSettings } = await import('../src/renderer/src/pages/settings/FilesEditorSettings')
const source = (path: string) => readFileSync(new URL(`../src/renderer/src/${path}`, import.meta.url), 'utf8')
assert.deepEqual(SETTINGS_PAGE_VIEWS.files.map(view => view.label), ['Preview', 'Editor'], 'only the supported file settings tabs remain')
assert.ok(!SETTINGS_DESTINATIONS.some(destination => destination.id === 'file-run'), 'run output is not a navigation destination')
assert.ok(!('file-run' in SETTINGS_SEARCH_TARGETS), 'run output is not indexed')
for (const [page, section, label] of [
    ['files-editor', 'File preview', 'Python run target'],
    ['terminal-runtime', 'Terminal', 'Preview panel height']
]) {
    const id = createSettingsRowTargetId(section, label)
    assert.equal(resolveSettingsSearchLocation(page, id), null, `${label} no longer resolves to a removed control`)
    assert.ok(!Object.values(SETTINGS_SEARCH_TARGETS).flat().some(target => target.targetId === id))
    assert.deepEqual(findAllSettingsSearchMatches(label), [], `${label} cannot return stale search results`)
}
for (const view of ['preview', 'editor'] as const) {
    const route = view === 'preview' ? '/settings/workspace/files' : '/settings/workspace/files/editor'
    const html = renderToStaticMarkup(<MemoryRouter initialEntries={[route]}><FilesEditorSettings view={view} /></MemoryRouter>)
    assert.doesNotMatch(html, /Run &amp; output|Python run target|Preview panel height|files\/run/)
    assert.equal((html.match(/aria-current="page"/g) || []).length, 1, `${view} has one active tab`)
    const labels = view === 'preview'
        ? ['Open fullscreen', 'Default mode', 'Fullscreen left panel', 'Fullscreen Edit Inspector', 'Explorer file names']
        : ['Word wrap', 'Minimap', 'Font size', 'CSV colors', 'Diff layout']
    for (const label of labels) assert.ok(html.includes(label), `${view} preserves ${label}`)
}
assert.match(source('App.tsx'), /path="workspace\/files\/run" element=\{<Navigate to="\/settings\/workspace\/files" replace \/>\}/, 'old run URLs redirect to Preview')
assert.doesNotMatch(source('pages/settings/settings-route-loaders.ts'), /'file-run'/)
const files = source('pages/settings/FilesEditorSettings.tsx')
assert.doesNotMatch(files, /'run'|filePreviewPythonRunMode|filePreviewTerminalPanelHeight/)
new Bun.Transpiler({ loader: 'tsx' }).transformSync(files)
console.log('Files & editor: Preview and Editor preserved; unsupported run controls, tabs and search removed; old route redirects: ok')
