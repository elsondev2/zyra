export function chatGptWritingTestModel(commitModel: string, pullRequestModel: string, chatModel: string): string | undefined {
    return commitModel || pullRequestModel || (chatModel.startsWith('openai-codex/') ? chatModel : undefined)
}
