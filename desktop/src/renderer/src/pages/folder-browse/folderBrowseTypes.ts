import type { ReactNode } from 'react'

export type EntryActionTarget = {
    path: string
    name: string
    type: 'file' | 'directory'
}

export interface FileActionsMenuItem {
    id: string
    label: string
    icon?: ReactNode
    onSelect: () => void | Promise<void>
    disabled?: boolean
    danger?: boolean
}
