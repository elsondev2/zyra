import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import type {
    OnboardingAuthMethod,
    OnboardingAuthStatus,
    OpenAIConnectionMethodStatus,
    OpenAIConnectionsStatus
} from '../../shared/onboarding/contracts'
import { resolveZyraRoot } from '../zyra/zyra-root'

type AuthStatusResult = { provider?: string; status?: { configured?: boolean } }
type ChatGptStatusResult = {
    provider?: string
    status?: { configured?: boolean }
    usage?: unknown
    usageError?: string
    tokenExpiresAt?: string | null
}

type ApiVerificationResult = {
    model?: unknown
    availableModelIds?: unknown
}

type ZyraSdkAuthModule = {
    loginZyraAuth(provider: string, options: Record<string, unknown>): Promise<unknown>
    configureZyraOpenAIApiKey(apiKey: string, options?: Record<string, unknown>): Promise<ApiVerificationResult>
    verifyZyraOpenAIApiAuth(options?: Record<string, unknown>): Promise<ApiVerificationResult>
    getZyraAuthStatus(provider: string): Promise<AuthStatusResult>
    removeZyraAuth(method: 'subscription' | 'api', options?: Record<string, unknown>): Promise<unknown>
}

type ChatGptAccountModule = {
    buildChatGptAccountStatus(provider?: string, options?: { includeUsage?: boolean; refreshCredential?: boolean }): Promise<ChatGptStatusResult>
}

export type OpenAIConnectionServiceDependencies = {
    loadSdk?: () => Promise<ZyraSdkAuthModule>
    loadAccount?: () => Promise<ChatGptAccountModule>
    openExternal: (url: string) => Promise<unknown> | unknown
    prewarm?: () => Promise<void>
    dispose?: () => Promise<unknown> | unknown
    now?: () => Date
    getAssistantDefaultModel?: () => Promise<string>
    setAssistantDefaultModel?: (model: string) => Promise<void>
}

const CHATGPT_DEFAULT_MODEL = 'openai-codex/gpt-5.6-sol'

function moduleUrl(relativePath: string): string {
    return pathToFileURL(join(resolveZyraRoot(), ...relativePath.split('/'))).href
}

function loadSdkModule(): Promise<ZyraSdkAuthModule> {
    return import(/* @vite-ignore */ moduleUrl('src/desktop-openai-auth.mjs')) as Promise<ZyraSdkAuthModule>
}

function loadAccountModule(): Promise<ChatGptAccountModule> {
    return import(/* @vite-ignore */ moduleUrl('src/chatgpt-account.mjs')) as Promise<ChatGptAccountModule>
}

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message.trim() ? error.message : 'OpenAI connection verification failed.'
}

function verifiedApiModel(verification: ApiVerificationResult): string | null {
    const model = typeof verification?.model === 'string' ? verification.model.trim() : ''
    return model.startsWith('openai/') && model.length <= 256 ? model : null
}

function apiVerificationSupportsModel(verification: ApiVerificationResult, model: string): boolean {
    if (!model.startsWith('openai/')) return false
    if (verifiedApiModel(verification) === model) return true
    const modelId = model.slice('openai/'.length)
    return Array.isArray(verification.availableModelIds)
        && verification.availableModelIds.some((candidate) => candidate === modelId)
}

function disconnectedMethodOwnsDefault(method: OnboardingAuthMethod, model: string): boolean {
    if (method === 'chatgpt') return !model || model.startsWith('openai-codex/')
    return model.startsWith('openai/')
}

function isUsableSubscription(status: ChatGptStatusResult): boolean {
    if (status.status?.configured !== true) return false
    if (status.usage && !status.usageError) return true
    if (!status.tokenExpiresAt) return false
    const expiresAt = Date.parse(status.tokenExpiresAt)
    return Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000
}

export class OpenAIConnectionService {
    private operation: Promise<OnboardingAuthStatus> | null = null
    private verifiedCache: { status: OnboardingAuthStatus; expiresAt: number } | null = null
    private disconnectOperation: Promise<OpenAIConnectionsStatus> | null = null
    private readonly loadSdk: () => Promise<ZyraSdkAuthModule>
    private readonly loadAccount: () => Promise<ChatGptAccountModule>
    private readonly now: () => Date
    private lastVerifiedApiModel: string | null = null

    constructor(private readonly dependencies: OpenAIConnectionServiceDependencies) {
        this.loadSdk = dependencies.loadSdk || loadSdkModule
        this.loadAccount = dependencies.loadAccount || loadAccountModule
        this.now = dependencies.now || (() => new Date())
    }

    prewarm(): Promise<void> {
        return this.dependencies.prewarm?.() || Promise.resolve()
    }

    async dispose(): Promise<void> {
        await this.dependencies.dispose?.()
    }

