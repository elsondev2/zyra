import { ProjectDetailsSidebar } from './ProjectDetailsSidebar'
import { ProjectDetailsHeaderSection } from './ProjectDetailsHeaderSection'
import { ProjectDetailsReadmeTab } from './ProjectDetailsReadmeTab'
import { ProjectDetailsFilesTab } from './ProjectDetailsFilesTab'
import { ProjectDetailsGitTab } from './ProjectDetailsGitTab'
import { cn } from '@/lib/utils'

export interface ProjectDetailsContentProps {
    [key: string]: any
}

export function ProjectDetailsContent(props: ProjectDetailsContentProps) {
    const {
        activeTab,
        isCondensedLayout,
        project,
        projectDetailsLoading,
        scriptPredictions,
        scriptIntentContext,
        runScript,
        setShowDependenciesModal
    } = props

    return (
        <>
            <ProjectDetailsHeaderSection {...props} />

            <div className={cn(
                'grid grid-cols-12 transition-[gap] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]',
                isCondensedLayout ? 'gap-5' : 'gap-6'
            )}>
                <div className={isCondensedLayout ? 'col-span-12 flex min-w-0 flex-col gap-6' : 'col-span-12 lg:col-span-8 flex min-w-0 flex-col gap-6'}>
                    <div className="bg-sparkle-card border border-white/5 rounded-2xl overflow-hidden min-h-[500px] shadow-sm">
                        {activeTab === 'readme' ? (
                            <ProjectDetailsReadmeTab
                                project={project}
                                loadingProjectDetails={projectDetailsLoading}
                                openPreview={props.openPreview}
                                readmeContentRef={props.readmeContentRef}
                                readmeExpanded={props.readmeExpanded}
                                readmeNeedsExpand={props.readmeNeedsExpand}
                                setReadmeExpanded={props.setReadmeExpanded}
                            />
                        ) : activeTab === 'files' ? (
                            <ProjectDetailsFilesTab {...props} />
                        ) : activeTab === 'git' ? (
                            <ProjectDetailsGitTab {...props} />
                        ) : null}
                    </div>
                </div>

                {!isCondensedLayout && (
                    <ProjectDetailsSidebar
                        dockOpen={Boolean(isCondensedLayout)}
                        scripts={project.scripts}
                        dependencies={project.dependencies}
                        devDependencies={project.devDependencies}
                        dependencyInstallStatus={project.dependencyInstallStatus}
                        loadingProjectDetails={projectDetailsLoading}
                        scriptPredictions={scriptPredictions}
                        scriptIntentContext={scriptIntentContext}
                        onRunScript={runScript}
                        onShowDependencies={() => setShowDependenciesModal(true)}
                    />
                )}
            </div>
        </>
    )
}
