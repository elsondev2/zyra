import { access, lstat, readFile, readdir } from 'node:fs/promises'
import { constants } from 'node:fs'
import { basename, isAbsolute, join, resolve } from 'node:path'
import type { ExternalBrowserHistoryFamily, ExternalBrowserHistorySupport } from '../../shared/external-browser-history-contracts'

export type DiscoveredExternalHistoryProfile = {
    browserId: string
    browserName: string
    profileName: string
    accountHint: string | null
    family: ExternalBrowserHistoryFamily
    support: ExternalBrowserHistorySupport
    databasePath: string
    status: 'ready' | 'permission-required' | 'locked'
}

type SourceRoot = {
    browserId: string
    browserName: string
    family: ExternalBrowserHistoryFamily
    support: ExternalBrowserHistorySupport
    root: string
    directProfile?: boolean
}

function cleanLabel(value: unknown, fallback: string): string {
    const label = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
    return label || fallback
}

function cleanAccountHint(value: unknown): string | null {
    const candidate = String(value || '').trim().toLowerCase().slice(0, 160)
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null
}

function sourceRoots(platform: NodeJS.Platform, home: string, env: NodeJS.ProcessEnv): SourceRoot[] {
    const local = env.LOCALAPPDATA || join(home, 'AppData', 'Local')
    const roaming = env.APPDATA || join(home, 'AppData', 'Roaming')
    const config = env.XDG_CONFIG_HOME || join(home, '.config')
    if (platform === 'win32') return [
        ['chrome', 'Google Chrome', join(local, 'Google', 'Chrome', 'User Data'), 'supported'],
        ['chrome-beta', 'Google Chrome Beta', join(local, 'Google', 'Chrome Beta', 'User Data'), 'supported'],
        ['chrome-dev', 'Google Chrome Dev', join(local, 'Google', 'Chrome Dev', 'User Data'), 'supported'],
        ['chrome-canary', 'Google Chrome Canary', join(local, 'Google', 'Chrome SxS', 'User Data'), 'supported'],
        ['edge', 'Microsoft Edge', join(local, 'Microsoft', 'Edge', 'User Data'), 'supported'],
        ['edge-beta', 'Microsoft Edge Beta', join(local, 'Microsoft', 'Edge Beta', 'User Data'), 'supported'],
        ['edge-dev', 'Microsoft Edge Dev', join(local, 'Microsoft', 'Edge Dev', 'User Data'), 'supported'],
        ['brave', 'Brave', join(local, 'BraveSoftware', 'Brave-Browser', 'User Data'), 'best-effort'],
        ['chromium', 'Chromium', join(local, 'Chromium', 'User Data'), 'supported'],
        ['vivaldi', 'Vivaldi', join(local, 'Vivaldi', 'User Data'), 'best-effort'],
        ['arc', 'Arc', join(local, 'Packages', 'TheBrowserCompany.Arc_ttt1ap7aakyb4', 'LocalCache', 'Local', 'Arc', 'User Data'), 'best-effort'],
        ['yandex', 'Yandex Browser', join(local, 'Yandex', 'YandexBrowser', 'User Data'), 'best-effort'],
        ['thorium', 'Thorium', join(local, 'Thorium', 'User Data'), 'best-effort'],
        ['opera', 'Opera', join(roaming, 'Opera Software', 'Opera Stable'), 'best-effort', true],
        ['opera-gx', 'Opera GX', join(roaming, 'Opera Software', 'Opera GX Stable'), 'best-effort', true],
        ['firefox', 'Firefox', join(roaming, 'Mozilla', 'Firefox'), 'supported'],
        ['librewolf', 'LibreWolf', join(roaming, 'librewolf'), 'best-effort'],
        ['waterfox', 'Waterfox', join(roaming, 'Waterfox'), 'best-effort'],
        ['floorp', 'Floorp', join(roaming, 'Floorp'), 'best-effort'],
        ['zen', 'Zen Browser', join(roaming, 'zen'), 'best-effort']
    ].map(([browserId, browserName, root, support, directProfile]) => ({
        browserId: String(browserId), browserName: String(browserName), root: String(root),
        family: String(browserId).includes('firefox') || ['librewolf', 'waterfox', 'floorp', 'zen'].includes(String(browserId)) ? 'firefox' : 'chromium',
        support: support as ExternalBrowserHistorySupport,
        directProfile: Boolean(directProfile)
    }))
    if (platform === 'darwin') return [
        { browserId: 'chrome', browserName: 'Google Chrome', root: join(home, 'Library', 'Application Support', 'Google', 'Chrome'), family: 'chromium', support: 'supported' },
        { browserId: 'edge', browserName: 'Microsoft Edge', root: join(home, 'Library', 'Application Support', 'Microsoft Edge'), family: 'chromium', support: 'supported' },
        { browserId: 'brave', browserName: 'Brave', root: join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser'), family: 'chromium', support: 'best-effort' },
        { browserId: 'chromium', browserName: 'Chromium', root: join(home, 'Library', 'Application Support', 'Chromium'), family: 'chromium', support: 'supported' },
        { browserId: 'vivaldi', browserName: 'Vivaldi', root: join(home, 'Library', 'Application Support', 'Vivaldi'), family: 'chromium', support: 'best-effort' },
        { browserId: 'arc', browserName: 'Arc', root: join(home, 'Library', 'Application Support', 'Arc', 'User Data'), family: 'chromium', support: 'best-effort' },
        { browserId: 'yandex', browserName: 'Yandex Browser', root: join(home, 'Library', 'Application Support', 'Yandex', 'YandexBrowser'), family: 'chromium', support: 'best-effort' },
        { browserId: 'thorium', browserName: 'Thorium', root: join(home, 'Library', 'Application Support', 'Thorium'), family: 'chromium', support: 'best-effort' },
        { browserId: 'opera', browserName: 'Opera', root: join(home, 'Library', 'Application Support', 'com.operasoftware.Opera'), family: 'chromium', support: 'best-effort', directProfile: true },
        { browserId: 'opera-gx', browserName: 'Opera GX', root: join(home, 'Library', 'Application Support', 'com.operasoftware.OperaGX'), family: 'chromium', support: 'best-effort', directProfile: true },
        { browserId: 'firefox', browserName: 'Firefox', root: join(home, 'Library', 'Application Support', 'Firefox'), family: 'firefox', support: 'supported' },
        { browserId: 'zen', browserName: 'Zen Browser', root: join(home, 'Library', 'Application Support', 'zen'), family: 'firefox', support: 'best-effort' },
        { browserId: 'safari', browserName: 'Safari', root: join(home, 'Library', 'Safari'), family: 'safari', support: 'best-effort', directProfile: true }
    ]
    return [
        { browserId: 'chrome', browserName: 'Google Chrome', root: join(config, 'google-chrome'), family: 'chromium', support: 'supported' },
        { browserId: 'chrome-beta', browserName: 'Google Chrome Beta', root: join(config, 'google-chrome-beta'), family: 'chromium', support: 'supported' },
        { browserId: 'chromium', browserName: 'Chromium', root: join(config, 'chromium'), family: 'chromium', support: 'supported' },
        { browserId: 'edge', browserName: 'Microsoft Edge', root: join(config, 'microsoft-edge'), family: 'chromium', support: 'supported' },
        { browserId: 'brave', browserName: 'Brave', root: join(config, 'BraveSoftware', 'Brave-Browser'), family: 'chromium', support: 'best-effort' },
        { browserId: 'vivaldi', browserName: 'Vivaldi', root: join(config, 'vivaldi'), family: 'chromium', support: 'best-effort' },
        { browserId: 'yandex', browserName: 'Yandex Browser', root: join(config, 'yandex-browser'), family: 'chromium', support: 'best-effort' },
        { browserId: 'thorium', browserName: 'Thorium', root: join(config, 'thorium'), family: 'chromium', support: 'best-effort' },
        { browserId: 'opera', browserName: 'Opera', root: join(config, 'opera'), family: 'chromium', support: 'best-effort', directProfile: true },
        { browserId: 'firefox', browserName: 'Firefox', root: join(home, '.mozilla', 'firefox'), family: 'firefox', support: 'supported' },
        { browserId: 'firefox-flatpak', browserName: 'Firefox Flatpak', root: join(home, '.var', 'app', 'org.mozilla.firefox', '.mozilla', 'firefox'), family: 'firefox', support: 'best-effort' },
        { browserId: 'firefox-snap', browserName: 'Firefox Snap', root: join(home, 'snap', 'firefox', 'common', '.mozilla', 'firefox'), family: 'firefox', support: 'best-effort' },
        { browserId: 'librewolf', browserName: 'LibreWolf', root: join(config, 'librewolf'), family: 'firefox', support: 'best-effort' },
        { browserId: 'waterfox', browserName: 'Waterfox', root: join(home, '.waterfox'), family: 'firefox', support: 'best-effort' },
        { browserId: 'floorp', browserName: 'Floorp', root: join(home, '.floorp'), family: 'firefox', support: 'best-effort' },
        { browserId: 'zen', browserName: 'Zen Browser', root: join(home, '.zen'), family: 'firefox', support: 'best-effort' }
    ]
}

async function readableStatus(path: string): Promise<'ready' | 'permission-required'> {
    try {
        await access(path, constants.R_OK)
        return 'ready'
    } catch {
        return 'permission-required'
    }
}

async function readChromiumProfileNames(root: string): Promise<Record<string, { name: string; accountHint: string | null }>> {
    try {
        const parsed = JSON.parse(await readFile(join(root, 'Local State'), 'utf8')) as { profile?: { info_cache?: Record<string, { name?: string; user_name?: string }> } }
        return Object.fromEntries(Object.entries(parsed.profile?.info_cache || {}).map(([id, value]) => [id, {
            name: cleanLabel(value?.name, id),
            accountHint: cleanAccountHint(value?.user_name)
        }]))
    } catch {
        return {}
    }
}

async function discoverChromium(root: SourceRoot): Promise<DiscoveredExternalHistoryProfile[]> {
    const names = await readChromiumProfileNames(root.root)
    const candidates: Array<{ directory: string; name: string }> = []
    if (root.directProfile) candidates.push({ directory: root.root, name: 'Default' })
    try {
        for (const entry of await readdir(root.root, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.isSymbolicLink()) continue
            if (entry.name !== 'Default' && !/^Profile \d+$/.test(entry.name)) continue
            candidates.push({ directory: join(root.root, entry.name), name: names[entry.name]?.name || entry.name })
        }
    } catch {
        return []
    }
    const profiles: DiscoveredExternalHistoryProfile[] = []
    for (const candidate of candidates) {
        const databasePath = join(candidate.directory, 'History')
        try {
            const info = await lstat(databasePath)
            if (!info.isFile() || info.isSymbolicLink()) continue
        } catch {
            continue
        }
        profiles.push({
            browserId: root.browserId,
            browserName: root.browserName,
            profileName: cleanLabel(candidate.name, basename(candidate.directory)),
            accountHint: names[basename(candidate.directory)]?.accountHint || null,
            family: 'chromium',
            support: root.support,
            databasePath,
            status: await readableStatus(databasePath)
        })
    }
    return profiles
}

function parseFirefoxProfilesIni(contents: string, root: string): Array<{ path: string; name: string }> {
    const sections = contents.split(/^\s*\[/m).map((section) => section.replace(/\]\s*$/m, ''))
    return sections.flatMap((section) => {
        const lines = section.split(/\r?\n/)
        const values = Object.fromEntries(lines.flatMap((line) => {
            const index = line.indexOf('=')
            return index > 0 ? [[line.slice(0, index).trim(), line.slice(index + 1).trim()]] : []
        }))
        if (!values.Path) return []
        const profilePath = values.IsRelative === '0' && isAbsolute(values.Path) ? values.Path : resolve(root, values.Path)
        return [{ path: profilePath, name: cleanLabel(values.Name, basename(profilePath)) }]
    })
}

async function readFirefoxAccountHint(profilePath: string): Promise<string | null> {
    try {
        const parsed = JSON.parse(await readFile(join(profilePath, 'signedInUser.json'), 'utf8')) as {
            accountData?: { email?: string }
            account?: { email?: string }
        }
        return cleanAccountHint(parsed.accountData?.email || parsed.account?.email)
    } catch {
        return null
    }
}

async function discoverFirefox(root: SourceRoot): Promise<DiscoveredExternalHistoryProfile[]> {
    let candidates: Array<{ path: string; name: string }> = []
    try {
        candidates = parseFirefoxProfilesIni(await readFile(join(root.root, 'profiles.ini'), 'utf8'), root.root)
    } catch {
        try {
            candidates = (await readdir(root.root, { withFileTypes: true }))
                .filter((entry) => entry.isDirectory() && !entry.isSymbolicLink())
                .map((entry) => ({ path: join(root.root, entry.name), name: entry.name }))
        } catch {
            return []
        }
    }
    const profiles: DiscoveredExternalHistoryProfile[] = []
    for (const candidate of candidates) {
        const databasePath = join(candidate.path, 'places.sqlite')
        try {
            const info = await lstat(databasePath)
            if (!info.isFile() || info.isSymbolicLink()) continue
        } catch {
            continue
        }
        profiles.push({
            browserId: root.browserId,
            browserName: root.browserName,
            profileName: cleanLabel(candidate.name, basename(candidate.path)),
            accountHint: await readFirefoxAccountHint(candidate.path),
            family: 'firefox',
            support: root.support,
            databasePath,
            status: await readableStatus(databasePath)
        })
    }
    return profiles
}

async function discoverSafari(root: SourceRoot): Promise<DiscoveredExternalHistoryProfile[]> {
    const databasePath = join(root.root, 'History.db')
    try {
        const info = await lstat(databasePath)
        if (!info.isFile() || info.isSymbolicLink()) return []
    } catch {
        return []
    }
    return [{
        browserId: root.browserId,
        browserName: root.browserName,
        profileName: 'Default',
        accountHint: null,
        family: 'safari',
        support: root.support,
        databasePath,
        status: await readableStatus(databasePath)
    }]
}

export async function discoverExternalBrowserHistoryProfiles(input: {
    platform?: NodeJS.Platform
    home: string
    env?: NodeJS.ProcessEnv
}): Promise<DiscoveredExternalHistoryProfile[]> {
    const roots = sourceRoots(input.platform || process.platform, input.home, input.env || process.env)
    const discovered = await Promise.all(roots.map((root) => root.family === 'chromium'
        ? discoverChromium(root)
        : root.family === 'firefox'
            ? discoverFirefox(root)
            : discoverSafari(root)))
    const seen = new Set<string>()
    return discovered.flat().filter((profile) => {
        const key = resolve(profile.databasePath).toLowerCase()
        if (seen.has(key)) return false
        seen.add(key)
        return true
    }).sort((left, right) => left.browserName.localeCompare(right.browserName) || left.profileName.localeCompare(right.profileName))
}
