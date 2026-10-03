import { useState } from 'react'
import { FolderOpen, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import type { AssistantProject } from '@shared/assistant/contracts'
import { useSettings } from '@/lib/settings'
import { useProjectCreation } from '@/lib/projects/project-creation'
import {
    SettingsButton,
    SettingsPageContainer,
    SettingsRow,
    SettingsSection
} from './settings-layout'
import { useAssistantProjectCatalog } from '../assistant/useAssistantProjectCatalog'
import { getAssistantProjectIconSourcePath } from '../assistant/assistant-project-choices'
import { normalizeProjectPath } from '../assistant/assistant-sessions-rail-utils'
import { ProjectSettingsCatalog } from './ProjectSettingsCatalog'
import { SettingsPageTabs } from './SettingsPageTabs'

export default function ProjectsSettings({ view = 'catalog' }: { view?: 'catalog' | 'discovery' }) {
    return (
        <SettingsPageContainer
            title="Projects"
            fillViewport={view === 'catalog'}
            description="Manage your projects and where Zyra finds them."
            navigation={<SettingsPageTabs family="projects" />}
            backTo="/settings/workspace/projects"
            backLabel="Projects"
        >
            {view === 'catalog' ? <ProjectCatalogSettings /> : <ProjectDiscoverySettings />}
        </SettingsPageContainer>
    )
}

function ProjectCatalogSettings() {
    const navigate = useNavigate()
    const requestProjectCreation = useProjectCreation()
    const { settings, updateSettings } = useSettings()
    const [projectActionPending, setProjectActionPending] = useState(false)
    const {
        catalog,
        loading: projectsLoading,
        error: projectsError,
        associateFolder,
        removeFolder,
        dismissCandidate,
        updateProject
    } = useAssistantProjectCatalog()

    const createProject = async () => {
        if (projectActionPending) return
        setProjectActionPending(true)
        try {
            await requestProjectCreation()
        } finally {
            setProjectActionPending(false)
        }
    }

    const addAssociatedFolder = async (projectId: string, access: 'read-only' | 'read-write') => {
        const result = await window.devscope.selectFolder()
        if (!result.success || !result.folderPath) return
        await associateFolder({ projectId, path: result.folderPath, access })
    }

    const iconOverrideKeys = (project: AssistantProject) => {
        const paths = [project.homePath, ...project.folders.map(folder => folder.path)]
            .map(path => normalizeProjectPath(path).toLowerCase())
        return Object.keys(settings.projectIconOverrides).filter(path => paths.includes(normalizeProjectPath(path).toLowerCase()))
    }

    const changeIcon = async (project: AssistantProject) => {
        const sourcePath = getAssistantProjectIconSourcePath(project)
        if (!sourcePath) return
        const icon = await window.devscope.selectProjectIconFile()
        if (!icon.success || !icon.filePath) return
        const projectIconOverrides = { ...settings.projectIconOverrides }
        for (const key of iconOverrideKeys(project)) delete projectIconOverrides[key]
        updateSettings({ projectIconOverrides: { ...projectIconOverrides, [sourcePath]: icon.filePath } })
    }

    const removeIcon = async (project: AssistantProject) => {
        const projectIconOverrides = { ...settings.projectIconOverrides }
        for (const key of iconOverrideKeys(project)) delete projectIconOverrides[key]
        updateSettings({ projectIconOverrides })
    }

    return (
        <ProjectSettingsCatalog
            catalog={catalog} loading={projectsLoading} error={projectsError} creating={projectActionPending}
            onCreate={createProject}
            onOpenHome={async project => { const result = await window.devscope.openInExplorer(project.homePath); if (!result.success) throw new Error(result.error || 'Could not open the Project home.'); return result }}
            onAddFolder={addAssociatedFolder}
            onRemoveFolder={(projectId, folderId) => removeFolder({ projectId, folderId })}
            onArchive={(projectId, archived) => updateProject({ projectId, archived })}
            onImport={candidate => requestProjectCreation({ name: candidate.suggestedName, folderPaths: [candidate.path], candidateId: candidate.id, candidatePath: candidate.path })}
            onDismiss={dismissCandidate}
            hasCustomIcon={project => iconOverrideKeys(project).length > 0}
            onChangeIcon={changeIcon}
            onRemoveIcon={removeIcon}
            onConfigureDiscovery={() => navigate('/settings/workspace/projects/discovery')}
        />
    )
}

function ProjectDiscoverySettings() {
    const { settings, updateSettings } = useSettings()

    const chooseMainRoot = async () => {
        const result = await window.devscope.selectFolder()
        if (result.success && result.folderPath) {
            updateSettings({ projectsFolder: result.folderPath })
        }
    }

    const addRoot = async () => {
        const result = await window.devscope.selectFolder()
        if (!result.success || !result.folderPath || [settings.projectsFolder, ...settings.additionalFolders].includes(result.folderPath)) return
        updateSettings({ additionalFolders: [...settings.additionalFolders, result.folderPath] })
    }

    return (
        <>
            <SettingsSection title="Where Zyra looks">
                <SettingsRow
                    title="Look for projects in"
                    description="Zyra suggests projects found inside this folder."
                    status={settings.projectsFolder || 'No folder selected'}
                    statusTone={settings.projectsFolder ? 'muted' : 'warning'}
                    control={<div className="flex gap-2"><SettingsButton onClick={() => void chooseMainRoot()}><FolderOpen size={13} />{settings.projectsFolder ? 'Change' : 'Choose folder'}</SettingsButton>{settings.projectsFolder ? <SettingsButton variant="ghost" onClick={() => updateSettings({ projectsFolder: '' })}>Clear</SettingsButton> : null}</div>}
                />
                {settings.additionalFolders.map((folder) => (
                    <SettingsRow
                        key={folder}
                        title="Also look in"
                        description="Zyra suggests projects found inside this folder too."
                        status={folder}
                        control={<SettingsButton variant="ghost" onClick={() => updateSettings({ additionalFolders: settings.additionalFolders.filter((candidate) => candidate !== folder) })}><X size={13} />Remove</SettingsButton>}
                    />
                ))}
                <SettingsRow title="More folders" description="Look for projects in another folder." control={<SettingsButton onClick={() => void addRoot()}><FolderOpen size={13} />Add folder</SettingsButton>} />
            </SettingsSection>
        </>
    )
}
