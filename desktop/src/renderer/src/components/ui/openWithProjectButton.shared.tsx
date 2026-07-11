import { useState } from 'react'
import { FolderOpen, LoaderCircle, Terminal } from 'lucide-react'
import type { DevScopeInstalledIde } from '@shared/contracts/devscope-project-contracts'
import { resolveReadableLogoColor, withAlpha } from '@/components/ui/logoColors'
import { useSettings } from '@/lib/settings'
import { IDE_ICON_ASSETS } from '@/pages/project-details/ideIconAssets'

export const ALLOWED_IDE_ORDER = ['cursor', 'vscode', 'android-studio'] as const
export const ASSISTANT_HEADER_OPEN_WITH_LAST_TARGET_STORAGE_KEY = 'assistant-header-open-with:last-target:v1'

export type AssistantOpenWithTargetId = (typeof ALLOWED_IDE_ORDER)[number] | 'explorer' | 'terminal'

export type OpenWithContextAction = {
    id: string
    label: string
    icon: 'assistant' | 'project'
    onSelect: () => void | Promise<void>
}

export type OpenWithMenuPosition = {
    top: number
    left: number
    width: number
    attachment: 'top' | 'bottom'
    originClassName: string
    shellClassName: string
}

export function AssistantIdeLogo({ ide }: { ide: DevScopeInstalledIde }) {
    const { settings } = useSettings()
    const [imageFailed, setImageFailed] = useState(false)
    const localIconUrl = IDE_ICON_ASSETS[ide.icon] || IDE_ICON_ASSETS[ide.id]
    const fallbackLabel = ide.name.split(/\s+/).map((segment) => segment[0]).join('').slice(0, 2).toUpperCase()
    const readableColor = resolveReadableLogoColor(ide.color, settings.theme)
    const backgroundAlpha = settings.theme === 'light' ? 0.08 : 0.16
    const borderAlpha = settings.theme === 'light' ? 0.16 : 0.26
    const iconShadow = `drop-shadow(0 0 1px ${withAlpha(readableColor, settings.theme === 'light' ? 0.14 : 0.24)})`

    return (
        <span
            className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md"
            style={{
                backgroundColor: withAlpha(readableColor, backgroundAlpha),
                boxShadow: `inset 0 0 0 1px ${withAlpha(readableColor, borderAlpha)}`
            }}
        >
            {imageFailed || !localIconUrl ? (
                <span className="text-[9px] font-semibold" style={{ color: readableColor }}>
                    {fallbackLabel}
                </span>
            ) : (
                <img
                    src={localIconUrl}
                    alt={`${ide.name} logo`}
                    width={12}
                    height={12}
                    className="h-3 w-3 object-contain"
                    style={{ filter: iconShadow }}
                    onError={() => setImageFailed(true)}
                    loading="lazy"
                />
            )}
        </span>
    )
}

function AssistantIdeGlyph({ ide }: { ide: DevScopeInstalledIde }) {
    const { settings } = useSettings()
    const [imageFailed, setImageFailed] = useState(false)
    const localIconUrl = IDE_ICON_ASSETS[ide.icon] || IDE_ICON_ASSETS[ide.id]
    const fallbackLabel = ide.name.split(/\s+/).map((segment) => segment[0]).join('').slice(0, 2).toUpperCase()
    const readableColor = resolveReadableLogoColor(ide.color, settings.theme)
    const backgroundAlpha = settings.theme === 'light' ? 0.08 : 0.16
    const borderAlpha = settings.theme === 'light' ? 0.16 : 0.26
    const iconShadow = `drop-shadow(0 0 1px ${withAlpha(readableColor, settings.theme === 'light' ? 0.14 : 0.24)})`

    if (imageFailed || !localIconUrl) {
        return (
            <span
                className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md text-[11px] font-semibold"
                style={{
                    color: readableColor,
                    backgroundColor: withAlpha(readableColor, backgroundAlpha),
                    boxShadow: `inset 0 0 0 1px ${withAlpha(readableColor, borderAlpha)}`
                }}
            >
                {fallbackLabel}
            </span>
        )
    }

    return (
        <span
            className="inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md"
            style={{
                backgroundColor: withAlpha(readableColor, backgroundAlpha),
                boxShadow: `inset 0 0 0 1px ${withAlpha(readableColor, borderAlpha)}`
            }}
        >
            <img
                src={localIconUrl}
                alt={`${ide.name} logo`}
                width={16}
                height={16}
                className="h-4 w-4 shrink-0 object-contain"
                style={{ filter: iconShadow }}
                onError={() => setImageFailed(true)}
                loading="lazy"
            />
        </span>
    )
}

export function formatOpenWithError(result: { success: boolean; error?: string }, fallback: string): string {
    return result.error || fallback
}

export function readLastOpenWithTargetId(): AssistantOpenWithTargetId {
    try {
        const stored = localStorage.getItem(ASSISTANT_HEADER_OPEN_WITH_LAST_TARGET_STORAGE_KEY)
        if (stored === 'cursor' || stored === 'vscode' || stored === 'android-studio' || stored === 'explorer' || stored === 'terminal') {
            return stored
        }
    } catch {}
    return 'terminal'
}

export function persistLastOpenWithTargetId(targetId: AssistantOpenWithTargetId) {
    try {
        localStorage.setItem(ASSISTANT_HEADER_OPEN_WITH_LAST_TARGET_STORAGE_KEY, targetId)
    } catch {}
}

export function OpenWithTriggerIcon(props: {
    targetId: AssistantOpenWithTargetId
    installedIdes: DevScopeInstalledIde[]
    opening: boolean
}) {
    const { installedIdes, opening, targetId } = props
    const matchingIde = installedIdes.find((ide) => ide.id === targetId) || null

    if (opening) {
        return <LoaderCircle size={14} className="shrink-0 animate-spin" />
    }
    if (matchingIde) {
        return <AssistantIdeGlyph ide={matchingIde} />
    }
    if (targetId === 'explorer') {
        return <FolderOpen size={14} className="shrink-0" />
    }
    return <Terminal size={14} className="shrink-0" />
}
