import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/renderer/src/pages/project-details/projectDataLifecycle/useProjectGitAutoRefresh.ts', import.meta.url), 'utf8')
const liveStatusSource = readFileSync(new URL('../src/renderer/src/pages/project-details/projectDataLifecycle/useProjectLiveStatusLifecycle.ts', import.meta.url), 'utf8')
const gitCoreSource = readFileSync(new URL('../src/main/inspectors/git/core.ts', import.meta.url), 'utf8')

assert.match(
    source,
    /activeTab !== 'git' \|\| !decodedPath \|\| \(!enteringGitTab && !switchingGitView\)/,
    'stable Git-view rerenders cannot enqueue refresh feedback loops'
)
assert.match(
    source,
    /12000[\s\S]*document\.visibilityState !== 'visible'|document\.visibilityState !== 'visible'[\s\S]*12000/,
    'frequent working-tree polling pauses with a hidden renderer'
)
assert.match(
    source,
    /45000[\s\S]*document\.visibilityState !== 'visible'|document\.visibilityState !== 'visible'[\s\S]*45000/,
    'inactive manual-refresh polling pauses with a hidden renderer'
)
assert.match(
    source,
    /90000[\s\S]*document\.visibilityState !== 'visible'|document\.visibilityState !== 'visible'[\s\S]*90000/,
    'focused Git-view polling pauses with a hidden renderer'
)
assert.match(
    source,
    /const pollSyncStatus = async \(\) => \{\s*if \(document\.visibilityState !== 'visible'\) return/,
    'sync-status sensors do no hidden-window IPC work'
)

assert.match(
    liveStatusSource,
    /!projectPath \|\| document\.visibilityState !== 'visible'/,
    'project process inventory pauses while its renderer is hidden'
)
assert.match(
    liveStatusSource,
    /setInterval\(\(\) => void checkProjectStatus\(\), 15_000\)/,
    'project process inventory uses a bounded fifteen-second cadence'
)
assert.match(
    liveStatusSource,
    /const handleVisibilityChange = \(\) => \{[\s\S]*document\.visibilityState === 'visible'[^\n]*checkProjectStatus[\s\S]*addEventListener\('visibilitychange'/,
    'project live status refreshes promptly when the renderer resumes'
)
assert.doesNotMatch(gitCoreSource, /\bspawnSync\b/, 'first Git discovery must not block Electron main')
assert.match(gitCoreSource, /pathValue[\s\S]{0,180}split\(delimiter\)/, 'Git discovery resolves PATH entries in-process')

console.log('Project Git refresh performance contract: ok')
