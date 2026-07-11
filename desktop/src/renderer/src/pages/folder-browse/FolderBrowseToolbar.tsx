import { ChevronDown, Filter, Grid3x3, LayoutGrid, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getProjectTypeById, type ContentLayout, type ViewMode } from './types'
import { useState, useRef, useEffect } from 'react'

interface FolderBrowseToolbarProps {
    isCondensedLayout?: boolean
    searchQuery: string
    filterType: string
    projectTypes: string[]
    viewMode: ViewMode
    contentLayout: ContentLayout
    onSearchQueryChange: (value: string) => void
    onFilterTypeChange: (value: string) => void
    onViewModeChange: (value: ViewMode) => void
    onContentLayoutChange: (value: ContentLayout) => void
}

type ViewOption = {
    viewMode: ViewMode
    contentLayout: ContentLayout
    label: string
    icon: typeof LayoutGrid
}

const VIEW_OPTIONS: ViewOption[] = [
    { viewMode: 'finder', contentLayout: 'grouped', label: 'Finder - Grouped', icon: Grid3x3 },
    { viewMode: 'finder', contentLayout: 'explorer', label: 'Finder - Explorer', icon: Grid3x3 },
    { viewMode: 'grid', contentLayout: 'grouped', label: 'Grid - Grouped', icon: LayoutGrid },
    { viewMode: 'grid', contentLayout: 'explorer', label: 'Grid - Explorer', icon: LayoutGrid }
]

