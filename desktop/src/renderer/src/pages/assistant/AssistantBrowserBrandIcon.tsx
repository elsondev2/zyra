import { useState } from 'react'
import { Globe2 } from 'lucide-react'
import arcDarkLogo from '../../assets/browser-logos/arc-dark.svg'
import arcLogo from '../../assets/browser-logos/arc.svg'
import braveLogo from '../../assets/browser-logos/brave.svg'
import chromeLogo from '../../assets/browser-logos/chrome.svg'
import chromiumLogo from '../../assets/browser-logos/chromium.svg'
import edgeLogo from '../../assets/browser-logos/edge.svg'
import firefoxLogo from '../../assets/browser-logos/firefox.svg'
import operaLogo from '../../assets/browser-logos/opera.svg'
import safariLogo from '../../assets/browser-logos/safari.svg'
import vivaldiLogo from '../../assets/browser-logos/vivaldi.svg'
import zenDarkLogo from '../../assets/browser-logos/zen-browser-dark.svg'
import zenLightLogo from '../../assets/browser-logos/zen-browser-light.svg'
import { cn } from '@/lib/utils'

function browserLogo(browserId: string): { light: string; dark?: string } | null {
    const id = browserId.toLowerCase()
    if (id.startsWith('chrome')) return { light: chromeLogo }
    if (id.startsWith('edge')) return { light: edgeLogo }
    if (id === 'brave') return { light: braveLogo }
    if (id === 'chromium' || id === 'thorium') return { light: chromiumLogo }
    if (id === 'vivaldi') return { light: vivaldiLogo }
    if (id.startsWith('opera')) return { light: operaLogo }
    if (id === 'arc') return { light: arcLogo, dark: arcDarkLogo }
    if (id === 'safari') return { light: safariLogo }
    if (id === 'zen') return { light: zenLightLogo, dark: zenDarkLogo }
    if (id.includes('firefox') || ['librewolf', 'waterfox', 'floorp'].includes(id)) return { light: firefoxLogo }
    return null
}

export function AssistantBrowserBrandIcon({ browserId, className }: { browserId: string; className?: string }) {
    const [failed, setFailed] = useState(false)
    const source = browserLogo(browserId)
    if (!source || failed) return <Globe2 size={18} className={cn('text-sparkle-text-muted/55', className)} />
    if (source.dark) return <span className={cn('inline-flex size-[18px]', className)}><img src={source.light} alt="" draggable={false} onError={() => setFailed(true)} className="size-[18px] object-contain dark:hidden" /><img src={source.dark} alt="" draggable={false} onError={() => setFailed(true)} className="hidden size-[18px] object-contain dark:block" /></span>
    return <img src={source.light} alt="" draggable={false} onError={() => setFailed(true)} className={cn('size-[18px] object-contain', className)} />
}
