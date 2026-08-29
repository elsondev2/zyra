import type { BrowserShortcutAction } from './browser-shortcuts'

export const BROWSER_POPUP_GET_STATE_CHANNEL = 'devscope:browserPopup:getState'
export const BROWSER_POPUP_COMMAND_CHANNEL = 'devscope:browserPopup:command'
export const BROWSER_POPUP_STATE_CHANGED_CHANNEL = 'devscope:browserPopup:stateChanged'
export const BROWSER_POPUP_FOCUS_ADDRESS_CHANNEL = 'devscope:browserPopup:focusAddress'
export const BROWSER_POPUP_LIST_CHANNEL = 'devscope:browserPopup:list'
export const BROWSER_POPUP_FOCUS_WINDOW_CHANNEL = 'devscope:browserPopup:focusWindow'
export const BROWSER_POPUP_LIST_CHANGED_CHANNEL = 'devscope:browserPopup:listChanged'

export type BrowserPopupState = {
    title: string
    url: string
    loading: boolean
    canGoBack: boolean
    canGoForward: boolean
    audible: boolean
    fullscreen: boolean
    profileShared: true
}

export type BrowserPopupSummary = {
    id: string
    ownerThreadId: string | null
    sourceTabId: string | null
    title: string
    origin: string
    minimized: boolean
    audible: boolean
}

export type BrowserPopupCommand =
    | { type: 'back' }
    | { type: 'forward' }
    | { type: 'reload' }
    | { type: 'stop' }
    | { type: 'navigate'; url: string }
    | { type: 'copy-address' }
    | { type: 'open-in-tab' }
    | { type: 'toggle-fullscreen' }
    | { type: 'show-menu' }
    | { type: 'shortcut'; action: BrowserShortcutAction }
