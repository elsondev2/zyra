import type { ReactNode, Ref } from 'react'
import { cn } from '@/lib/utils'

export function SettingsPageFrame({ children, containerRef, className, fillViewport = false }: { children: ReactNode; containerRef?: Ref<HTMLDivElement>; className?: string; fillViewport?: boolean }) {
    return <div ref={containerRef} className={cn('zyra-settings-page-container flex w-full min-w-0 justify-center px-5 pb-16 pt-8 sm:px-10 sm:pt-10', fillViewport && 'h-full min-h-0 overflow-hidden pb-5')}>
        <div className={cn('zyra-settings-page-column flex w-full max-w-[760px] flex-col gap-4', fillViewport && 'min-h-0', className)}>{children}</div>
    </div>
}
