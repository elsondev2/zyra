import { useEffect, useState } from 'react'
import type { AssistantComposerPreferenceEffort } from './assistant-composer-preferences'

const LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY = 'assistant-left-sidebar-collapsed'
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = 'assistant-left-sidebar-width'
const RIGHT_SIDEBAR_OPEN_STORAGE_KEY = 'assistant-right-sidebar-open'
const RIGHT_PANEL_MODE_STORAGE_KEY = 'assistant-right-panel-mode'
const RAIL_MODE_STORAGE_KEY = 'assistant-rail-mode'
const RAIL_GROUP_MODE_STORAGE_KEY = 'assistant-rail-group-mode:v2'
const RAIL_SORT_MODE_STORAGE_KEY = 'assistant-rail-sort-mode'
const RAIL_FILTER_MODE_STORAGE_KEY = 'assistant-rail-filter-mode'

export type AssistantRightPanelMode = 'none' | 'details' | 'plan' | 'diff'
export type AssistantRailMode = 'work'
export type AssistantRailGroupMode = 'project' | 'flat'
export type AssistantRailSortMode = 'updated' | 'created'
export type AssistantRailFilterMode = 'all' | 'relevant'

export const SIDEBAR_EFFORT_LABELS: Record<AssistantComposerPreferenceEffort, string> = {
    off: 'Off',
    none: 'None',
    minimal: 'Minimal',
    low: 'Light',
    medium: 'Medium',
    high: 'High',
    xhigh: 'Extra High',
    max: 'Max'
}

export function useAssistantPageSidebarState() {
    const [leftSidebarCollapsed, setLeftSidebarCollapsed] = useState(() => {
        return localStorage.getItem(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true'
    })
    const [leftSidebarWidth, setLeftSidebarWidth] = useState(() => {
        const saved = Number(localStorage.getItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY))
        return Number.isFinite(saved) && saved > 0 ? saved : 322
    })
    const [rightPanelMode, setRightPanelMode] = useState<AssistantRightPanelMode>('none')
    const [railMode, setRailMode] = useState<AssistantRailMode>(() => {
        const savedMode = localStorage.getItem(RAIL_MODE_STORAGE_KEY)
        void savedMode
        return 'work'
    })
    const [railGroupMode, setRailGroupMode] = useState<AssistantRailGroupMode>(() => {
        const savedMode = localStorage.getItem(RAIL_GROUP_MODE_STORAGE_KEY)
        return savedMode === 'flat' ? 'flat' : 'project'
    })
    const [railSortMode, setRailSortMode] = useState<AssistantRailSortMode>(() => {
        const savedMode = localStorage.getItem(RAIL_SORT_MODE_STORAGE_KEY)
        return savedMode === 'created' ? 'created' : 'updated'
    })
    const [railFilterMode, setRailFilterMode] = useState<AssistantRailFilterMode>(() => {
        const savedMode = localStorage.getItem(RAIL_FILTER_MODE_STORAGE_KEY)
        return savedMode === 'relevant' ? 'relevant' : 'all'
    })

    useEffect(() => {
        localStorage.setItem(LEFT_SIDEBAR_COLLAPSED_STORAGE_KEY, String(leftSidebarCollapsed))
    }, [leftSidebarCollapsed])

    useEffect(() => {
        localStorage.setItem(LEFT_SIDEBAR_WIDTH_STORAGE_KEY, String(leftSidebarWidth))
    }, [leftSidebarWidth])

    useEffect(() => {
        localStorage.setItem(RIGHT_PANEL_MODE_STORAGE_KEY, rightPanelMode)
        localStorage.setItem(RIGHT_SIDEBAR_OPEN_STORAGE_KEY, String(rightPanelMode === 'details'))
    }, [rightPanelMode])

    useEffect(() => {
        localStorage.setItem(RAIL_MODE_STORAGE_KEY, railMode)
    }, [railMode])

    useEffect(() => {
        localStorage.setItem(RAIL_GROUP_MODE_STORAGE_KEY, railGroupMode)
    }, [railGroupMode])

    useEffect(() => {
        localStorage.setItem(RAIL_SORT_MODE_STORAGE_KEY, railSortMode)
    }, [railSortMode])

    useEffect(() => {
        localStorage.setItem(RAIL_FILTER_MODE_STORAGE_KEY, railFilterMode)
    }, [railFilterMode])

    return {
        leftSidebarCollapsed,
        setLeftSidebarCollapsed,
        leftSidebarWidth,
        setLeftSidebarWidth,
        rightPanelMode,
        setRightPanelMode,
        railMode,
        setRailMode,
        railGroupMode,
        setRailGroupMode,
        railSortMode,
        setRailSortMode,
        railFilterMode,
        setRailFilterMode,
    }
}
