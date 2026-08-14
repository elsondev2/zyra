import type { CSSProperties } from 'react'
import { Minus, Square, X } from 'lucide-react'
import { ZyraLogoASCIIMini } from '@/components/ui/ZyraLogo'
import { cn } from '@/lib/utils'
import { useWindowChrome } from '@/lib/useWindowChrome'

export function QuickPreviewTitleBar(props: {
    title?: string
}) {
    const { title = 'Quick Preview' } = props
    const { runtime, policy: windowChromePolicy, isMaximized } = useWindowChrome()

    const handleMinimize = () => window.devscope.window.minimize()
    const handleToggleMaximize = () => {
        window.devscope.window.maximize()
    }
    const handleClose = () => window.devscope.window.close()

    return (
        <div className="flex h-[46px] shrink-0 items-center justify-between border-b border-white/10 bg-sparkle-bg">
            <div
                className="flex h-full min-w-0 flex-1 items-center gap-3 overflow-hidden border-r border-white/10 px-4"
                style={{
                    WebkitAppRegion: 'drag',
                    ...(runtime.platform === 'darwin' ? { paddingLeft: '76px' } : {})
                } as CSSProperties}
                title={title}
            >
                <ZyraLogoASCIIMini />
            </div>
            {windowChromePolicy.customWindowControls ? (
                <div className="flex shrink-0" style={{ WebkitAppRegion: 'no-drag' } as CSSProperties}>
                    <button
                        type="button"
                        onClick={handleMinimize}
                        className="inline-flex h-[46px] w-11 items-center justify-center text-sparkle-text-secondary transition-colors hover:bg-sparkle-accent"
                        aria-label="Minimize window"
                    >
                        <Minus size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={handleToggleMaximize}
                        className="inline-flex h-[46px] w-11 items-center justify-center text-sparkle-text-secondary transition-colors hover:bg-sparkle-accent"
                        aria-label={isMaximized ? 'Restore window' : 'Maximize window'}
                    >
                        <Square size={13} className={cn(isMaximized && 'scale-[0.92]')} />
                    </button>
                    <button
                        type="button"
                        onClick={handleClose}
                        className="inline-flex h-[46px] w-11 items-center justify-center text-sparkle-text-secondary transition-colors hover:bg-red-600 hover:text-white"
                        aria-label="Close window"
                    >
                        <X size={15} />
                    </button>
                </div>
            ) : null}
        </div>
    )
}

export default QuickPreviewTitleBar
