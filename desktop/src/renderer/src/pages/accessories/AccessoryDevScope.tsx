import { lazy, Suspense } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Navigate, Route, Routes, useParams } from 'react-router-dom'
import { DevScopePortfolio } from './DevScopePortfolio'

const ProjectDetailsPage = lazy(() => import('../project-details/ProjectDetailsPage'))

function ProjectWorkspace() {
    const { projectPath } = useParams<{ projectPath: string }>()
    const path = projectPath ? decodeURIComponent(projectPath) : ''
    if (!path) return <Navigate to="/accessories" replace />
    return <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
        <Suspense fallback={<div className="flex items-center justify-center gap-2 py-20 text-sm text-sparkle-text-secondary"><LoaderCircle size={16} className="animate-spin" />Opening project…</div>}>
            <ProjectDetailsPage key={path} />
        </Suspense>
    </div>
}

export default function AccessoryDevScope() {
    return <Routes>
        <Route path="/accessories" element={<DevScopePortfolio />} />
        <Route path="/accessories/project/:projectPath" element={<ProjectWorkspace />} />
        <Route path="*" element={<Navigate to="/accessories" replace />} />
    </Routes>
}
