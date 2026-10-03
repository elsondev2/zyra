import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { mock } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { AssistantProject, AssistantProjectCatalog } from '../src/shared/assistant/contracts'

mock.module('../src/renderer/src/pages/assistant/AssistantProjectIcon', () => ({
    AssistantProjectIcon: () => <span data-project-icon />
}))
const { ProjectSettingsCatalog } = await import('../src/renderer/src/pages/settings/ProjectSettingsCatalog')
const project = (index: number): AssistantProject => ({
    id: `project-${index}`, name: `Harbor ${index}`, homePath: `C:/internal/project-homes/${index}`,
    archived: false, revision: 1, createdAt: '2026-01-01', updatedAt: '2026-01-01',
    folders: [{ associationId: `association-${index}`, folderId: `folder-${index}`, projectId: `project-${index}`,
        path: `C:/work/harbor-${index}`, label: `harbor-${index}`, access: 'read-write', available: index !== 0,
        createdAt: '2026-01-01', updatedAt: '2026-01-01' }]
})
const catalog: AssistantProjectCatalog = { migrationVersion: 1, projects: Array.from({ length: 20 }, (_, index) => project(index)), candidates: [] }
catalog.projects[1].folders = []
catalog.projects[2].folders.push({ ...catalog.projects[2].folders[0], associationId: 'second', folderId: 'second', path: 'C:/work/shared' })
catalog.projects.push({ ...project(21), archived: true })
const noop = async () => {}
const props = { catalog, loading: false, error: null, creating: false,
    onCreate: noop, onOpenHome: noop, onAddFolder: noop, onRemoveFolder: noop, onArchive: noop,
    onImport: noop, onDismiss: noop, hasCustomIcon: () => false, onChangeIcon: noop, onRemoveIcon: noop, onConfigureDiscovery: () => {} }
const render = (overrides = {}) => renderToStaticMarkup(<ProjectSettingsCatalog {...props} {...overrides} />)
const html = render()
assert.match(html, /aria-label="Projects"/, 'projects use one semantic list')
assert.equal((html.match(/<li\b/g) || []).length, 12, 'only the current page is rendered')
assert.doesNotMatch(html, /sm:grid-cols-2|rounded-lg border|associated folder/, 'the repeated card framing and metadata are removed')
assert.doesNotMatch(html, /C:\/internal\/project-homes/, 'internal home paths stay out of the browse list')
assert.match(html, /C:\/work\/harbor-0/, 'the actual associated folder is shown')
assert.match(html, /Project home/, 'projects without associated folders have an honest fallback')
assert.match(html, /2 folders/, 'multiple folders remain discoverable')
assert.match(html, /Folder unavailable/, 'unavailable state stays visible')
assert.match(html, /aria-label="View folders for Harbor 0"/, 'the project identity opens folder details')
assert.match(html, /aria-label="Manage Harbor 0"/, 'icon-only actions retain a name')
assert.doesNotMatch(html, />Manage<|Harbor 21/, 'management text and archived entries do not clutter active rows')
assert.match(html, /Active \(20\)/)
assert.match(html, /Archived \(1\)/)
assert.match(html, /1–12 of 20/)
assert.match(render({ catalog: { ...catalog, projects: [] } }), /No active projects\./)
assert.doesNotMatch(render({ loading: true, catalog: { ...catalog, projects: [] } }), /No active projects\./)
assert.match(render({ error: 'Catalog unavailable' }), /Catalog unavailable/)
assert.match(render({ creating: true }), /<button[^>]*disabled=""[^>]*>[\s\S]*?New project/)

const source = readFileSync(new URL('../src/renderer/src/pages/settings/ProjectSettingsCatalog.tsx', import.meta.url), 'utf8')
new Bun.Transpiler({ loader: 'tsx' }).transformSync(source)
for (const action of ['View folders', 'Open project home', 'Add folder', 'Add read-only folder', 'Set custom icon', 'Remove custom icon', 'Restore project', 'Archive project', 'Review & import', 'Dismiss suggestion']) {
    assert.ok(source.includes(action), `${action} is preserved`)
}
console.log('Project catalog: compact rows, real locations, accessible actions, pagination and honest states: ok')
