const ASSISTANT_SKILL_SOURCE_REVISION_STORAGE_KEY = 'zyra:assistant:skill-source-revision:v1'

export function readAssistantSkillSourceRevision(): string {
    return localStorage.getItem(ASSISTANT_SKILL_SOURCE_REVISION_STORAGE_KEY) || ''
}

export function markAssistantSkillSourcesChanged(): void {
    localStorage.setItem(ASSISTANT_SKILL_SOURCE_REVISION_STORAGE_KEY, `${Date.now()}`)
}
