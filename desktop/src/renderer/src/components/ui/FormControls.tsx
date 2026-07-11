/**
 * Custom Form Controls - Styled checkboxes, radio buttons, and dropdowns
 */

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Custom Checkbox
interface CheckboxProps {
    checked: boolean
    onChange: (checked: boolean) => void
    label?: string
    description?: string
    disabled?: boolean
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

export function Checkbox({
    checked,
    onChange,
    label,
    description,
    disabled = false,
    size = 'md',
    className
}: CheckboxProps) {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6'
    }

    const iconSizes = {
        sm: 12,
        md: 14,
        lg: 16
    }

    return (
        <label className={cn(
            "flex items-start gap-3 cursor-pointer group",
            disabled && "opacity-50 cursor-not-allowed",
            className
        )}>
            <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => onChange(e.target.checked)}
                    disabled={disabled}
                    className="sr-only"
                />
                <div className={cn(
                    sizeClasses[size],
                    "rounded-md border-2 transition-all duration-200",
                    "flex items-center justify-center",
                    checked
                        ? "bg-[var(--accent-primary)] border-[var(--accent-primary)] shadow-lg shadow-[var(--accent-primary)]/20"
                        : "bg-white/5 border-white/20 group-hover:border-white/40 group-hover:bg-white/10",
                    !disabled && "group-active:scale-95"
                )}>
                    {checked && (
                        <Check
                            size={iconSizes[size]}
                            className="text-white animate-in zoom-in-50 duration-200"
                            strokeWidth={3}
                        />
                    )}
                </div>
            </div>
            {(label || description) && (
                <div className="flex-1 min-w-0">
                    {label && (
                        <div className={cn(
                            "font-medium text-white/80 group-hover:text-white transition-colors",
                            size === 'sm' && "text-xs",
                            size === 'md' && "text-sm",
                            size === 'lg' && "text-base"
                        )}>
                            {label}
                        </div>
                    )}
                    {description && (
                        <div className={cn(
                            "text-white/40 mt-0.5",
                            size === 'sm' && "text-[10px]",
                            size === 'md' && "text-xs",
                            size === 'lg' && "text-sm"
                        )}>
                            {description}
                        </div>
                    )}
                </div>
            )}
        </label>
    )
}

