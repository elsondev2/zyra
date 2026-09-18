import { findSettingsDestination, findSettingsDestinationById, findSettingsNavigationItem } from './settings-navigation'

export type SettingsReturnLocation = { pathname: string; search: string; hash: string; label: string; parent?: SettingsReturnLocation }

export function readSettingsReturnLocation(state: unknown): SettingsReturnLocation | null {
    const value = (state as { settingsReturnTo?: SettingsReturnLocation } | null)?.settingsReturnTo
    if (!value || typeof value.pathname !== 'string' || !value.pathname.startsWith('/settings/') || value.pathname.includes('..') || value.pathname.includes('\\') || !findSettingsDestination(value.pathname)) return null
    if (typeof value.label !== 'string' || typeof value.search !== 'string' || typeof value.hash !== 'string') return null
    return value
}

export function getSettingsLocationTrail(pathname: string): string[] {
    if (pathname === '/settings' || pathname === '/settings/') return ['Settings']
    const page = findSettingsDestination(pathname)
    if (!page) return ['Settings', findSettingsNavigationItem(pathname).label]
    const parent = page.parentId ? findSettingsDestinationById(page.parentId) : null
    return ['Settings', ...(parent ? [parent.label] : []), page.label]
}

export function settingsDetailNavigationState(location: { pathname: string; search: string; hash: string; state: unknown }) {
    const parent = readSettingsReturnLocation(location.state)
    return { settingsReturnTo: {
        pathname: location.pathname,
        search: location.search,
        hash: location.hash,
        label: getSettingsLocationTrail(location.pathname).slice(1).join(' / '),
        ...(parent ? { parent } : {})
    } satisfies SettingsReturnLocation }
}
