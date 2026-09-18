import type { CSSProperties } from 'react'
import { useWindowChrome } from '@/lib/useWindowChrome'
import { PreviewAppMenu, PreviewWindowControls } from '@/components/ui/file-preview/PreviewWindowChrome'

export function QuickPreviewTitleBar({ title = 'Quick Preview' }: { title?: string }) {
    const { runtime } = useWindowChrome()
    return <div className="flex h-10 shrink-0 items-center border-b border-[var(--surface-panel-divider)] bg-[var(--surface-topbar)] text-sparkle-text"
        style={{ WebkitAppRegion: 'drag', ...(runtime.platform === 'darwin' ? { paddingLeft: '76px' } : {}) } as CSSProperties}>
        <PreviewAppMenu />
        <div className="min-w-0 flex-1 truncate px-3 text-[13px] font-medium" title={title}>{title}</div>
        <PreviewWindowControls />
    </div>
}
export default QuickPreviewTitleBar
