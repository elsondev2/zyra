import { useEffect } from 'react'
import { dispatchAppMenuCommand } from './app-menu-command-actions'
import { useNavigate } from 'react-router-dom'
import { useCommandPalette } from '@/lib/commandPalette'
import { useAssistantStoreActions } from '@/lib/assistant/assistant-store-hooks'
import { createAssistantChatAndNavigate } from '@/pages/assistant/create-assistant-chat-and-navigate'

/** One route-independent listener, including while Settings is open. */
export function AppMenuCommandHost() {
    const navigate = useNavigate()
    const { open } = useCommandPalette()
    const actions = useAssistantStoreActions()
    useEffect(() => window.devscope.window.onAppMenuCommand(command => dispatchAppMenuCommand(command, {
        navigate,
        search: open,
        reload: () => window.location.reload(),
        newChat: () => { void createAssistantChatAndNavigate(actions, navigate) }
    })), [actions, navigate, open])
    return null
}
