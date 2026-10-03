import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import type { AssistantSkillSourceOverviewPayload } from '../src/shared/assistant/contracts'
import { SkillConflictsPage } from '../src/renderer/src/pages/settings/SkillConflictsPage'
import { getSettingsLocationTrail } from '../src/renderer/src/pages/settings/settings-navigation-context'

const overview: AssistantSkillSourceOverviewPayload = {
    settings: { version: 1, enabledSourceIds: ['codex', 'pi'], priority: ['codex', 'pi'], preferredSourceBySkill: {}, customSources: [] },
    sources: [],
    conflicts: [
        { name: 'audit', winnerSourceId: 'codex', winnerSourceLabel: 'Codex', preferredSourceId: null, sources: [{ id: 'codex', label: 'Codex' }, { id: 'pi', label: 'Pi' }] },
        { name: 'release', winnerSourceId: 'pi', winnerSourceLabel: 'Pi', preferredSourceId: 'pi', sources: [{ id: 'codex', label: 'Codex' }, { id: 'pi', label: 'Pi' }] }
    ],
    diagnostics: []
}

const render = (value: AssistantSkillSourceOverviewPayload) => renderToStaticMarkup(<MemoryRouter>
    <SkillConflictsPage overview={value} loading={false} saving={false} error={null} onRefresh={() => {}} onPreferenceChange={() => {}} />
</MemoryRouter>)

const initial = render(overview)
assert.match(initial, /Unresolved<span[^>]*>1<\/span><\/button>/)
assert.match(initial, /aria-pressed="true"/)
assert.match(initial, /audit/)
assert.doesNotMatch(initial, /Source for release/, 'resolved names stay out of the default view')
assert.match(initial, /Source for audit/)
assert.match(initial, /About skill name conflicts/, 'detail guidance lives in the info tip')
assert.doesNotMatch(render({ ...overview, conflicts: [] }), /Source for audit/)
assert.match(render({ ...overview, conflicts: [] }), /Nothing to review/)
assert.deepEqual(getSettingsLocationTrail('/settings/assistant/skills/conflicts'), ['Settings', 'Skills', 'Skill name conflicts'])

const route = readFileSync(new URL('../src/renderer/src/App.tsx', import.meta.url), 'utf8')
assert.match(route, /path="assistant\/skills\/conflicts" element=\{<SkillsSettings view="conflicts" \/>\}/)
console.log('Skills conflict page: default unresolved view, empty state, info tip and routed back trail: ok')
