import { ChevronLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { readSettingsReturnLocation } from './settings-navigation-context'

export function SettingsBackLink({ fallback, fallbackLabel }: { fallback?: string; fallbackLabel?: string }) {
    const location = useLocation()
    const origin = readSettingsReturnLocation(location.state)
    const hasOrigin = origin && origin.pathname !== location.pathname
    if (!hasOrigin && !fallback) return null
    const to = hasOrigin ? { pathname: origin.pathname, search: origin.search, hash: origin.hash } : fallback!
    const state = hasOrigin && origin.parent ? { settingsReturnTo: origin.parent } : null
    return <Link to={to} state={state} replace className="mb-2 inline-flex min-h-6 items-center gap-1 text-[11px] font-medium text-[var(--settings-text-muted)] hover:text-[var(--settings-text)]">
        <ChevronLeft size={13} strokeWidth={1.8} />{hasOrigin ? origin.label : fallbackLabel || 'Back'}
    </Link>
}