    getStatus(): Promise<OnboardingAuthStatus> {
        if (this.operation) return this.operation
        if (this.disconnectOperation) return this.disconnectOperation.then(() => this.getStatus())
        if (this.verifiedCache && this.verifiedCache.expiresAt > this.now().getTime()) {
            return Promise.resolve({ ...this.verifiedCache.status, checkedAt: this.now().toISOString() })
        }
        return this.track(this.verifyConnections())
    }

    async getConnectionsStatus(): Promise<OpenAIConnectionsStatus> {
        if (this.operation) await this.operation.catch(() => undefined)
        if (this.disconnectOperation) await this.disconnectOperation.catch(() => undefined)
        return this.readConnectionsStatus()
    }

    disconnect(method: OnboardingAuthMethod): Promise<OpenAIConnectionsStatus> {
        if (method !== 'chatgpt' && method !== 'api-key') return Promise.reject(new Error('Choose a valid OpenAI connection to disconnect.'))
        if (this.operation || this.disconnectOperation) return Promise.reject(new Error('Wait for the current OpenAI connection action to finish.'))

        const tracked = this.performDisconnect(method)
        this.disconnectOperation = tracked
        const clear = () => {
            if (this.disconnectOperation === tracked) this.disconnectOperation = null
        }
        void tracked.then(clear, clear)
        return tracked
    }

    private async performDisconnect(method: OnboardingAuthMethod): Promise<OpenAIConnectionsStatus> {
        this.verifiedCache = null
        const currentDefault = await this.dependencies.getAssistantDefaultModel?.() || ''
        const beforeStatus = await this.readConnectionsStatus()
        const ownsDefault = disconnectedMethodOwnsDefault(method, currentDefault)
        const fallback = method === 'chatgpt'
            ? beforeStatus.apiKey.verified ? this.lastVerifiedApiModel || '' : ''
            : beforeStatus.chatgpt.verified ? CHATGPT_DEFAULT_MODEL : ''

        if (ownsDefault) await this.dependencies.setAssistantDefaultModel?.(fallback)
        const sdk = await this.loadSdk()
        try {
            await sdk.removeZyraAuth(method === 'chatgpt' ? 'subscription' : 'api')
        } catch (error) {
            if (ownsDefault) await this.dependencies.setAssistantDefaultModel?.(currentDefault).catch(() => undefined)
            throw error
        }
        return this.readConnectionsStatus()
    }

    private async readConnectionsStatus(): Promise<OpenAIConnectionsStatus> {
        const [chatgpt, apiKey] = await Promise.all([
            this.readChatGptConnection(),
            this.readApiKeyConnection()
        ])
        return { chatgpt, apiKey, checkedAt: this.now().toISOString() }
    }

    connectChatGpt(): Promise<OnboardingAuthStatus> {
        if (this.operation) return this.operation
        if (this.disconnectOperation) return Promise.reject(new Error('Wait for the current OpenAI connection action to finish.'))
        return this.track((async () => {
            const sdk = await this.loadSdk()
            await sdk.loginZyraAuth('openai-codex', {
                onMessage: () => undefined,
                onProgress: () => undefined,
                onAuth: (info: unknown) => {
                    const url = info && typeof info === 'object' && typeof (info as { url?: unknown }).url === 'string'
                        ? (info as { url: string }).url
                        : ''
                    if (!url) throw new Error('OpenAI did not provide a sign-in URL.')
                    void Promise.resolve(this.dependencies.openExternal(url))
                },
                onPrompt: async () => {
                    throw new Error('This OpenAI sign-in requires a browser callback that Desktop could not complete. Try again or use an API key.')
                }
            })
            return this.verifyChatGptConnection()
        })())
    }

    connectApiKey(apiKey: string): Promise<OnboardingAuthStatus> {
        if (this.operation) return this.operation
        if (this.disconnectOperation) return Promise.reject(new Error('Wait for the current OpenAI connection action to finish.'))
        return this.track((async () => {
            const key = typeof apiKey === 'string' ? apiKey.trim() : ''
            if (!key || /\s/.test(key) || key.length > 4_096) throw new Error('Enter a valid OpenAI API key.')
            const sdk = await this.loadSdk()
            const verification = await sdk.configureZyraOpenAIApiKey(key)
            const model = verifiedApiModel(verification)
            if (!model) throw new Error('The API key is valid, but no supported GPT-5.6 API model is available to this account.')
            this.lastVerifiedApiModel = model
            const currentDefault = await this.dependencies.getAssistantDefaultModel?.() || ''
            const keepCurrentDefault = currentDefault.startsWith('openai/')
                ? apiVerificationSupportsModel(verification, currentDefault)
                : currentDefault.startsWith('openai-codex/')
                    ? (await this.readChatGptConnection()).verified
                    : Boolean(currentDefault)
            if (!keepCurrentDefault) await this.dependencies.setAssistantDefaultModel?.(model)
            return {
                checking: false,
                verified: true,
                method: 'api-key',
                provider: 'openai',
                label: 'OpenAI API connected',
                detail: null,
                checkedAt: this.now().toISOString()
            }
        })())
    }

