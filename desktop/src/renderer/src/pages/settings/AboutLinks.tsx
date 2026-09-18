import type { CSSProperties } from 'react'
import { Bug, CodeXml, UserRound } from 'lucide-react'
import { createSettingsRowTargetId, createSettingsSectionTargetId } from './settings-search'

const links = [
    { label: 'Creator', target: 'Creator GitHub', href: 'https://github.com/justelson', icon: UserRound, color: '#a78bfa' },
    { label: 'Source code', target: 'Source code', href: 'https://github.com/justelson/zyra', icon: CodeXml, color: '#38bdf8' },
    { label: 'Report an issue', target: 'Report an issue', href: 'https://github.com/justelson/zyra/issues', icon: Bug, color: '#fb923c' }
] as const

export function AboutLinks() {
    return <nav aria-label="Zyra links" data-settings-search-target={createSettingsSectionTargetId('Links')} tabIndex={-1} className="grid grid-cols-3 gap-3">
        {links.map(({ label, target, href, icon: Icon, color }) => <a key={href}
            href={href} target="_blank" rel="noopener noreferrer" aria-label={target}
            data-settings-search-target={createSettingsRowTargetId('Links', target)}
            style={{ '--about-link-color': color } as CSSProperties}
            className="flex min-h-24 min-w-0 flex-col items-center justify-center gap-2.5 rounded-lg border border-[color-mix(in_srgb,var(--about-link-color)_30%,var(--settings-border))] bg-[color-mix(in_srgb,var(--about-link-color)_8%,var(--settings-section))] px-2 py-4 text-center transition-[background-color,border-color,transform] hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--about-link-color)_65%,var(--settings-border))] hover:bg-[color-mix(in_srgb,var(--about-link-color)_14%,var(--settings-section))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--about-link-color)] motion-reduce:transform-none motion-reduce:transition-none">
            <Icon size={22} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-[var(--about-link-color)]" />
            <span className="text-[12px] font-medium leading-4 text-[var(--settings-text)]">{label}</span>
        </a>)}
    </nav>
}
