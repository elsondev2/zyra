import assert from 'node:assert/strict'
import type { AssistantSkillConflict } from '../src/shared/assistant/contracts'
import { filterSkillConflicts, moveEnabledSkillSource, skillConflictNeedsReview } from '../src/renderer/src/pages/settings/skill-settings-model'

const conflicts: AssistantSkillConflict[] = [
    { name: 'audit', winnerSourceId: 'codex', winnerSourceLabel: 'Codex', preferredSourceId: null, sources: [{ id: 'codex', label: 'Codex' }, { id: 'pi', label: 'Pi' }] },
    { name: 'release', winnerSourceId: 'pi', winnerSourceLabel: 'Pi', preferredSourceId: 'pi', sources: [{ id: 'codex', label: 'Codex' }, { id: 'pi', label: 'Pi' }] },
    { name: 'project-check', winnerSourceId: 'codex', winnerSourceLabel: 'Codex', preferredSourceId: 'pi', sources: [{ id: 'codex', label: 'Codex' }, { id: 'pi', label: 'Pi' }] }
]

assert.deepEqual(conflicts.map(skillConflictNeedsReview), [true, false, true])
assert.deepEqual(filterSkillConflicts(conflicts, 'unresolved', '').map((conflict) => conflict.name), ['audit', 'project-check'])
assert.deepEqual(filterSkillConflicts(conflicts, 'resolved', '').map((conflict) => conflict.name), ['release'])
assert.deepEqual(filterSkillConflicts(conflicts, 'all', 'CoDeX').map((conflict) => conflict.name), ['audit', 'release', 'project-check'])
assert.deepEqual(filterSkillConflicts(conflicts, 'all', 'project').map((conflict) => conflict.name), ['project-check'])

const order = ['zyra', 'codex', 'claude', 'pi']
const enabled = ['zyra', 'pi', 'codex']
assert.deepEqual(moveEnabledSkillSource(order, enabled, 'pi', -1), ['zyra', 'pi', 'claude', 'codex'])
assert.deepEqual(moveEnabledSkillSource(order, enabled, 'zyra', -1), order)
assert.deepEqual(moveEnabledSkillSource(order, enabled, 'claude', 1), order)

console.log('Skills conflict filtering and active source order: ok')
