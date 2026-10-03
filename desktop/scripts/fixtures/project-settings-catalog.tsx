import { act, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import type { AssistantProject, AssistantProjectCatalog } from '../../src/shared/assistant/contracts'
import { ProjectSettingsCatalog } from '../../src/renderer/src/pages/settings/ProjectSettingsCatalog'
import { SettingsPageContainer } from '../../src/renderer/src/pages/settings/settings-layout'
import { SettingsPageTabs } from '../../src/renderer/src/pages/settings/SettingsPageTabs'

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
const names = ['Harbor', 'Atlas', 'Beacon', 'Fieldnotes', 'Studio', 'Compass', 'Relay', 'Canvas', 'Library', 'Notebook', 'Garden', 'Terminal', 'Sandbox', 'Ledger', 'Workshop', 'Archive', 'Board', 'Signal', 'Drafts', 'A very long project name that should fit without pushing the actions outside the list']
const project = (name: string, index: number): AssistantProject => ({
    id: `project-${index}`, name, homePath: `C:/internal/homes/${index}`, archived: false, revision: 1,
    createdAt: '2026-01-01', updatedAt: '2026-01-01', folders: [{
        associationId: `association-${index}`, folderId: `folder-${index}`, projectId: `project-${index}`,
        path: `C:/work/projects/${name.toLowerCase().replaceAll(' ', '-')}`, label: name,
        access: index === 1 ? 'read-only' : 'read-write', available: index !== 2,
        createdAt: '2026-01-01', updatedAt: '2026-01-01'
    }]
})
const initial: AssistantProjectCatalog = { migrationVersion: 1, projects: names.map(project), candidates: [{
    id: 'candidate', path: 'C:/work/discovered', suggestedName: 'Discovered', status: 'pending', projectId: null,
    detectedAt: '2026-01-01', updatedAt: '2026-01-01'
}] }
initial.projects[4].folders.push({ ...initial.projects[4].folders[0], associationId: 'second', folderId: 'second', path: 'C:/work/shared-assets' })
initial.projects[5].folders = []
initial.projects.push({ ...project('Older project', 21), archived: true })
const calls: string[] = []
const noop = async () => {}
function Fixture() {
    const [catalog, setCatalog] = useState(initial)
    return <div className="h-screen bg-[var(--settings-bg)]"><SettingsPageContainer title="Projects" fillViewport navigation={<SettingsPageTabs family="projects" />}>
        <ProjectSettingsCatalog catalog={catalog} loading={false} error={null} creating={false}
            onCreate={async () => { calls.push('create') }} onOpenHome={async project => { calls.push(`home:${project.id}`) }}
            onAddFolder={async (id, access) => { calls.push(`add:${id}:${access}`) }} onRemoveFolder={noop}
            onArchive={async (id, archived) => { calls.push(`archive:${id}:${archived}`); setCatalog(current => ({ ...current, projects: current.projects.map(project => project.id === id ? { ...project, archived } : project) })) }}
            onImport={async candidate => { calls.push(`import:${candidate.id}`) }} onDismiss={async id => { calls.push(`dismiss:${id}`) }}
            hasCustomIcon={project => project.id === 'project-0'} onChangeIcon={async project => { calls.push(`icon:${project.id}`) }}
            onRemoveIcon={async project => { calls.push(`remove-icon:${project.id}`) }} onConfigureDiscovery={() => { calls.push('discovery') }} />
    </SettingsPageContainer></div>
}
const host = document.createElement('div'); document.body.append(host)
const root = createRoot(host)
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message) }
const delay = () => new Promise(resolve => setTimeout(resolve, 30))
const list = () => document.querySelector<HTMLUListElement>('ul[aria-label="Projects"]')!
const button = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find(button => button.getAttribute('aria-label') === label || button.textContent === label)!
const click = async (label: string) => { check(button(label), `button exists: ${label}`); await act(async () => { button(label).click(); await delay() }) }
const search = async (value: string) => {
    await act(async () => {
        const input = document.querySelector<HTMLInputElement>('[aria-label="Search project catalog"]')!
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value)
        input.dispatchEvent(new Event('input', { bubbles: true })); await delay()
    })
}
const view = async (value: string) => {
    await act(async () => {
        const select = document.querySelector<HTMLSelectElement>('[aria-label="Project catalog view"]')!
        select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); await delay()
    })
}
const layout = () => {
    const rows = [...list().children].map(row => row.getBoundingClientRect())
    check(rows.every(row => Math.abs(row.left - rows[0].left) < 1), 'rows share one left edge')
    check(rows.every(row => row.right <= innerWidth), 'rows stay inside the viewport')
    const next = button('Next page')
    check(!next || next.getBoundingClientRect().bottom <= innerHeight, 'pagination stays visible')
    const scroller = list().parentElement!
    check(scroller.scrollWidth <= scroller.clientWidth + 1, 'the list has no horizontal overflow')
    check(document.body.scrollWidth <= innerWidth, 'the page has no horizontal overflow')
    check(getComputedStyle(document.querySelector('.zyra-settings-section-body')!).borderTopWidth === '0px', 'catalog has no enclosing card border')
}
Object.assign(window, { catalogCheck: (async () => {
    await act(async () => { root.render(<MemoryRouter initialEntries={['/settings/workspace/projects']}><Fixture /></MemoryRouter>); await delay() })
    check(list().children.length === 12, 'first page shows 12 projects'); layout()
    await click('Next page'); check(list().children.length === 8 && list().textContent?.includes('Sandbox'), 'next page shows remaining projects')
    await search('Atlas'); check(list().children.length === 1 && list().textContent?.includes('Atlas'), 'search resets pagination')
    await search('no-match'); check(document.body.textContent?.includes('No matching projects.') && list().children.length === 0, 'search empty state is honest')
    await search('shared-assets'); check(list().textContent?.includes('Studio'), 'search includes secondary folders')
    await search('')
    await click('View folders for Harbor'); check(document.querySelector('[role="dialog"]')?.textContent?.includes('C:/work/projects/harbor'), 'project name opens real folder details')
    await click('Close dialog')
    await click('Manage Harbor'); check(button('Remove custom icon'), 'custom icon actions stay available')
    await click('Add read-only folder'); check(calls.includes('add:project-0:read-only'), 'folder access reaches the existing callback')
    await click('Manage Harbor'); await click('Open project home'); check(calls.includes('home:project-0'), 'project home action keeps its existing callback')
    await click('Manage Harbor'); await click('Archive project'); check(!list().textContent?.includes('Harbor'), 'archive updates active rows')
    await view('archived'); check(list().children.length === 2, 'archived view reads updated catalog')
    await click('Manage Harbor'); check(!button('Add read-only folder'), 'archived projects do not expose add-folder actions')
    await click('Restore project'); await view('active'); check(list().textContent?.includes('Harbor'), 'restore returns the project to active')
    await view('detected'); check(list().children.length === 1 && list().textContent?.includes('Discovered'), 'detected view shows the candidate')
    await click('Review & import'); await click('Choose folders'); await click('Actions for Discovered'); await click('Dismiss suggestion')
    check(['import:candidate', 'discovery', 'dismiss:candidate'].every(call => calls.includes(call)), 'discovery actions keep their existing callbacks')
    await view('active'); await click('New project'); check(calls.includes('create'), 'new project invokes creation')
    await search(''); layout()
    return ['search and pagination', 'project-name folder details', 'real action callbacks and folder access', 'archive and restore', 'detected review and dismissal', 'wide layout and visible pagination']
})(), catalogNarrowCheck: async () => { await act(async () => { await delay() }); layout(); await click('Next page'); layout(); await click('Previous page'); check(list().textContent?.includes('Harbor'), 'previous page returns to the first projects'); return ['narrow layout and long names without horizontal overflow'] } })
