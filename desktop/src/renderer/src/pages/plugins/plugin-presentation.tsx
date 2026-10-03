import { BookOpen, MessageCircleMore } from 'lucide-react'
import { bundledPluginLogo } from './bundled-plugin-logos'

export const UseInChatIcon = MessageCircleMore
export function shortSkillDescription(value: string): string {
    const summary = value.split(/;|\s+use when\s+/iu)[0].trim()
    return summary.length > 110 ? `${summary.slice(0, 107).replace(/\s+\S*$/u, '')}…` : summary
}
export function PluginSkillIcon({ pluginName }: { pluginName?: string }) {
    const logo = pluginName ? bundledPluginLogo(pluginName) : null
    return logo ? <img src={logo} alt="" className="plugin-skill-logo h-5 w-5 shrink-0 object-contain" loading="lazy" /> : <BookOpen size={21} className="plugin-row-icon" strokeWidth={1.5} />
}
