import { useEffect, useState } from 'react'
import { AssistantFilesWorkspace } from '../assistant/AssistantFilesWorkspace'
import { AccessoryDirectoryBar } from './AccessoryDirectoryBar'
import { useAccessoryDirectory } from './useAccessoryDirectory'

export function AccessoryFiles({ workspaceId, rootPath, onError, onPreviewOpenChange }: { workspaceId: string; rootPath: string; onError: (message: string) => void; onPreviewOpenChange: (open: boolean) => void }) {
    const directory = useAccessoryDirectory(rootPath, onError)
    const [previewOpen, setPreviewOpen] = useState(false)
    useEffect(() => { onPreviewOpenChange(previewOpen); return () => onPreviewOpenChange(false) }, [onPreviewOpenChange, previewOpen])
    return <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <AccessoryDirectoryBar path={directory.path} disabled={previewOpen} busy={directory.choosing} onChoose={() => void directory.choose()} />
        <AssistantFilesWorkspace key={`${workspaceId}:${directory.path}`} projectPath={directory.path} active onPreviewOpenChange={setPreviewOpen} />
    </div>
}
