import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const processDetectorSource = readFileSync(new URL('../src/main/inspectors/process-detector.ts', import.meta.url), 'utf8')
const projectDetailsSource = readFileSync(new URL('../src/main/ipc/handlers/project-details-handlers.ts', import.meta.url), 'utf8')
const gitOverviewSource = readFileSync(new URL('../src/main/inspectors/git/read-repo-state.ts', import.meta.url), 'utf8')

assert.match(
    processDetectorSource,
    /const runningLocalServerScans = new Map[\s\S]*cached\.expiresAt > now[\s\S]*return cached\.promise/,
    'simultaneous Browser surfaces share one local-server scan'
)
assert.match(
    processDetectorSource,
    /const listeners = await getPortListeners\(\)[\s\S]*if \(listeners\.size === 0\) return \[\][\s\S]*readProcessInventory/,
    'an unavailable listener inventory cannot trigger an unnecessary process scan'
)
assert.match(
    processDetectorSource,
    /processInventoryCache[\s\S]*expiresAt: Number\.POSITIVE_INFINITY, promise/,
    'project status and Browser discovery share one in-flight process inventory'
)
assert.match(
    processDetectorSource,
    /portInventoryCache[\s\S]*scanPortListeners[\s\S]*expiresAt: Number\.POSITIVE_INFINITY, promise/,
    'project status and Browser discovery share one in-flight listener inventory'
)
assert.match(
    projectDetailsSource,
    /const projectDetailsCache = new Map[\s\S]*cached\.expiresAt > now[\s\S]*return cached\.promise/,
    'concurrent project-detail consumers share one filesystem inspection'
)
assert.match(
    projectDetailsSource,
    /handleInstallProjectDependencies[\s\S]*projectDetailsCache\.delete\(projectDetailsCacheKey\(projectPath\)\)/,
    'dependency installation invalidates cached project details'
)
assert.match(
    gitOverviewSource,
    /const projectGitOverviewCache = new Map[\s\S]*cached\.expiresAt > now[\s\S]*return cached\.promise/,
    'concurrent project-overview batches share repository reads'
)
assert.match(
    gitOverviewSource,
    /PROJECT_GIT_OVERVIEW_CACHE_TTL_MS = 2_000/,
    'git overview retention is brief enough to preserve post-mutation freshness'
)

console.log('Main read coalescing contract: ok')
