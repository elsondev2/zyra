export type RecentProjectRoute = 'project' | 'folder'

export interface RecentProjectEntry {
    lastOpenedAt: number
    openCount: number
    lastRoute: RecentProjectRoute
}
