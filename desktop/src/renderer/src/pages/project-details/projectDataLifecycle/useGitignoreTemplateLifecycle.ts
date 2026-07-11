import { useEffect } from 'react'
import type { ProjectDetails } from '../types'

type UseGitignoreTemplateLifecycleParams = {
    showInitModal: boolean
    availableTemplates: string[]
    gitignoreTemplate: string
    availablePatterns: any[]
    project: ProjectDetails | null
    setAvailableTemplates: (value: string[]) => void
    setGitignoreTemplate: (value: string) => void
    setAvailablePatterns: (value: any[]) => void
    setSelectedPatterns: (value: Set<string>) => void
}

export function useGitignoreTemplateLifecycle({
    showInitModal,
    availableTemplates,
    gitignoreTemplate,
    availablePatterns,
    project,
    setAvailableTemplates,
    setGitignoreTemplate,
    setAvailablePatterns,
    setSelectedPatterns
}: UseGitignoreTemplateLifecycleParams): void {
    useEffect(() => {
        if (showInitModal && availableTemplates.length === 0) {
            window.devscope.getGitignoreTemplates().then((result) => {
                if (result.success) {
                    setAvailableTemplates(result.templates)

                    if (project?.type) {
                        const typeMap: Record<string, string> = {
                            node: 'Node.js',
                            python: 'Python',
                            rust: 'Rust',
                            go: 'Go',
                            java: 'Java',
                            dotnet: '.NET',
                            ruby: 'Ruby',
                            php: 'PHP',
                            cpp: 'C/C++',
                            dart: 'Dart/Flutter',
                            elixir: 'Elixir'
                        }
                        const detectedTemplate = typeMap[project.type] || 'General'
                        setGitignoreTemplate(detectedTemplate)
                    } else {
                        setGitignoreTemplate('General')
                    }
                }
            })
        }
    }, [showInitModal, availableTemplates.length, project?.type, setAvailableTemplates, setGitignoreTemplate])

    useEffect(() => {
        if (gitignoreTemplate === 'Custom' && availablePatterns.length === 0) {
            window.devscope.getGitignorePatterns().then((result) => {
                if (result.success) {
                    setAvailablePatterns(result.patterns)

                    if (project?.type) {
                        const autoSelect = new Set<string>()
                        autoSelect.add('env_files')
                        autoSelect.add('logs')
                        autoSelect.add('cache')
                        autoSelect.add('macos')
                        autoSelect.add('windows')
                        autoSelect.add('linux')

                        if (project.type === 'node') {
                            autoSelect.add('node_modules')
                            autoSelect.add('dist')
                            autoSelect.add('next_build')
                            autoSelect.add('npm_logs')
                        } else if (project.type === 'python') {
                            autoSelect.add('python_venv')
                            autoSelect.add('dist')
                            autoSelect.add('coverage')
                        } else if (project.type === 'rust') {
                            autoSelect.add('rust_target')
                        } else if (project.type === 'go') {
                            autoSelect.add('go_vendor')
                            autoSelect.add('compiled')
                        } else if (project.type === 'java' || project.type === 'dotnet') {
                            autoSelect.add('compiled')
                            autoSelect.add('dotnet_build')
                        }

                        autoSelect.add('vscode')
                        autoSelect.add('idea')
                        autoSelect.add('vim')
                        setSelectedPatterns(autoSelect)
                    }
                }
            })
        }
    }, [gitignoreTemplate, availablePatterns.length, project?.type, setAvailablePatterns, setSelectedPatterns])
}
