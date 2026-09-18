import type { ReactNode, Ref } from 'react'
import { cn } from '@/lib/utils'

export function SettingsPageFrame({ children, containerRef, className }: { children: ReactNode; containerRef?: Ref<HTMLDivElement>; className?: string }) {
    return <div ref={containerRef} className="zyra-settings-page-container flex w-full min-w-0 justify-center px-5 pb-16 pt-8 sm:px-10 sm:pt-10">
        <div className={cn('zyra-settings-page-column flex w-full max-w-[760px] flex-col gap-4', className)}>{children}</div>
    </div>
}