    private track(request: Promise<OnboardingAuthStatus>): Promise<OnboardingAuthStatus> {
        const tracked = request.then((status) => {
            this.verifiedCache = status.verified
                ? { status, expiresAt: this.now().getTime() + 60_000 }
                : null
            return status
        })
        this.operation = tracked
        const clear = () => {
            if (this.operation === tracked) this.operation = null
        }
        void tracked.then(clear, clear)
        return tracked
    }

    private async readChatGptConnection(): Promise<OpenAIConnectionMethodStatus> {
        const checkedAt = this.now().toISOString()
        try {
            const account = await this.loadAccount()
            const status = await account.buildChatGptAccountStatus('openai-codex', { includeUsage: false, refreshCredential: false })
            const configured = status.status?.configured === true
            const verified = configured && isUsableSubscription(status)
            return {
                method: 'chatgpt',
                provider: 'openai-codex',
                configured,
                verified,
                label: verified ? 'ChatGPT connected' : configured ? 'ChatGPT needs attention' : 'ChatGPT not connected',
                detail: verified ? null : status.usageError || null,
                checkedAt
            }
        } catch (error) {
            return {
                method: 'chatgpt',
                provider: 'openai-codex',
                configured: false,
                verified: false,
                label: 'ChatGPT unavailable',
                detail: errorMessage(error),
                checkedAt
            }
        }
    }

    private async readApiKeyConnection(): Promise<OpenAIConnectionMethodStatus> {
        const checkedAt = this.now().toISOString()
        let configured = false
        try {
            const sdk = await this.loadSdk()
            const status = await sdk.getZyraAuthStatus('openai')
            configured = status.status?.configured === true
            if (!configured) {
                return {
                    method: 'api-key',
                    provider: 'openai',
                    configured: false,
                    verified: false,
                    label: 'OpenAI API key not connected',
                    detail: null,
                    checkedAt
                }
            }
            const verification = await sdk.verifyZyraOpenAIApiAuth()
            const model = verifiedApiModel(verification)
            if (!model) throw new Error('The API key is valid, but no supported GPT-5.6 API model is available to this account.')
            this.lastVerifiedApiModel = model
            return {
                method: 'api-key',
                provider: 'openai',
                configured: true,
                verified: true,
                label: 'OpenAI API connected',
                detail: null,
                checkedAt
            }
        } catch (error) {
            this.lastVerifiedApiModel = null
            return {
                method: 'api-key',
                provider: 'openai',
                configured,
                verified: false,
                label: configured ? 'OpenAI API key needs attention' : 'OpenAI API unavailable',
                detail: errorMessage(error),
                checkedAt
            }
        }
    }

    private async verifyChatGptConnection(): Promise<OnboardingAuthStatus> {
        const checkedAt = this.now().toISOString()
        const account = await this.loadAccount()
        const status = await account.buildChatGptAccountStatus('openai-codex', { includeUsage: false, refreshCredential: false })
        if (!isUsableSubscription(status)) {
            throw new Error(status.usageError || 'OpenAI sign-in completed but the ChatGPT connection could not be verified.')
        }
        return {
            checking: false,
            verified: true,
            method: 'chatgpt',
            provider: 'openai-codex',
            label: 'ChatGPT connected',
            detail: null,
            checkedAt
        }
    }

    private async verifyConnections(): Promise<OnboardingAuthStatus> {
        const checkedAt = this.now().toISOString()
        let subscriptionError: string | null = null
        try {
            const account = await this.loadAccount()
            const status = await account.buildChatGptAccountStatus('openai-codex', { includeUsage: false, refreshCredential: false })
            if (isUsableSubscription(status)) {
                return {
                    checking: false,
                    verified: true,
                    method: 'chatgpt',
                    provider: 'openai-codex',
                    label: 'ChatGPT connected',
                    detail: null,
                    checkedAt
                }
            }
            if (status.status?.configured) subscriptionError = status.usageError || 'The ChatGPT connection could not be verified.'
        } catch (error) {
            subscriptionError = errorMessage(error)
        }

        let apiConfigured = false
        let apiError: string | null = null
        try {
            const sdk = await this.loadSdk()
            const status = await sdk.getZyraAuthStatus('openai')
            apiConfigured = status.status?.configured === true
            if (apiConfigured) {
                const verification = await sdk.verifyZyraOpenAIApiAuth()
                const model = verifiedApiModel(verification)
                if (!model) throw new Error('The API key is valid, but no supported GPT-5.6 API model is available to this account.')
                this.lastVerifiedApiModel = model
                return {
                    checking: false,
                    verified: true,
                    method: 'api-key',
                    provider: 'openai',
                    label: 'OpenAI API connected',
                    detail: null,
                    checkedAt
                }
            }
        } catch (error) {
            apiError = errorMessage(error)
        }

        const detail = apiConfigured
            ? apiError || subscriptionError
            : subscriptionError
        return {
            checking: false,
            verified: false,
            method: null,
            provider: null,
            label: 'OpenAI connection required',
            detail,
            checkedAt
        }
    }
}
