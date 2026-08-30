import assert from 'node:assert/strict'
import { readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdtemp } from 'node:fs/promises'
import { gzipSync } from 'node:zlib'
import { DatabaseSync } from 'node:sqlite'
import {
    BROWSER_THREAT_DATABASE_MAX_BYTES,
    buildBrowserThreatDatabaseFromGzip,
    canonicalizeBrowserThreatUrl,
    hashBrowserThreatUrl,
    isLocalBrowserThreatHostname,
    parseBrowserThreatCsvLine
} from '../../src/browser-threat-feed-core.mjs'
import { isBrowserThreatTestUrl } from '../src/main/browser-threat-protection-policy.ts'

const tempDirectory = await mkdtemp(join(tmpdir(), 'zyra-browser-threat-test-'))
try {
    assert.equal(canonicalizeBrowserThreatUrl('https://Example.com/login#prompt'), 'https://example.com/login')
    assert.equal(canonicalizeBrowserThreatUrl('http://localhost:5173/test'), null)
    assert.equal(canonicalizeBrowserThreatUrl('http://192.168.1.20/test'), null)
    assert.equal(canonicalizeBrowserThreatUrl('file:///tmp/test'), null)
    assert.equal(isBrowserThreatTestUrl('http://www.internetbadguys.com/'), true)
    assert.equal(isBrowserThreatTestUrl('https://www.internetbadguys.com/'), true, 'Chromium HTTPS upgrades must still trigger the harmless canary')
    assert.equal(isBrowserThreatTestUrl('https://internetbadguys.com/'), true)
    assert.equal(isBrowserThreatTestUrl('https://internetbadguys.com.example.test/'), false, 'look-alike hosts must not activate the canary')
    assert.equal(isLocalBrowserThreatHostname('10.0.0.4'), true)
    assert.equal(isLocalBrowserThreatHostname('example.com'), false)
    assert.deepEqual(parseBrowserThreatCsvLine('1,"https://example.test/a,b",yes'), ['1', 'https://example.test/a,b', 'yes'])

    const blockedUrl = 'https://reported-phishing.test/account/verify?step=1'
    const safeUrl = 'https://safe.example.test/'
    const feedPath = join(tempDirectory, 'feed.csv.gz')
    const databasePath = join(tempDirectory, 'browser-threats.sqlite')
    const csv = [
        'phish_id,url,phish_detail_url,submission_time,verified,verification_time,online,target',
        `1,"${blockedUrl}",https://feed.test/1,2026-08-24T00:00:00Z,yes,2026-08-24T00:00:00Z,yes,Example`,
        '2,http://localhost:5173/private,https://feed.test/2,2026-08-24T00:00:00Z,yes,2026-08-24T00:00:00Z,yes,Local'
    ].join('\n')
    await writeFile(feedPath, gzipSync(csv))
    const build = await buildBrowserThreatDatabaseFromGzip({ gzipPath: feedPath, outputPath: databasePath })
    assert.equal(build.entryCount, 1, 'local development URLs must not enter the threat database')
    assert.ok(build.databaseBytes <= BROWSER_THREAT_DATABASE_MAX_BYTES)

    const database = new DatabaseSync(databasePath, { readOnly: true })
    database.exec('PRAGMA query_only = ON; PRAGMA cache_size = -2048; PRAGMA mmap_size = 0;')
    const lookup = database.prepare('SELECT 1 AS found FROM threat_urls WHERE url_hash = ? LIMIT 1')
    assert.ok(lookup.get(hashBrowserThreatUrl(blockedUrl)), 'reported URL should be blocked from the local index')
    assert.equal(lookup.get(hashBrowserThreatUrl(safeUrl)), undefined, 'unknown URL should remain allowed')
    database.close()

    const root = join(import.meta.dirname, '..', '..')
    const [mainSource, browserViewSource, popupSource, warningSource, workspaceSource, tabStripSource, utilityWindowSource, workerSource] = await Promise.all([
        readFile(join(root, 'desktop/src/main/index.ts'), 'utf8'),
        readFile(join(root, 'desktop/src/main/browser-view-manager.ts'), 'utf8'),
        readFile(join(root, 'desktop/src/main/browser-popup-manager.ts'), 'utf8'),
        readFile(join(root, 'desktop/src/renderer/src/pages/assistant/AssistantBrowserThreatWarning.tsx'), 'utf8'),
        readFile(join(root, 'desktop/src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx'), 'utf8'),
        readFile(join(root, 'desktop/src/renderer/src/pages/assistant/AssistantDiffPanel.tsx'), 'utf8'),
        readFile(join(root, 'desktop/src/renderer/src/pages/assistant/utility/AssistantUtilityWindow.tsx'), 'utf8'),
        readFile(join(root, 'src/browser-threat-feed-worker.mjs'), 'utf8')
    ])
    assert.match(browserViewSource, /page\.on\('will-redirect'[\s\S]*guardPageNavigation[\s\S]*blockNavigation/, 'redirects must be checked in Electron main')
    assert.match(popupSource, /pageContents\.on\('will-redirect'[\s\S]*blockNavigation/, 'popup redirects must be checked')
    assert.match(popupSource, /command\.type === 'navigate'[\s\S]{0,200}navigatePopup\(popup, command\.url\)/, 'popup address-bar submissions must use explicit main-owned navigation')
    assert.match(popupSource, /private navigatePopup[\s\S]{0,500}checkUrl\(url\)[\s\S]{0,500}blockNavigation/, 'programmatic popup navigation must invoke threat protection')
    assert.match(popupSource, /if \(warning\) return false\s*}\s*void page\.loadURL\(url\)/, 'a blocked popup address must return before loadURL')
    assert.match(browserViewSource, /initialUrl[\s\S]*this\.navigate\(record, initialUrl\)[\s\S]*blockNavigation/, 'initial pages must pass the main-owned threat check')
    assert.match(warningSource, /Dangerous site blocked/, 'the production warning must explain the block')
    assert.match(warningSource, /Phishing protection works[\s\S]*Continue anyway/, 'the harmless test warning must offer the same deliberate override')
    assert.match(warningSource, /relative z-\[20\] flex h-full w-full/, 'the warning must stay below Browser chrome inside the page viewport')
    assert.match(workspaceSource, /ASSISTANT_BROWSER_DANGEROUS_TAB_TITLE[\s\S]*threatWarning\.tabId === tab\.id/, 'a blocked Browser tab must expose a danger label to the tab strip')
    assert.match(tabStripSource, /threatStatus === 'dangerous'[\s\S]*TriangleAlert[\s\S]*text-\[#ff5a63\]/, 'the blocked tab must replace its page icon with an explicit red danger icon')
    assert.match(tabStripSource, /browserTab\?\.title === ASSISTANT_BROWSER_DANGEROUS_TAB_TITLE/, 'the danger title must preserve the red icon across tab-strip state handoffs')
    assert.match(workspaceSource, /threatWarning && threatWarning\.tabId === activeTab\?\.id[\s\S]*TriangleAlert[\s\S]*text-\[#ff5a63\]/, 'the omnibox must replace its page icon with the same red danger icon')
    assert.match(workspaceSource, /relative z-30 flex h-10/, 'Browser chrome must remain above the warning page')
    assert.match(workspaceSource, /relative isolate min-h-0 flex-1 overflow-hidden/, 'the warning page must be isolated from the Browser chrome stacking context')
    assert.match(utilityWindowSource, /tab\.title === ASSISTANT_BROWSER_DANGEROUS_TAB_TITLE[\s\S]*TriangleAlert[\s\S]*text-\[#ff5a63\]/, 'detached Browser tabs must show the same red danger icon')
    assert.match(workerSource, /data\.phishtank\.com\/data\/online-valid\.csv\.gz/, 'the worker must use the expected feed')
    assert.doesNotMatch(mainSource, /onBeforeRequest[\s\S]*BrowserThreatProtection/, 'threat protection must not replace the existing request listener')

    const stored = await stat(databasePath)
    console.log(`Browser threat protection tests passed (${build.entryCount} indexed fixture, ${stored.size} bytes).`)
} finally {
    await rm(tempDirectory, { recursive: true, force: true })
}
