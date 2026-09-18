import { AssistantTerminalWorkspace } from '../assistant/AssistantTerminalWorkspace'
import { AccessoryDirectoryBar } from './AccessoryDirectoryBar'
import { useAccessoryDirectory } from './useAccessoryDirectory'

export function AccessoryTerminal({ workspaceId, rootPath, onError }: { workspaceId: string; rootPath: string; onError: (message: string) => void }) {
    const directory = useAccessoryDirectory(rootPath, onError)
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AccessoryDirectoryBar path={directory.path} busy={directory.choosing} onChoose={() => void directory.choose()} />
        <AssistantTerminalWorkspace key={directory.path} workspaceKey={`accessory:${workspaceId}:${directory.path}`} projectPath={directory.path} active terminalOwner={{ kind: 'accessory-window', workspaceId }} />
    </div>
}
