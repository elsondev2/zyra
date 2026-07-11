import React from 'react'
import { cn } from '@/lib/utils'

interface AnimatedHeightProps {
    isOpen: boolean
    children: React.ReactNode
    className?: string
    contentClassName?: string
    duration?: number
}

/**
 * A reusable component that animates its height from 0 to auto using grid-template-rows.
 * This provides a smooth, "fluid" expansion and collapse effect.
 */
export const AnimatedHeight: React.FC<AnimatedHeightProps> = ({
    isOpen,
    children,
    className,
    contentClassName,
    duration = 280
}) => {
    return (
        <div
            data-state={isOpen ? 'open' : 'closed'}
            aria-hidden={!isOpen}
            className={cn(
                "grid will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none",
                isOpen
                    ? "grid-rows-[1fr] opacity-100"
                    : "pointer-events-none grid-rows-[0fr] opacity-0 shadow-none",
                className
            )}
            style={{ transitionDuration: `${duration}ms` }}
        >
            <div className="min-h-0 overflow-hidden">
                <div className={contentClassName}>
                    {children}
                </div>
            </div>
        </div>
    )
}
