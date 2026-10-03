import { ChevronRight, Plug, Server } from 'lucide-react'
import type { AssistantPluginCatalog, AssistantPluginInstallation } from '@shared/assistant/contracts'
import { SettingsSwitch } from '../settings/settings-layout'
import { getPluginRelease } from './plugin-directory-state'
import type { DirectorySkill, directoryMcpContributions } from './plugin-contribution-directory'
import { bundledPluginLogo } from './bundled-plugin-logos'
import { PluginSkillIcon, shortSkillDescription } from './plugin-presentation'

export function PluginList({ plugins, catalog, busy, onSelect, onToggle }: {
    plugins: AssistantPluginInstallation[]
    catalog: AssistantPluginCatalog
    busy: boolean
    onSelect: (id: string) => void
    onToggle: (id: string, enabled: boolean) => void
}) {
    return <ul className="plugin-list" aria-label="Installed Plugins">{plugins.map((plugin) => {
        const release = getPluginRelease(catalog, plugin)
        const name = release?.manifest.interface.displayName || plugin.name
        const logo = plugin.sourceId.startsWith('openai-catalog:') ? bundledPluginLogo(plugin.name) : null
        return <li key={plugin.id} className="plugin-list-row">
            <button type="button" className="plugin-row-content" onClick={() => onSelect(plugin.id)} aria-label={`Open ${name}`}>
                {logo ? <img src={logo} alt="" className="plugin-row-icon plugin-row-logo" loading="lazy" /> : <Plug size={22} className="plugin-row-icon" strokeWidth={1.5} />}
                <span className="plugin-row-copy"><strong>{name}</strong><span>{release?.manifest.interface.shortDescription || release?.manifest.description || 'No description provided.'}</span></span>
            </button>
            {plugin.state === 'active' || plugin.state === 'disabled' ? <SettingsSwitch
                checked={plugin.state === 'active'} disabled={busy}
                label={`Keep ${name} active`} onCheckedChange={(enabled) => onToggle(plugin.id, enabled)}
            /> : <span className="plugin-meta">{plugin.state === 'quarantined' ? 'Quarantined' : 'Failed'}</span>}
        </li>
    })}</ul>
}

export function SkillList({ skills, onSelect }: { skills: DirectorySkill[]; onSelect: (skill: DirectorySkill) => void }) {
    return <ul className="plugin-list" aria-label="Skills">{skills.map((skill) => <li key={skill.id} className="plugin-list-row">
        <button type="button" className="plugin-row-content" onClick={() => onSelect(skill)} aria-label={`Open Skill ${skill.name}`}>
            <PluginSkillIcon pluginName={skill.pluginName} />
            <span className="plugin-row-copy"><strong>{skill.name}</strong><span title={skill.description}>{shortSkillDescription(skill.description) || 'No description provided.'}</span></span>
            <span className="plugin-meta plugin-skill-source" title={skill.source}>{skill.pluginId ? skill.source : skill.scope}</span>
            <ChevronRight size={15} className="plugin-row-chevron" />
        </button>
    </li>)}</ul>
}

export function McpList({ contributions, onSelect }: {
    contributions: ReturnType<typeof directoryMcpContributions>
    onSelect: (pluginId: string) => void
}) {
    return <section className="plugin-mcp-section">
        <h2>From Plugins</h2>
        <p className="plugin-help">Servers included with installed Plugins. Open a Plugin to connect them.</p>
        <ul className="plugin-list plugin-group" aria-label="MCP contributions">{contributions.map((entry) => <li key={entry.pluginId} className="plugin-list-row">
            <button type="button" className="plugin-row-content" onClick={() => onSelect(entry.pluginId)} aria-label={`Open ${entry.name} MCP contribution`}>
                <Server size={20} className="plugin-row-icon" strokeWidth={1.5} />
                <span className="plugin-row-copy"><strong>{entry.name}</strong><span>{entry.description || `Version ${entry.version}`}</span></span>
                <span className="plugin-meta">Open plugin</span><ChevronRight size={15} className="plugin-row-chevron" />
            </button>
        </li>)}</ul>
    </section>
}

export function DirectoryEmpty({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
    return <div className="plugin-empty" role="status"><h2>{title}</h2>{description ? <p>{description}</p> : null}{action}</div>
}