// Custom Radio Button
interface RadioProps {
    checked: boolean
    onChange: () => void
    label?: string
    description?: string
    disabled?: boolean
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

export function Radio({
    checked,
    onChange,
    label,
    description,
    disabled = false,
    size = 'md',
    className
}: RadioProps) {
    const sizeClasses = {
        sm: 'w-4 h-4',
        md: 'w-5 h-5',
        lg: 'w-6 h-6'
    }

    const dotSizes = {
        sm: 'w-2 h-2',
        md: 'w-2.5 h-2.5',
        lg: 'w-3 h-3'
    }

    return (
        <label className={cn(
            "flex items-start gap-3 cursor-pointer group",
            disabled && "opacity-50 cursor-not-allowed",
            className
        )}>
            <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                <input
                    type="radio"
                    checked={checked}
                    onChange={onChange}
                    disabled={disabled}
                    className="sr-only"
                />
                <div className={cn(
                    sizeClasses[size],
                    "rounded-full border-2 transition-all duration-200",
                    "flex items-center justify-center",
                    checked
                        ? "bg-[var(--accent-primary)]/10 border-[var(--accent-primary)] shadow-lg shadow-[var(--accent-primary)]/20"
                        : "bg-white/5 border-white/20 group-hover:border-white/40 group-hover:bg-white/10",
                    !disabled && "group-active:scale-95"
                )}>
                    {checked && (
                        <div className={cn(
                            dotSizes[size],
                            "rounded-full bg-[var(--accent-primary)] animate-in zoom-in-50 duration-200"
                        )} />
                    )}
                </div>
            </div>
            {(label || description) && (
                <div className="flex-1 min-w-0">
                    {label && (
                        <div className={cn(
                            "font-medium text-white/80 group-hover:text-white transition-colors",
                            size === 'sm' && "text-xs",
                            size === 'md' && "text-sm",
                            size === 'lg' && "text-base"
                        )}>
                            {label}
                        </div>
                    )}
                    {description && (
                        <div className={cn(
                            "text-white/40 mt-0.5",
                            size === 'sm' && "text-[10px]",
                            size === 'md' && "text-xs",
                            size === 'lg' && "text-sm"
                        )}>
                            {description}
                        </div>
                    )}
                </div>
            )}
        </label>
    )
}

// Custom Select/Dropdown
interface SelectProps {
    value: string
    onChange: (value: string) => void
    options: { value: string; label: string }[]
    placeholder?: string
    disabled?: boolean
    size?: 'sm' | 'md' | 'lg'
    className?: string
}

export function Select({
    value,
    onChange,
    options,
    placeholder = 'Select...',
    disabled = false,
    size = 'md',
    className
}: SelectProps) {
    const [isOpen, setIsOpen] = useState(false)
    const containerRef = useRef<HTMLDivElement>(null)
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-3 py-2 text-sm',
        lg: 'px-4 py-2.5 text-base'
    }
    const menuSizeClasses = {
        sm: 'px-3 py-2 text-xs',
        md: 'px-3 py-2.5 text-sm',
        lg: 'px-4 py-3 text-base'
    }
    const selectedOption = options.find((option) => option.value === value)

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false)
            }
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setIsOpen(false)
            }
        }

        document.addEventListener('mousedown', handlePointerDown)
        document.addEventListener('keydown', handleEscape)

        return () => {
            document.removeEventListener('mousedown', handlePointerDown)
            document.removeEventListener('keydown', handleEscape)
        }
    }, [])

    return (
        <div ref={containerRef} className={cn("relative", className)}>
            <button
                type="button"
                onClick={() => {
                    if (!disabled) {
                        setIsOpen((current) => !current)
                    }
                }}
                disabled={disabled}
                aria-haspopup="listbox"
                aria-expanded={isOpen}
                className={cn(
                    sizeClasses[size],
                    "w-full rounded-lg",
                    "bg-white/5 border-2 border-white/10",
                    "text-white font-medium text-left",
                    "transition-all duration-200",
                    "hover:bg-white/10 hover:border-white/20",
                    "focus:outline-none focus:border-[var(--accent-primary)] focus:bg-white/10",
                    "focus:shadow-lg focus:shadow-[var(--accent-primary)]/10",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    "pr-10"
                )}
            >
                <span className={cn("block truncate", !selectedOption && "text-white/35")}>
                    {selectedOption?.label || placeholder}
                </span>
            </button>
            <ChevronDown
                size={16}
                className={cn(
                    "absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none transition-transform",
                    isOpen && "rotate-180 text-white/60"
                )}
            />
            <div
                role="listbox"
                aria-hidden={!isOpen || disabled}
                className={cn(
                    "absolute left-0 top-full z-50 mt-2 w-full origin-top overflow-hidden rounded-xl border border-white/10 bg-sparkle-card shadow-2xl shadow-black/60",
                    "transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
                    isOpen && !disabled
                        ? "visible translate-y-0 scale-100 opacity-100"
                        : "invisible pointer-events-none -translate-y-1 scale-[0.985] opacity-0"
                )}
            >
                    <div className="max-h-72 overflow-y-auto py-1.5 custom-scrollbar">
                        {options.length > 0 ? (
                            options.map((option) => {
                                const isSelected = option.value === value
                                return (
                                    <button
                                        key={option.value}
                                        type="button"
                                        onClick={() => {
                                            onChange(option.value)
                                            setIsOpen(false)
                                        }}
                                        className={cn(
                                            "flex w-full items-center gap-2 text-left transition-colors duration-100",
                                            menuSizeClasses[size],
                                            isSelected
                                                ? "bg-[var(--accent-primary)]/14 text-white"
                                                : "text-white/72 hover:bg-white/[0.05] hover:text-white"
                                        )}
                                    >
                                        <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                        {isSelected ? (
                                            <Check size={14} className="shrink-0 text-[var(--accent-primary)]" />
                                        ) : null}
                                    </button>
                                )
                            })
                        ) : (
                            <div className={cn(menuSizeClasses[size], "text-white/35")}>
                                {placeholder}
                            </div>
                        )}
                    </div>
            </div>
        </div>
    )
}

// Custom Input
interface InputProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    size?: 'sm' | 'md' | 'lg'
    type?: 'text' | 'password' | 'email' | 'url'
    className?: string
}

export function Input({
    value,
    onChange,
    placeholder,
    disabled = false,
    size = 'md',
    type = 'text',
    className
}: InputProps) {
    const sizeClasses = {
        sm: 'px-3 py-1.5 text-xs',
        md: 'px-3 py-2 text-sm',
        lg: 'px-4 py-2.5 text-base'
    }

    return (
        <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            className={cn(
                sizeClasses[size],
                "w-full rounded-lg",
                "bg-white/5 border-2 border-white/10",
                "text-white font-medium placeholder:text-white/30",
                "transition-all duration-200",
                "hover:bg-white/10 hover:border-white/20",
                "focus:outline-none focus:border-[var(--accent-primary)] focus:bg-white/10",
                "focus:shadow-lg focus:shadow-[var(--accent-primary)]/10",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                className
            )}
        />
    )
}

// Custom Textarea
interface TextareaProps {
    value: string
    onChange: (value: string) => void
    placeholder?: string
    disabled?: boolean
    rows?: number
    className?: string
}

export function Textarea({
    value,
    onChange,
    placeholder,
    disabled = false,
    rows = 3,
    className
}: TextareaProps) {
    return (
        <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={rows}
            className={cn(
                "px-3 py-2 text-sm",
                "w-full rounded-lg resize-none",
                "bg-white/5 border-2 border-white/10",
                "text-white font-medium placeholder:text-white/30",
                "transition-all duration-200",
                "hover:bg-white/10 hover:border-white/20",
                "focus:outline-none focus:border-[var(--accent-primary)] focus:bg-white/10",
                "focus:shadow-lg focus:shadow-[var(--accent-primary)]/10",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                className
            )}
        />
    )
}
