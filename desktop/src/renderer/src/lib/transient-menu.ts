export const TRANSIENT_MENU_DISMISS_EVENT = 'zyra:dismiss-transient-menus'

export function dismissTransientMenus(): void {
    if (typeof window === 'undefined') return
    window.dispatchEvent(new Event(TRANSIENT_MENU_DISMISS_EVENT))
}
