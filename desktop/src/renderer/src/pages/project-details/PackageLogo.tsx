import { useState } from 'react'
import { Package } from 'lucide-react'
import { useSettings } from '@/lib/settings'
import { buildSimpleIconUrl, resolveReadableLogoColor } from '@/components/ui/logoColors'
import { getPackageLogo } from './package-logos'

const failedLogoUrls = new Set<string>()

export function PackageLogo({ packageName }: { packageName: string }) {
    const { settings } = useSettings()
    const logo = getPackageLogo(packageName)
    const src = logo ? logo.monochrome ? logo.url : buildSimpleIconUrl(logo.slug, resolveReadableLogoColor(logo.color, settings.theme)) : null
    const [loadedUrl, setLoadedUrl] = useState<string | null>(null)
    const [failedUrl, setFailedUrl] = useState<string | null>(null)
    const available = src && failedUrl !== src && !failedLogoUrls.has(src)
    const loaded = available && loadedUrl === src

    return <span data-package-logo={packageName} aria-hidden="true" title={logo?.label} className="relative flex size-7 shrink-0 items-center justify-center">
        {!loaded ? <Package size={20} strokeWidth={1.5} className="text-sparkle-text-muted" /> : null}
        {src && available ? <img src={src} alt="" width={22} height={22} loading="lazy" decoding="async" referrerPolicy="no-referrer"
            className={`absolute size-[22px] object-contain ${loaded ? 'opacity-100' : 'opacity-0'}`}
            style={logo?.monochrome && settings.appearanceResolvedMode !== 'light' ? { filter: 'invert(1)' } : undefined}
            onLoad={() => setLoadedUrl(src)} onError={() => { failedLogoUrls.add(src); setFailedUrl(src) }} /> : null}
    </span>
}