export function FolderBrowseToolbar({
    isCondensedLayout = false,
    searchQuery,
    filterType,
    projectTypes,
    viewMode,
    contentLayout,
    onSearchQueryChange,
    onFilterTypeChange,
    onViewModeChange,
    onContentLayoutChange
}: FolderBrowseToolbarProps) {
    const [isViewDropdownOpen, setIsViewDropdownOpen] = useState(false)
    const dropdownRef = useRef<HTMLDivElement>(null)

    const currentView = VIEW_OPTIONS.find(
        opt => opt.viewMode === viewMode && opt.contentLayout === contentLayout
    ) || VIEW_OPTIONS[1]

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsViewDropdownOpen(false)
            }
        }

        if (isViewDropdownOpen) {
            document.addEventListener('mousedown', handleClickOutside)
            return () => document.removeEventListener('mousedown', handleClickOutside)
        }
    }, [isViewDropdownOpen])

    const handleViewChange = (option: ViewOption) => {
        onViewModeChange(option.viewMode)
        onContentLayoutChange(option.contentLayout)
        // Don't close dropdown - let user click outside to close
    }

    return (
        <div className={cn(
            'sticky z-20 -mx-6 border-b border-white/5 bg-sparkle-bg/95 px-6 backdrop-blur-xl transition-[padding,margin] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
            isCondensedLayout ? '-top-4 mb-4 pb-3 pt-3' : '-top-6 mb-4 pb-4 pt-4'
        )}>
            <div className={cn(
                'flex justify-between gap-4 transition-[gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCondensedLayout ? 'flex-col xl:flex-row xl:items-center' : 'flex-col md:flex-row items-center'
            )}>
                <div className={cn(
                    'flex flex-1 w-full gap-3',
                    isCondensedLayout ? 'flex-col lg:flex-row' : ''
                )}>
                    <div className="group/search relative flex-1 rounded-xl border border-white/10 bg-sparkle-card shadow-sm transition-all focus-within:border-sparkle-primary/50 focus-within:bg-white/[0.03]">
                        <Search
                            className="absolute left-4 top-1/2 -translate-y-1/2 text-sparkle-text-secondary group-focus-within/search:text-sparkle-primary transition-colors"
                            size={18}
                        />
                        <input
                            type="text"
                            placeholder="Search in folder..."
                            value={searchQuery}
                            onChange={(event) => onSearchQueryChange(event.target.value)}
                            className="w-full rounded-xl border-0 bg-transparent py-2.5 pl-11 pr-4 text-sm text-sparkle-text transition-colors placeholder:text-sparkle-text-muted focus:outline-none focus:ring-0"
                        />
                    </div>
                </div>

                <div className={cn('flex items-center gap-2', isCondensedLayout && 'self-end xl:self-auto')}>
                    {projectTypes.length > 0 && (
                        <div className={cn('relative group/filter', isCondensedLayout ? 'min-w-[160px] lg:w-[220px]' : 'w-[220px]')}>
                            <Filter
                                className="absolute left-4 top-1/2 -translate-y-1/2 text-sparkle-text-secondary pointer-events-none group-focus-within/filter:text-sparkle-primary transition-colors"
                                size={16}
                            />
                            <select
                                value={filterType}
                                onChange={(event) => onFilterTypeChange(event.target.value)}
                                className="w-full appearance-none bg-sparkle-card border border-white/10 rounded-xl py-2.5 pl-11 pr-10 text-sm text-sparkle-text focus:outline-none focus:border-sparkle-primary/50 focus:ring-4 focus:ring-sparkle-primary/10 transition-all cursor-pointer shadow-sm"
                            >
                                <option value="all">All Types</option>
                                {projectTypes.map((type) => {
                                    const typeInfo = getProjectTypeById(type)
                                    return (
                                        <option key={type} value={type}>
                                            {typeInfo?.displayName || type}
                                        </option>
                                    )
                                })}
                            </select>
                        </div>
                    )}

                    <div ref={dropdownRef} className="relative">
                        <button
                            onClick={() => setIsViewDropdownOpen(!isViewDropdownOpen)}
                            aria-expanded={isViewDropdownOpen}
                            className={cn(
                                'flex items-center gap-2 rounded-xl border border-white/10 bg-sparkle-card px-4 py-2.5 text-sm text-sparkle-text transition-all hover:border-white/20 hover:bg-white/[0.03] w-[220px]',
                                isViewDropdownOpen && 'border-white/20 bg-white/[0.03]'
                            )}
                        >
                            <currentView.icon size={16} className="shrink-0" />
                            <span className="font-medium flex-1 text-left">{currentView.label}</span>
                            <ChevronDown size={14} className={cn('shrink-0 transition-transform duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]', isViewDropdownOpen && 'rotate-180')} />
                        </button>

                        <div
                            aria-hidden={!isViewDropdownOpen}
                            className={cn(
                                'absolute right-0 top-full mt-2 w-[220px] origin-top overflow-hidden rounded-xl border border-white/10 bg-sparkle-card shadow-xl',
                                'transition-[opacity,transform,visibility] duration-200 ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none',
                                isViewDropdownOpen
                                    ? 'visible translate-y-0 scale-100 opacity-100'
                                    : 'invisible pointer-events-none -translate-y-1 scale-[0.985] opacity-0'
                            )}
                        >
                                <div className="p-2">
                                    <div className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                                        Finder View
                                    </div>
                                    {VIEW_OPTIONS.filter(opt => opt.viewMode === 'finder').map((option) => {
                                        const isSelected = option.viewMode === viewMode && option.contentLayout === contentLayout
                                        return (
                                            <button
                                                key={`${option.viewMode}-${option.contentLayout}`}
                                                onClick={() => handleViewChange(option)}
                                                className={cn(
                                                    'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
                                                    isSelected
                                                        ? 'bg-white/[0.08] text-sparkle-text'
                                                        : 'text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text'
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <option.icon size={16} />
                                                    <span>{option.contentLayout === 'grouped' ? 'Grouped' : 'Explorer'}</span>
                                                </div>
                                                {isSelected && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>

                                <div className="border-t border-white/5 p-2">
                                    <div className="px-3 py-2 text-xs font-semibold text-white/40 uppercase tracking-wider">
                                        Grid View
                                    </div>
                                    {VIEW_OPTIONS.filter(opt => opt.viewMode === 'grid').map((option) => {
                                        const isSelected = option.viewMode === viewMode && option.contentLayout === contentLayout
                                        return (
                                            <button
                                                key={`${option.viewMode}-${option.contentLayout}`}
                                                onClick={() => handleViewChange(option)}
                                                className={cn(
                                                    'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm transition-all',
                                                    isSelected
                                                        ? 'bg-white/[0.08] text-sparkle-text'
                                                        : 'text-sparkle-text-secondary hover:bg-white/[0.05] hover:text-sparkle-text'
                                                )}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <option.icon size={16} />
                                                    <span>{option.contentLayout === 'grouped' ? 'Grouped' : 'Explorer'}</span>
                                                </div>
                                                {isSelected && (
                                                    <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
