import {
    Code,
    File,
    FileCode,
    FileJson,
    FileText,
    Folder,
    FolderOpen,
    Image
} from 'lucide-react'

export function getFileIcon(name: string, isDirectory: boolean, isExpanded?: boolean) {
    if (isDirectory) {
        return isExpanded ? <FolderOpen size={16} className="text-blue-400" /> : <Folder size={16} className="text-blue-400" />
    }

    const ext = name.split('.').pop()?.toLowerCase()
    switch (ext) {
        case 'js':
        case 'jsx':
            return <FileCode size={16} className="text-yellow-400" />
        case 'ts':
        case 'tsx':
            return <FileCode size={16} className="text-blue-400" />
        case 'json':
            return <FileJson size={16} className="text-yellow-500" />
        case 'md':
            return <FileText size={16} className="text-white/60" />
        case 'html':
        case 'htm':
            return <Code size={16} className="text-orange-400" />
        case 'css':
        case 'scss':
        case 'sass':
            return <FileCode size={16} className="text-pink-400" />
        case 'png':
        case 'jpg':
        case 'jpeg':
        case 'gif':
        case 'svg':
        case 'webp':
            return <Image size={16} className="text-purple-400" />
        default:
            return <File size={16} className="text-white/40" />
    }
}
