import ProjectIcon from '@/components/ui/ProjectIcon'
import { useSettings } from '@/lib/settings'
import { resolveReadableLogoColor, withAlpha } from '@/components/ui/logoColors'
import type { ProjectTechnology } from './devscopePortfolioPaths'

export function ProjectTechPill({ technology }: { technology: ProjectTechnology }) {
    const { settings } = useSettings()
    const color = resolveReadableLogoColor(technology.color, settings.theme)
    return <span
        className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-medium leading-4"
        style={{ color, borderColor: withAlpha(color, 0.26), backgroundColor: withAlpha(color, 0.09) }}
    >
        <ProjectIcon
            mode="technology"
            projectType={technology.kind === 'type' ? technology.id : undefined}
            framework={technology.kind === 'framework' ? technology.id : undefined}
            size={12}
        />
        {technology.label}
    </span>
}
