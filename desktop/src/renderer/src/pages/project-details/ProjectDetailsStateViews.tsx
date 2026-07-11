import { ArrowLeft, AlertCircle } from 'lucide-react'
import { LoadingSpinner } from '@/components/ui/LoadingState'

interface ErrorViewProps {
    error: string | null
    onBackToProjects: () => void
}

export function ProjectDetailsLoadingView() {
    return (
        <LoadingSpinner
            message="Loading project..."
            className="animate-fadeIn"
            minHeightClassName="min-h-[50vh]"
        />
    )
}

export function ProjectDetailsErrorView({ error, onBackToProjects }: ErrorViewProps) {
    return (
        <div className="animate-fadeIn p-8">
            <div className="flex items-center gap-4 mb-8">
                <button onClick={onBackToProjects} className="p-2 text-white/40 hover:text-white bg-white/5 rounded-lg">
                    <ArrowLeft size={20} />
                </button>
                <h1 className="text-xl font-bold text-white">Error</h1>
            </div>
            <div className="p-6 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center gap-4">
                <AlertCircle size={24} className="text-red-400" />
                <span className="text-red-300">{error || 'Project not found'}</span>
            </div>
        </div>
    )
}
