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

type ZyraSdkAuthModule = {
    loginZyraAuth(provider: string, options: Record<string, unknown>): Promise<unknown>
    configureZyraOpenAIApiKey(apiKey: string, options?: Record<string, unknown>): Promise<unknown>
    verifyZyraOpenAIApiAuth(options?: Record<string, unknown>): Promise<unknown>
    getZyraAuthStatus(provider: string): Promise<AuthStatusResult>
    removeZyraAuth(method: 'subscription' | 'api', options?: Record<string, unknown>): Promise<unknown>
}

type ChatGptAccountModule = {
    buildChatGptAccountStatus(provider?: string): Promise<ChatGptStatusResult>
}

export type OpenAIConnectionServiceDependencies = {
    loadSdk?: () => Promise<ZyraSdkAuthModule>
    loadAccount?: () => Promise<ChatGptAccountModule>
    openExternal: (url: string) => Promise<unknown> | unknown
    now?: () => Date
}

function moduleUrl(relativePath: string): string {
    return pathToFileURL(join(resolveZyraRoot(), ...relativePath.split('/'))).href
}

function loadSdkModule(): Promise<ZyraSdkAuthModule> {
    return import(/* @vite-ignore */ moduleUrl('src/zyra-sdk.mjs')) as Promise<ZyraSdkAuthModule>
}

function loadAccountModule(): Promise<ChatGptAccountModule> {
    return import(/* @vite-ignore */ moduleUrl('src/chatgpt-account.mjs')) as Promise<ChatGptAccountModule>
}

function errorMessage(error: unknown): string {
    return error instanceof Error && error.message.trim() ? error.message : 'OpenAI connection verification failed.'
}

function isUsableSubscription(status: ChatGptStatusResult): boolean {
    if (status.status?.configured !== true) return false
    if (status.usage && !status.usageError) return true
    if (!status.tokenExpiresAt || status.usageError) return false
    const expiresAt = Date.parse(status.tokenExpiresAt)
    return Number.isFinite(expiresAt) && expiresAt > Date.now() + 60_000
}

export class OpenAIConnectionService {
    private operation: Promise<OnboardingAuthStatus> | null = null
    private readonly loadSdk: () => Promise<ZyraSdkAuthModule>
    private readonly loadAccount: () => Promise<ChatGptAccountModule>
    private readonly now: () => Date

    constructor(private readonly dependencies: OpenAIConnectionServiceDependencies) {
        this.loadSdk = dependencies.loadSdk || loadSdkModule
        this.loadAccount = dependencies.loadAccount || loadAccountModule
        this.now = dependencies.now || (() => new Date())
    }

    getStatus(): Promise<OnboardingAuthStatus> {
        if (this.operation) return this.operation
        return this.track(this.verifyConnections())
    }

    async getConnectionsStatus(): Promise<OpenAIConnectionsStatus> {
        if (this.operation) await this.operation.catch(() => undefined)
        const [chatgpt, apiKey] = await Promise.all([
            this.readChatGptConnection(),
            this.readApiKeyConnection()
        ])
        return { chatgpt, apiKey, checkedAt: this.now().toISOString() }
    }

    async disconnect(method: OnboardingAuthMethod): Promise<OpenAIConnectionsStatus> {
        if (method !== 'chatgpt' && method !== 'api-key') throw new Error('Choose a valid OpenAI connection to disconnect.')
        if (this.operation) throw new Error('Wait for the current OpenAI connection action to finish.')
        const sdk = await this.loadSdk()
        await sdk.removeZyraAuth(method === 'chatgpt' ? 'subscription' : 'api')
        return this.getConnectionsStatus()
    }

    connectChatGpt(): Promise<OnboardingAuthStatus> {
        if (this.operation) return this.operation
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
        return this.track((async () => {
            const key = typeof apiKey === 'string' ? apiKey.trim() : ''
            if (!key || /\s/.test(key) || key.length > 4_096) throw new Error('Enter a valid OpenAI API key.')
            const sdk = await this.loadSdk()
            await sdk.configureZyraOpenAIApiKey(key)
            await sdk.verifyZyraOpenAIApiAuth()
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
        this.operation = request
        const clear = () => {
            if (this.operation === request) this.operation = null
        }
        void request.then(clear, clear)
        return request
    }

    private async readChatGptConnection(): Promise<OpenAIConnectionMethodStatus> {
        const checkedAt = this.now().toISOString()
        try {
            const account = await this.loadAccount()
            const status = await account.buildChatGptAccountStatus('openai-codex')
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
            await sdk.verifyZyraOpenAIApiAuth()
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
        const status = await account.buildChatGptAccountStatus('openai-codex')
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
            const status = await account.buildChatGptAccountStatus('openai-codex')
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
                await sdk.verifyZyraOpenAIApiAuth()
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
