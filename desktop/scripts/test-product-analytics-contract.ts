import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import {
    countProjectPackageManagers,
    inspectProjectAnalyticsCapabilities
} from '../src/main/analytics/project-capabilities'
import { projectMarkerMatches } from '../src/main/ipc/project-detection'
import { isBrowserDevscopeBridgePath } from '../src/shared/browser-assistant-bridge'

assert.equal(isBrowserDevscopeBridgePath(['analytics', 'capture']), false)
assert.equal(projectMarkerMatches('*.csproj', ['App.csproj']), true)
assert.equal(projectMarkerMatches('Cargo.toml', ['Cargo.toml']), true)
assert.equal(countProjectPackageManagers(['package-lock.json', 'npm-shrinkwrap.json', 'pnpm-lock.yaml', 'README.md']), 2)
assert.equal(countProjectPackageManagers(['bun.lockb', 'bun.lock', 'yarn.lock']), 2)

const project = await mkdtemp(path.join(os.tmpdir(), 'zyra-analytics-project-'))
try {
    await Promise.all([
        mkdir(path.join(project, '.git')),
        writeFile(path.join(project, 'package.json'), '{}', 'utf8'),
        writeFile(path.join(project, 'package-lock.json'), '{}', 'utf8'),
        writeFile(path.join(project, 'Cargo.toml'), '[package]\nname="fixture"\n', 'utf8'),
        writeFile(path.join(project, 'pnpm-lock.yaml'), 'lockfileVersion: 9\n', 'utf8')
    ])
    assert.deepEqual(await inspectProjectAnalyticsCapabilities(project), {
        has_git: true,
        language_count: 2,
        package_manager_count: 2
    })
} finally {
    await rm(project, { recursive: true, force: true })
}

console.log('Desktop product analytics contracts: ok')
