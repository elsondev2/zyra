import { AssistantTerminalWorkspace } from '../assistant/AssistantTerminalWorkspace'
import { AccessoryHeaderPortal } from './AccessoryHeaderContext'

export function AccessoryTerminal({ workspaceId, rootPath, onSidebarWidthChange }: { workspaceId: string; rootPath: string; onSidebarWidthChange: (width: number) => void }) {
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AccessoryHeaderPortal draggable><span className="min-w-0 truncate px-3 text-[11px] text-sparkle-text-secondary" title={rootPath}>{rootPath}</span></AccessoryHeaderPortal>
        <AssistantTerminalWorkspace workspaceKey={`accessory:${workspaceId}`} projectPath={rootPath} active terminalOwner={{ kind: 'accessory-window', workspaceId }} onSidebarWidthChange={onSidebarWidthChange} />
    </div>
}
