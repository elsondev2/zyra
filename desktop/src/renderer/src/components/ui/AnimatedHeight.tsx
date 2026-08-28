import React, { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface AnimatedHeightProps {
    isOpen: boolean
    children: React.ReactNode
    className?: string
    contentClassName?: string
    duration?: number
    crispContent?: boolean
    unmountOnExit?: boolean
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
    duration = 280,
    crispContent = false,
    unmountOnExit = false
}) => {
    const [retainChildren, setRetainChildren] = useState(isOpen)
    useEffect(() => {
        if (!unmountOnExit) return
        if (isOpen) {
            setRetainChildren(true)
            return
        }
        const timerId = window.setTimeout(() => setRetainChildren(false), Math.max(0, duration))
        return () => window.clearTimeout(timerId)
    }, [duration, isOpen, unmountOnExit])
    const renderedChildren = !unmountOnExit || isOpen || retainChildren ? children : null
    if (crispContent) {
        return (
            <div
                data-state={isOpen ? 'open' : 'closed'}
                aria-hidden={!isOpen}
                inert={!isOpen ? true : undefined}
                className={cn(
                    'grid transition-[grid-template-rows] ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
                    isOpen ? 'grid-rows-[1fr]' : 'pointer-events-none grid-rows-[0fr]',
                    className
                )}
                style={{ transitionDuration: `${duration}ms` }}
            >
                <div className="min-h-0 overflow-hidden">
                    <div className={contentClassName}>{renderedChildren}</div>
                </div>
            </div>
        )
    }

    return (
        <div
            data-state={isOpen ? 'open' : 'closed'}
            aria-hidden={!isOpen}
            inert={!isOpen ? true : undefined}
            className={cn(
                'grid ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none',
                'will-change-[grid-template-rows,opacity] transition-[grid-template-rows,opacity]',
                isOpen
                    ? 'grid-rows-[1fr] opacity-100'
                    : 'pointer-events-none grid-rows-[0fr] opacity-0 shadow-none',
                className
            )}
            style={{ transitionDuration: `${duration}ms` }}
        >
            <div className="min-h-0 overflow-hidden">
                <div className={contentClassName}>
                    {renderedChildren}
                </div>
            </div>
        </div>
    )
}
