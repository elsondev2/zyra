import type { ReactNode } from 'react'
import { AnimatedHeight } from '@/components/ui/AnimatedHeight'

export function SettingsExpander({ open, children, contentClassName }: { open: boolean; children: ReactNode; contentClassName?: string }) {
    return <AnimatedHeight isOpen={open} duration={220} unmountOnExit className="zyra-settings-expander !mt-0" contentClassName={contentClassName}>
        {children}
    </AnimatedHeight>
}
