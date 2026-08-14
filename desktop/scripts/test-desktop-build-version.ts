import assert from 'node:assert/strict'
import { reportHostDesktopVersion } from '../src/renderer/src/lib/release-build-metadata'
import type { DevScopeUpdateState } from '../src/shared/contracts/devscope-api'

const browserFallback: DevScopeUpdateState = {
    enabled: false,
    status: 'disabled',
    currentVersion: '0.1.0',
    currentDisplayVersion: '0.1.0',
    channel: 'alpha',
    repository: '',
    releasePageUrl: '',
    disabledReason: 'Browser preview',
    availableVersion: null,
    availableDisplayVersion: null,
    downloadedVersion: null,
    downloadedDisplayVersion: null,
    downloadPercent: null,
    checkedAt: null,
    message: null,
    errorContext: null,
    canRetry: false
}

assert.deepEqual(
    Object.fromEntries(Object.entries(reportHostDesktopVersion(browserFallback, '0.6.0')).filter(([key]) => ['currentVersion', 'currentDisplayVersion', 'channel'].includes(key))),
    { currentVersion: '0.6.0', currentDisplayVersion: 'v0.6.0', channel: 'stable' },
    'Browser must report its host Desktop build version rather than inherited preview metadata'
)
assert.equal(reportHostDesktopVersion(browserFallback, '0.7.0-beta.12').currentDisplayVersion, 'v0.7.0 beta')
assert.equal(reportHostDesktopVersion(browserFallback, '0.7.0-alpha.2').channel, 'alpha')

const alreadyCurrent = { ...browserFallback, currentVersion: '0.6.0' }
assert.equal(reportHostDesktopVersion(alreadyCurrent, '0.6.0'), alreadyCurrent, 'matching Desktop state stays referentially stable')

console.log('Zyra Desktop/Browser build-version contract: ok')
