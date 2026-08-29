import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { BrowserHistoryStore } from '../src/main/browser-history-store'
import { ExternalBrowserHistoryService } from '../src/main/external-browser-history/service'
import { discoverExternalBrowserHistoryProfiles, type DiscoveredExternalHistoryProfile } from '../src/main/external-browser-history/source-registry'
import { chromiumHistoryTimestamp, firefoxHistoryTimestamp, safariHistoryTimestamp } from '../src/main/external-browser-history/source-reader'

assert.equal(chromiumHistoryTimestamp(11_644_473_600_000_000n + 1_700_000_000_000_000n), '2023-11-14T22:13:20.000Z')
assert.equal(firefoxHistoryTimestamp(1_700_000_000_000_000n), '2023-11-14T22:13:20.000Z')
assert.equal(safariHistoryTimestamp(1_700_000_000 - 978_307_200), '2023-11-14T22:13:20.000Z')
assert.equal(chromiumHistoryTimestamp(0), null, 'invalid historical timestamps are skipped')

const root = await mkdtemp(join(tmpdir(), 'zyra-external-browser-history-'))
try {
    const home = join(root, 'home')
    const env: NodeJS.ProcessEnv = {}
    let chromiumProfileDirectory = ''
    let firefoxRoot = ''
    if (process.platform === 'win32') {
        env.LOCALAPPDATA = join(root, 'local')
        env.APPDATA = join(root, 'roaming')
        chromiumProfileDirectory = join(env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data', 'Default')
        firefoxRoot = join(env.APPDATA, 'Mozilla', 'Firefox')
    } else if (process.platform === 'darwin') {
        chromiumProfileDirectory = join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'Default')
        firefoxRoot = join(home, 'Library', 'Application Support', 'Firefox')
    } else {
        env.XDG_CONFIG_HOME = join(home, '.config')
        chromiumProfileDirectory = join(env.XDG_CONFIG_HOME, 'google-chrome', 'Default')
        firefoxRoot = join(home, '.mozilla', 'firefox')
    }
    await mkdir(chromiumProfileDirectory, { recursive: true })
    await writeFile(join(chromiumProfileDirectory, 'History'), 'synthetic')
    await writeFile(join(dirname(chromiumProfileDirectory), 'Local State'), JSON.stringify({ profile: { info_cache: { Default: { name: 'Personal', user_name: 'person@example.com' } } } }))
    await mkdir(join(firefoxRoot, 'Profiles', 'test.default'), { recursive: true })
    await writeFile(join(firefoxRoot, 'Profiles', 'test.default', 'places.sqlite'), 'synthetic')
    await writeFile(join(firefoxRoot, 'profiles.ini'), '[Profile0]\nName=Personal\nIsRelative=1\nPath=Profiles/test.default\n')

    const discovered = await discoverExternalBrowserHistoryProfiles({ platform: process.platform, home, env })
    assert.equal(discovered.some((profile) => profile.browserId === 'chrome' && profile.profileName === 'Personal' && profile.accountHint === 'person@example.com'), true)
    assert.equal(discovered.some((profile) => profile.browserId === 'firefox' && profile.profileName === 'Personal'), true)

    const syntheticProfiles: DiscoveredExternalHistoryProfile[] = [
        {
            browserId: 'chrome', browserName: 'Google Chrome', profileName: 'Personal', accountHint: 'person@example.com', family: 'chromium', support: 'supported', databasePath: join(root, 'chrome-history'), status: 'ready'
        },
        {
            browserId: 'firefox', browserName: 'Firefox', profileName: 'Work', accountHint: null, family: 'firefox', support: 'supported', databasePath: join(root, 'firefox-history'), status: 'ready'
        }
    ]
    const historyStore = new BrowserHistoryStore(join(root, 'zyra-history.json'))
    const service = new ExternalBrowserHistoryService(historyStore, {
        home: () => home,
        discover: async () => syntheticProfiles,
        read: async ({ family }) => ({
            skipped: 0,
            rows: family === 'chromium' ? [
                { url: 'https://example.com/docs?client_secret=remove-me', title: 'Docs', visitCount: 3, lastVisitedAt: '2026-01-02T12:00:00.000Z' }
            ] : [
                { url: 'https://example.com/docs', title: 'Documentation', visitCount: 4, lastVisitedAt: '2026-01-03T12:00:00.000Z' },
                { url: 'https://mozilla.org/', title: 'Mozilla', visitCount: 2, lastVisitedAt: '2026-01-01T12:00:00.000Z' }
            ]
        })
    })

    const scan = await service.scan()
    assert.equal(scan.profiles.length, 2)
    assert.equal(JSON.stringify(scan).includes(root), false, 'renderer scan results never expose profile paths')
    const imported = await service.import({
        scanToken: scan.scanToken,
        sourceTokens: scan.profiles.map((profile) => profile.sourceToken),
        scope: 'all'
    })
    assert.equal(imported.importedProfiles, 2)
    assert.equal(imported.added, 2)
    assert.equal(imported.duplicatesMerged, 1)
    const stored = await historyStore.list({ limit: 10 })
    assert.equal(stored.find((entry) => entry.url === 'https://example.com/docs')?.visitCount, 7)
    assert.equal(stored.some((entry) => entry.url.includes('client_secret')), false)

    const secondScan = await service.scan()
    const secondImport = await service.import({
        scanToken: secondScan.scanToken,
        sourceTokens: secondScan.profiles.map((profile) => profile.sourceToken),
        scope: 'all'
    })
    assert.equal(secondImport.added, 0, 'reimport is idempotent at the target URL identity')
    assert.equal((await historyStore.list({ limit: 10 })).find((entry) => entry.url === 'https://example.com/docs')?.visitCount, 7, 'reimport does not multiply imported counts')

    console.log('External Browser history import: ok')
} finally {
    await rm(root, { recursive: true, force: true })
}
