import log from 'electron-log'
import { generateCodexText } from './codex'
import { requestGenerateContent } from './gemini/request'

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const GROQ_MODEL = 'llama-3.1-8b-instant'

type PullRequestDraftInput = {
    projectName?: string
    currentBranch: string
    targetBranch: string
    scopeLabel: string
    diff: string
    guideText?: string
}

function buildPrompt(input: PullRequestDraftInput) {
    const maxDiffLength = 14000
    const truncatedDiff = input.diff.length > maxDiffLength
        ? `${input.diff.slice(0, maxDiffLength)}\n\n... (diff truncated)`
        : input.diff
    const guideText = input.guideText?.trim()
        ? input.guideText.trim()
        : 'No extra PR guide provided. Use a clean engineering PR structure with Summary, Changes, Testing, and Risks.'

    return `You are writing a pull request draft for a software project.

Return valid JSON only with this exact shape:
{
  "title": "string",
  "body": "string"
}

Rules:
- The title must be concise, concrete, and suitable for a GitHub pull request.
- The body must be GitHub-flavored markdown.
- Follow the PR guide if one is provided.
- Be accurate to the diff and branch context. Do not invent work that is not present.
- The body should be structured and useful, not generic.
- Prefer sections like Summary, Changes, Testing, Risks, Notes when relevant.
- If testing evidence is missing, say it is not yet validated instead of inventing results.
- Do not add commentary before or after the JSON.

Project: ${input.projectName || 'Unknown project'}
Current branch: ${input.currentBranch}
Target branch: ${input.targetBranch}
Selected scope: ${input.scopeLabel}

PR guide:
${guideText}

Diff/context:
\`\`\`diff
${truncatedDiff}
\`\`\`
`
}

function stripMarkdownFence(text: string): string {
    const trimmed = String(text || '').trim()
    if (!trimmed.startsWith('```')) return trimmed

    const firstNewlineIndex = trimmed.indexOf('\n')
    if (firstNewlineIndex < 0) return trimmed

    const closingFenceIndex = trimmed.lastIndexOf('```')
    if (closingFenceIndex <= firstNewlineIndex) return trimmed

    return trimmed.slice(firstNewlineIndex + 1, closingFenceIndex).trim()
}

function extractJsonObjects(text: string): string[] {
    const source = String(text || '')
    const results: string[] = []
    let startIndex = -1
    let depth = 0
    let inString = false
    let escaped = false

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index]

        if (escaped) {
            escaped = false
            continue
        }

        if (inString && char === '\\') {
            escaped = true
            continue
        }

        if (char === '"') {
            inString = !inString
            continue
        }

        if (inString) continue

        if (char === '{') {
            if (depth === 0) {
                startIndex = index
            }
            depth += 1
            continue
        }

        if (char === '}') {
            if (depth === 0) continue
            depth -= 1
            if (depth === 0 && startIndex >= 0) {
                results.push(source.slice(startIndex, index + 1))
                startIndex = -1
            }
        }
    }

    return results
}

function parseDraftCandidate(candidate: string): { title: string; body: string } | null {
    try {
        const parsed = JSON.parse(candidate) as { title?: string; body?: string }
        const title = String(parsed?.title || '').trim()
        const body = String(parsed?.body || '').trim()

        if (!title || !body) {
            return null
        }

        return { title, body }
    } catch {
        return null
    }
}

function parseDraftResponse(text: string): { title: string; body: string } {
    const trimmed = String(text || '').trim()
    const withoutFence = stripMarkdownFence(trimmed)
    const candidates = [
        trimmed,
        withoutFence,
        ...extractJsonObjects(trimmed),
        ...extractJsonObjects(withoutFence)
    ]
    const seen = new Set<string>()

    for (const candidate of candidates) {
        const normalized = String(candidate || '').trim()
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)

        const parsed = parseDraftCandidate(normalized)
        if (parsed) {
            return parsed
        }
    }

    throw new Error('AI returned an invalid pull request draft format. Expected JSON with non-empty title and body.')
}

async function requestGroq(apiKey: string, prompt: string): Promise<{ success: boolean; text?: string; error?: string }> {
    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: GROQ_MODEL,
            messages: [
                { role: 'system', content: 'Return only valid JSON for the requested pull request draft.' },
                { role: 'user', content: prompt }
            ],
            max_tokens: 1800,
            temperature: 0.15
        })
    })

    const data = await response.json().catch(() => ({})) as {
        choices?: Array<{ message?: { content?: string } }>
        error?: { message?: string }
    }

    if (!response.ok) {
        return {
            success: false,
            error: data.error?.message || `HTTP ${response.status}: ${response.statusText}`
        }
    }

    const text = data.choices?.[0]?.message?.content?.trim()
    if (!text) {
        return { success: false, error: 'Unexpected Groq response.' }
    }

    return { success: true, text }
}

export async function generateGroqPullRequestDraft(
    apiKey: string,
    input: PullRequestDraftInput
): Promise<{ success: boolean; title?: string; body?: string; error?: string }> {
    try {
        const prompt = buildPrompt(input)
        const result = await requestGroq(apiKey, prompt)
        if (!result.success || !result.text) {
            return { success: false, error: result.error || 'Failed to generate pull request draft.' }
        }

        const parsed = parseDraftResponse(result.text)
        return { success: true, ...parsed }
    } catch (err: any) {
        log.error('[Groq] Failed to generate pull request draft:', err)
        return { success: false, error: err.message || 'Failed to generate pull request draft.' }
    }
}

export async function generateGeminiPullRequestDraft(
    apiKey: string,
    input: PullRequestDraftInput
): Promise<{ success: boolean; title?: string; body?: string; error?: string }> {
    try {
        const prompt = buildPrompt(input)
        const result = await requestGenerateContent(apiKey, {
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
                temperature: 0.15,
                maxOutputTokens: 1800,
                thinkingConfig: { thinkingBudget: 0 }
            }
        })

        if (!result.success || !result.text) {
            return { success: false, error: result.error || 'Failed to generate pull request draft.' }
        }

        const parsed = parseDraftResponse(result.text)
        return { success: true, ...parsed }
    } catch (err: any) {
        log.error('[Gemini] Failed to generate pull request draft:', err)
        return { success: false, error: err.message || 'Failed to generate pull request draft.' }
    }
}

export async function generateCodexPullRequestDraft(
    input: PullRequestDraftInput,
    model?: string
): Promise<{ success: boolean; title?: string; body?: string; error?: string }> {
    try {
        const prompt = buildPrompt(input)
        const result = await generateCodexText(prompt, {
            cwd: process.cwd(),
            model
        })

        if (!result.success || !result.text) {
            return { success: false, error: result.error || 'Failed to generate pull request draft.' }
        }

        const parsed = parseDraftResponse(result.text)
        return { success: true, ...parsed }
    } catch (err: any) {
        log.error('[Codex] Failed to generate pull request draft:', err)
        return { success: false, error: err.message || 'Failed to generate pull request draft.' }
    }
}
