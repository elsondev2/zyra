/**
 * Zyra - Custom Dropdown Component
 * Styled dropdown that replaces native select elements
 */

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface DropdownOption {
    value: string
    label: string
    icon?: React.ReactNode
    description?: string
    color?: string
}

interface DropdownProps {
    value: string
    onChange: (value: string) => void
    options: DropdownOption[]
    placeholder?: string
    icon?: React.ReactNode
    className?: string
    menuClassName?: string
    disabled?: boolean
}

export default function Dropdown({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    icon,
    className,
    menuClassName,
    disabled = false
}: DropdownProps) {
    const [isOpen, setIsOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const selectedOption = options.find(opt => opt.value === value)

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [])

    // Close on escape key
    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
            }
        }

        if (isOpen) {
            document.addEventListener('keydown', handleEscape)
            return () => document.removeEventListener('keydown', handleEscape)
        }
    }, [isOpen])

    const handleSelect = (optionValue: string) => {
        onChange(optionValue)
        setIsOpen(false)
    }

    return (
        <div ref={dropdownRef} className={cn("relative", className)}>
            {/* Trigger Button */}
            <button
                type="button"
                onClick={() => !disabled && setIsOpen(!isOpen)}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl",
                    "bg-sparkle-card border border-sparkle-border text-sm text-sparkle-text",
                    "hover:bg-sparkle-card-hover hover:border-sparkle-border-secondary transition-all duration-200",
                    "focus:outline-none focus:border-[var(--accent-primary)]/30",
                    isOpen && "bg-sparkle-card-hover border-sparkle-border-secondary",
                    disabled && "opacity-50 cursor-not-allowed"
                )}
            >
                {icon && (
                    <span className={cn(
                        "text-sparkle-text-muted transition-colors",
                        isOpen && "text-[var(--accent-primary)]"
                    )}>
                        {icon}
                    </span>
                )}
                <span className={cn(
                    "flex-1 text-left truncate",
                    !selectedOption && "text-sparkle-text-muted"
                )}>
                    {selectedOption?.label || placeholder}
                </span>
                <ChevronDown
                    size={14}
                    className={cn(
                        "text-sparkle-text-muted transition-transform duration-200",
                        isOpen && "rotate-180 text-sparkle-text-secondary"
                    )}
                />
            </button>

            {/* Dropdown Menu */}
            <div
                role="listbox"
                aria-hidden={!isOpen}
                className={cn(
                    "absolute z-50 w-full mt-2 py-1.5 rounded-xl",
                    "bg-sparkle-card border border-sparkle-border-secondary",
                    "shadow-2xl shadow-black/60",
                    "max-h-[280px] origin-top overflow-y-auto custom-scrollbar",
                    "transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                    isOpen
                        ? "visible translate-y-0 scale-100 opacity-100"
                        : "invisible pointer-events-none -translate-y-1 scale-[0.985] opacity-0",
                    menuClassName
                )}
            >
                    {options.map((option) => {
                        const isSelected = option.value === value
                        return (
                            <button
                                key={option.value}
                                type="button"
                                onClick={() => handleSelect(option.value)}
                                className={cn(
                                    "w-full flex items-center gap-3 px-3 py-2.5 text-left",
                                    "transition-colors duration-100",
                                    isSelected
                                        ? "bg-[var(--accent-primary)]/15 text-sparkle-text"
                                        : "text-sparkle-text-secondary hover:bg-sparkle-card-hover hover:text-sparkle-text"
                                )}
                            >
                                {option.icon && (
                                    <span className={cn(
                                        "flex-shrink-0",
                                        isSelected ? "text-[var(--accent-primary)]" : "text-sparkle-text-muted"
                                    )}>
                                        {option.icon}
                                    </span>
                                )}
                                {option.color && (
                                    <span
                                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                        style={{ backgroundColor: option.color }}
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <span className="text-sm font-medium truncate block">
                                        {option.label}
                                    </span>
                                    {option.description && (
                                        <span className="text-xs text-sparkle-text-muted truncate block">
                                            {option.description}
                                        </span>
                                    )}
                                </div>
                                {isSelected && (
                                    <Check size={14} className="text-[var(--accent-primary)] flex-shrink-0" />
                                )}
                            </button>
                        )
                    })}
            </div>
        </div>
    )
}
