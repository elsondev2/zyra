import { openDesktopLink } from '@/lib/desktop-links'
import { useState, type ReactNode } from 'react'
import { ArrowUpRight, BookOpen, ChevronDown, ChevronRight, Code2, Globe2, LayoutPanelTop, Plug, Plus, ScrollText, Server, Settings2, ShieldCheck, type LucideIcon } from 'lucide-react'
import type { AssistantPluginCatalog, AssistantPluginInstallation } from '@shared/assistant/contracts'
import storeCatalog from '@shared/plugins/openai-directory.json'
import { StoreIcon } from './PluginStore'
import { DirectoryEmpty } from './PluginDirectoryLists'
import { getPluginRelease } from './plugin-directory-state'
import { SettingsInfoTooltip } from '../settings/SettingsInfoTooltip'
import { PluginMcpConnections } from './PluginMcpConnections'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'
import { PluginSkillIcon, shortSkillDescription, UseInChatIcon } from './plugin-presentation'

type Entry = typeof storeCatalog.entries[number]

export function PluginProductPage({ entry, installation, catalog, busy, canInstall, installContent, onBack, onInstall, onUseInChat, onManage }: {
    entry: Entry | null
    installation: AssistantPluginInstallation | null
    catalog: AssistantPluginCatalog | null
    busy: boolean
    canInstall: boolean
    installContent?: ReactNode
    onBack: () => void
    onInstall: (name: string) => void
    onUseInChat: (id: string) => void
    onManage: (id: string) => void
}) {
    const [error, setError] = useState<string | null>(null)
    const [skillsOpen, setSkillsOpen] = useState(false)
    const release = installation && catalog ? getPluginRelease(catalog, installation) : null
    const manifest = release?.manifest
    const name = manifest?.interface.displayName || entry?.displayName || installation?.name
    const description = manifest ? manifest.interface.shortDescription || manifest.description : entry?.description
    const longDescription = manifest ? manifest.interface.longDescription : entry?.longDescription
    const hasSkills = release ? release.skills.length > 0 : Boolean(entry?.hasSkills)
    const hasMcp = release ? Boolean(manifest?.contributions.mcp) : Boolean(entry?.hasMcp)
    const hasApps = release ? Boolean(manifest?.contributions.apps) : Boolean(entry?.hasApps)
    const skillCount = release ? release.skills.length : entry?.skillCount
    const website = manifest ? manifest.interface.websiteUrl || manifest.homepageUrl : entry?.websiteUrl
    const privacy = manifest ? manifest.interface.privacyPolicyUrl : entry?.privacyPolicyUrl
    const terms = manifest ? manifest.interface.termsOfServiceUrl : entry?.termsOfServiceUrl
    const publisher = manifest ? manifest.interface.developerName || manifest.author?.name : entry?.publisher
    const license = manifest ? manifest.license : entry?.license
    const version = release?.version || entry?.version
    const links = [
        { label: 'Website', url: website, icon: Globe2 },
        { label: 'Privacy', url: privacy, icon: ShieldCheck },
        { label: 'Terms', url: terms, icon: ScrollText },
        { label: 'Source', url: entry?.sourceUrl, icon: Code2 }
    ].filter((link): link is { label: string; url: string; icon: LucideIcon } => Boolean(link.url))
    const viewsAllowed = installation?.state === 'active' && catalog?.appViews.enabled && catalog.appViews.pluginIds.includes(installation.id)
    const skillHeading = <>
        <BookOpen size={17} strokeWidth={1.7} aria-hidden="true" />
        <strong className="plugin-product-capability-label">Skills{skillCount !== undefined ? <span className="plugin-product-count" aria-label={`${skillCount} ${skillCount === 1 ? 'skill' : 'skills'}`}>{skillCount}</span> : null}</strong><span className="plugin-product-capability-description">Guided workflows</span>
        {release ? <span className="plugin-product-capability-state"><ChevronDown size={14} className="plugin-product-disclosure-chevron" aria-hidden="true" /></span> : null}
    </>
    const openLink = async (url: string) => {
        setError(null)
        try { const result = await openDesktopLink(url); if (!result.success) throw Error(result.error || 'Could not open this link.') }
        catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not open this link.') }
    }
    if (!name) return <><DirectoryEmpty title="Plugin not found" action={<button className="plugin-button" onClick={onBack}>Back to Plugins</button>} />{installContent}</>
    return <article className="plugin-product-page">
        <nav className="plugin-product-breadcrumb" aria-label="Breadcrumb"><button type="button" className="plugin-text-button" onClick={onBack}>Plugins</button><ChevronRight size={14} /><span>{name}</span></nav>
        <header className="plugin-product-header">
            <div className="plugin-product-identity">
                {entry ? <StoreIcon entry={entry} loading="eager" /> : <span className="plugin-store-icon"><Plug size={25} strokeWidth={1.6} /></span>}
                <h1>{name}</h1>
            </div>
            <div className="plugin-directory-actions">
                {installation ? <>
                    <button type="button" className="plugin-icon-button" aria-label="Manage Plugin" title="Manage Plugin" onClick={() => onManage(installation.id)}><Settings2 size={17} /></button>
                    <button type="button" className="plugin-button plugin-button-primary" disabled={busy || installation.state !== 'active' || !(hasSkills || hasMcp)} onClick={() => onUseInChat(installation.id)} title="Start a new Chat with this release"><UseInChatIcon size={15} />Use in Chat</button>
                </> : <button type="button" className="plugin-button plugin-button-primary" disabled={busy || !canInstall || !(hasSkills || hasMcp) || entry?.installation === 'BLOCKED'} onClick={() => entry && onInstall(entry.name)} title={!canInstall ? 'Open or restart Zyra Desktop to install' : !(hasSkills || hasMcp) ? 'This provider does not yet offer a connection Zyra can use' : hasMcp ? 'Install and connect its configured servers. Account sign-in may be required; local servers run their commands.' : 'Install in Zyra'}><Plus size={15} />{hasMcp ? 'Install & connect' : hasSkills ? 'Install' : 'Not available in Zyra'}</button>}
            </div>
        </header>
        {longDescription || description ? <p className="plugin-product-description">{longDescription || description}</p> : null}
        {installContent}
        {installation && installation.state !== 'active' ? <p className="plugin-product-status">{installation.state === 'disabled' ? 'Disabled' : 'Unavailable'}</p> : null}
        {error ? <p className="plugin-notice" role="alert">{error}</p> : null}
        <section className="plugin-product-section" aria-label="Included in this plugin">
            <div className="plugin-product-section-heading"><h2>Included</h2></div>
            {hasSkills ? release?.skills.length ? <div className="plugin-product-skill-disclosure" data-open={skillsOpen}>
                <button type="button" className="plugin-product-capability" aria-expanded={skillsOpen} aria-controls="plugin-product-skills" onClick={() => setSkillsOpen(open => !open)}>{skillHeading}</button>
                <AnimatedHeight isOpen={skillsOpen} duration={380} crispContent><ul id="plugin-product-skills" className="plugin-product-skills custom-scrollbar">{release.skills.map(skill => <li key={skill.relativePath}><PluginSkillIcon pluginName={installation?.name || entry?.name} /><div><strong>{skill.name}</strong><p title={skill.description}>{shortSkillDescription(skill.description)}</p></div></li>)}</ul></AnimatedHeight>
            </div> : <div className="plugin-product-capability">{skillHeading}</div> : null}
            {hasMcp ? <div className="plugin-product-capability">
                <Server size={17} strokeWidth={1.7} aria-hidden="true" />
                <strong>Tools</strong><span className="plugin-product-capability-description">Use {name} in chat</span>
                {installation ? <button type="button" className="plugin-text-button plugin-product-connection-action" disabled={busy || installation.state !== 'active'} onClick={() => onManage(installation.id)}>Connection <ChevronRight size={14} /></button> : <span className="plugin-product-capability-state">Connect after install</span>}
            </div> : null}
            {hasApps && !hasMcp ? <div className="plugin-product-capability">
                <Server size={17} strokeWidth={1.7} aria-hidden="true" />
                <strong>Connection</strong><span className="plugin-product-capability-description">Provider-hosted tools</span>
                <span className="plugin-product-capability-state">Connection needed<SettingsInfoTooltip label="About this connection">Zyra cannot connect to this service yet. Support for this connection needs to be added to Zyra before you can sign in and use its chat tools.{hasSkills ? ' Its skills are available.' : ''}</SettingsInfoTooltip></span>
            </div> : null}
            {hasMcp ? <div className="plugin-product-capability">
                <LayoutPanelTop size={17} strokeWidth={1.7} aria-hidden="true" />
                <strong>App views</strong><span className="plugin-product-capability-description">Interactive results</span>
                <span className="plugin-product-capability-state">{installation ? viewsAllowed ? 'Allowed' : 'Off' : 'If available'}<SettingsInfoTooltip label="About app views">{installation ? 'Views appear when allowed in Plugin settings and provided by the connected service.' : 'Available only if the connected service provides a view.'}</SettingsInfoTooltip></span>
            </div> : null}
            {!hasSkills && !hasMcp && !hasApps ? <p className="plugin-help">No skills or connections are included in this package.</p> : null}
        </section>
        {hasMcp && installation ? <PluginMcpConnections compact pluginId={installation.id} active={installation.state === 'active'} /> : null}
        {publisher || version || license || links.length ? <footer className="plugin-product-footer" aria-label="Plugin details">
            <div className="plugin-product-metadata">
                {publisher ? <span>By <strong>{publisher}</strong></span> : null}
                {version ? <span>v{version}</span> : null}
                {license ? <span>{license} license</span> : null}
            </div>
            {links.length ? <nav className="plugin-product-links" aria-label="Plugin links">{links.map(link => <button key={link.label} type="button" className="plugin-product-link" aria-label={`Open ${link.label.toLowerCase()}`} onClick={() => void openLink(link.url)}>
                <link.icon size={14} strokeWidth={1.7} className={`plugin-product-link-icon plugin-product-link-icon-${link.label.toLowerCase()}`} aria-hidden="true" />{link.label}<span className="plugin-product-link-arrow" aria-hidden="true"><ArrowUpRight size={14} strokeWidth={1.7} /></span>
            </button>)}</nav> : null}
        </footer> : null}
    </article>
}
