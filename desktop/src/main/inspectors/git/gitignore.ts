import { getGitignorePatterns } from './gitignore-patterns'
import { GITIGNORE_TEMPLATES } from './gitignore-templates'
import type { GitignorePattern } from './types'

export { getGitignoreTemplates, getGitignorePatterns } from './gitignore-patterns'
export type { GitignorePattern } from './types'

export function generateGitignoreContent(template: string): string {
    return GITIGNORE_TEMPLATES[template] || GITIGNORE_TEMPLATES.General
}

export function generateCustomGitignoreContent(selectedPatternIds: string[]): string {
    const allPatterns = getGitignorePatterns()
    const selectedPatterns = allPatterns.filter((pattern) => selectedPatternIds.includes(pattern.id))

    const byCategory: Record<string, GitignorePattern[]> = {}
    selectedPatterns.forEach((pattern) => {
        if (!byCategory[pattern.category]) {
            byCategory[pattern.category] = []
        }
        byCategory[pattern.category].push(pattern)
    })

    let content = '# Custom .gitignore\n\n'
    const categoryNames: Record<string, string> = {
        dependencies: 'Dependencies',
        build: 'Build Outputs',
        environment: 'Environment & Secrets',
        ide: 'IDE & Editors',
        os: 'Operating System',
        logs: 'Logs',
        cache: 'Cache & Temp',
        testing: 'Testing'
    }

    Object.entries(byCategory).forEach(([category, patterns]) => {
        content += `# ${categoryNames[category] || category}\n`
        patterns.forEach((pattern) => {
            pattern.patterns.forEach((entry) => {
                content += `${entry}\n`
            })
        })
        content += '\n'
    })

    return content.trim()
}
