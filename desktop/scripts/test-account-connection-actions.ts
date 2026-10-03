import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const desktopRoot = resolve(import.meta.dirname, '..')
const providerSettings = resolve(desktopRoot, 'src/renderer/src/pages/settings/providers')
const account = readFileSync(resolve(providerSettings, 'useOpenAIAccountSettings.ts'), 'utf8')
const rows = readFileSync(resolve(providerSettings, 'OpenAIConnectionRows.tsx'), 'utf8')
const modelConnections = readFileSync(resolve(desktopRoot, 'src/renderer/src/pages/settings/ModelProviderConnections.tsx'), 'utf8')
const deviceCodeDialog = readFileSync(resolve(providerSettings, 'ChatGptDeviceCodeDialog.tsx'), 'utf8')
const page = readFileSync(resolve(providerSettings, 'ProviderConnections.tsx'), 'utf8')
const service = readFileSync(resolve(desktopRoot, 'src/main/setup/openai-connection-service.ts'), 'utf8')
const handlers = readFileSync(resolve(desktopRoot, 'src/main/ipc/handlers/setup-handlers.ts'), 'utf8')
const workerClient = readFileSync(resolve(desktopRoot, 'src/main/setup/provider-worker-client.ts'), 'utf8')
const narrowAuth = readFileSync(resolve(desktopRoot, '../src/desktop-openai-auth.mjs'), 'utf8')
const authWorker = readFileSync(resolve(desktopRoot, '../src/desktop-provider-worker.mjs'), 'utf8')
const oauthCallbacks = readFileSync(resolve(desktopRoot, '../src/oauth-login-callbacks.mjs'), 'utf8')
const browser = readFileSync(resolve(desktopRoot, 'src/renderer/src/lib/browser-devscope-adapter.ts'), 'utf8')
const settings = readFileSync(resolve(desktopRoot, 'src/renderer/src/lib/settings.tsx'), 'utf8')

assert.match(account, /connectChatGpt/)
assert.match(account, /signInMethod: ChatGptSignInMethod/, 'the renderer carries the selected ChatGPT sign-in method through IPC')
assert.match(account, /getChatGptDeviceCode/, 'device-code events are polled while ChatGPT authentication is pending')
assert.match(account, /setChatGptAuthenticationSuccessOpen\(true\)/, 'the success page appears only after ChatGPT is verified and settings refresh')
assert.match(account, /connectApiKey/)
assert.match(account, /switchDefaultConnection/)
assert.match(account, /await updateSettings\(\{ assistantDefaultModel: target\.id \}\)/, 'connection switching waits for main-owned preference persistence before another account mutation')
assert.match(settings, /updateSettings: \(partial: Partial<Settings>\) => Promise<void>/, 'callers can await main-owned settings writes')
assert.match(account, /disconnectOpenAI\(\{ method: disconnectMethod, confirmed: true \}\)/)
assert.match(page, /useOpenAIAccountSettings\(\{ connectionsActive: true \}\)/)
assert.match(page, /import \{ OpenAIConnectionRows \} from '\.\/OpenAIConnectionRows'/, 'the rendered connection rows must be imported by the provider-connections route')
assert.match(page, /<OpenAIConnectionRows connection=\{connection\}/)
assert.match(rows, /Use for new chats/)
assert.match(rows, /icon: <RefreshCw size=\{13\} \/>/)
assert.match(rows, /icon: <MonitorSmartphone size=\{13\} \/>/)
assert.match(rows, /icon: <MessageSquarePlus size=\{13\} \/>/)
assert.match(rows, /icon: <Unplug size=\{13\} \/>/)
assert.match(rows, /icon: <KeyRound size=\{13\} \/>/, 'OpenAI API-key actions carry the same menu icons as ChatGPT')
assert.match(modelConnections, /icon: <Repeat2 size=\{13\} \/>/, 'every generic provider connection has an icon for replacement')
assert.match(modelConnections, /icon: <MessageSquarePlus size=\{13\} \/>/, 'every generic provider connection has an icon for default-chat selection')
assert.match(modelConnections, /icon: <Unplug size=\{13\} \/>/, 'every generic provider connection has an icon for disconnecting')
assert.match(rows, /<ConfirmModal[\s\S]*onConfirm=\{\(\) => void disconnect\(\)\}/)
assert.match(rows, /<ChatGptAuthenticationSuccess open=\{chatGptAuthenticationSuccessOpen\}/)
assert.doesNotMatch(rows, /title="Sign in with device code"/, 'device-code sign-in belongs inside the ChatGPT connection flow, not as a standalone provider row')
assert.match(modelConnections, /addProvider === 'chatgpt'/, 'selecting ChatGPT opens its dedicated connection step')
assert.match(modelConnections, /Continue with browser/)
assert.match(modelConnections, /Use device code instead/)
assert.match(rows, /<ChatGptDeviceCodeDialog open=\{chatGptDeviceCodeOpen\} deviceCode=\{chatGptDeviceCode\}/)
assert.match(deviceCodeDialog, /window\.devscope\.copyToClipboard/, 'device-code copying uses the Electron clipboard bridge before the browser fallback')
assert.match(deviceCodeDialog, /copyState === 'copied'/, 'device-code copying gives visible confirmation')
assert.doesNotMatch(account + rows, /window\.confirm/)
assert.match(rows, /Open Zyra Desktop on this computer to connect, replace, switch, or disconnect/)
assert.match(service, /getConnectionsStatus/)
assert.match(service, /source\.verificationUri\)/, 'native device-code events use the verificationUri field')
assert.match(service, /removeZyraAuth/)
assert.match(service, /desktop-openai-auth\.mjs/)
assert.doesNotMatch(service, /src\/zyra-sdk\.mjs/, 'Desktop connection checks must not synchronously import the full Pi runtime')
assert.match(service, /includeUsage: false, refreshCredential: false/, 'onboarding checks must avoid the account-usage network path')
assert.match(workerClient, /node:worker_threads/)
assert.match(workerClient, /ProviderWorkerClient/)
assert.match(workerClient, /getSharedProviderWorkerClient/, 'account and Voice paths must share one unrefed auth worker')
assert.match(workerClient, /this\.rejectRequest\(id, request, error\)/, 'worker callback failures reject the connection request instead of escaping Electron\'s main process')
assert.match(authWorker, /buildChatGptAccountStatus/)
assert.match(authWorker, /onPrompt: waitForAutomaticBrowserCallback/, 'legacy provider sign-in keeps its browser callback active')
assert.match(authWorker, /signInMethod: message\.signInMethod/, 'the worker forwards the selected method to native ChatGPT sign-in')
assert.match(narrowAuth, /loginOpenAICodexAuth/, 'ChatGPT authentication uses Zyra\'s native OAuth flow')
assert.match(narrowAuth, /createZyraCredentialAuthStorage/, 'native ChatGPT OAuth credentials stay in Zyra storage')
assert.match(oauthCallbacks, /export function waitForAutomaticBrowserCallback/, 'automatic browser OAuth waits for the callback listener to settle')
assert.match(authWorker, /case "resolveChatGptAccountAuth"[\s\S]{0,100}resolveChatGptAccountAuth\(\)/, 'Voice credential resolution must stay in the auth worker')
assert.doesNotMatch(narrowAuth, /pi-runtime|createZyraAuthStorage|createBrowserOAuthLoginCallbacks/, 'native OpenAI auth does not load Pi authentication')
assert.doesNotMatch(narrowAuth, /zyra-sdk/, 'narrow Desktop auth must stay independent from the full runtime')
assert.match(handlers, /ONBOARDING_IPC\.disconnectOpenAI/)
assert.match(handlers, /input\?\.confirmed !== true/)
assert.match(handlers, /CONFIRMATION_REQUIRED/)
assert.match(browser, /disconnectOpenAI: \(\) => unavailable\('OpenAI account changes require Zyra Desktop\.'/)

const { configureZyraOpenAIApiKey, loginZyraAuth } = await import(pathToFileURL(resolve(desktopRoot, '../src/desktop-openai-auth.mjs')).href)
const { waitForAutomaticBrowserCallback } = await import(pathToFileURL(resolve(desktopRoot, '../src/oauth-login-callbacks.mjs')).href)
const configuredApiProviders: Array<{ provider: string; credential: unknown }> = []
const apiVerification = await configureZyraOpenAIApiKey('test-openai-key', {
    authStorage: {
        set(provider: string, credential: unknown) { configuredApiProviders.push({ provider, credential }) }
    },
    fetch: async () => ({
        ok: true,
        status: 200,
        body: { cancel: async () => undefined }
    })
})
assert.equal(apiVerification.model, 'openai/gpt-5.6-luna', 'Desktop API-key verification returns the concrete model that onboarding can persist')
assert.equal(configuredApiProviders[0]?.provider, 'openai')

let nativeOauthContractChecked = false
let storedOauthCredential: Record<string, unknown> | undefined
await loginZyraAuth('openai-codex', {
    authStorage: {
        async loginOAuth(provider: string, credential: Record<string, unknown>) {
            assert.equal(provider, 'openai-codex')
            storedOauthCredential = credential
        },
        getAuthStatus: () => ({ configured: true })
    },
    clientId: 'zyra-fixture-client',
    authBaseUrl: 'https://auth.fixture.invalid',
    callbackPort: 0,
    redirectHost: '127.0.0.1',
    fetch: async (url: string, request: { body: string }) => {
        assert.equal(String(url), 'https://auth.fixture.invalid/oauth/token')
        assert.equal(new URLSearchParams(request.body).get('code'), 'fixture-desktop-auth-code')
        const idToken = `fixture.${Buffer.from(JSON.stringify({ chatgpt_account_id: 'fixture-desktop-account' })).toString('base64url')}.signature`
        return new Response(JSON.stringify({
            access_token: 'fixture-desktop-access',
            refresh_token: 'fixture-desktop-refresh',
            id_token: idToken,
            expires_in: 3600
        }), { status: 200, headers: { 'content-type': 'application/json' } })
    },
    onAuth: async (info: { url: string }) => {
        const authorization = new URL(info.url)
        assert.equal(authorization.searchParams.get('client_id'), 'zyra-fixture-client')
        const redirect = authorization.searchParams.get('redirect_uri')
        const callback = await fetch(`${redirect}?code=fixture-desktop-auth-code&state=${authorization.searchParams.get('state')}`)
        assert.equal(callback.status, 200)
        nativeOauthContractChecked = true
    },
})
assert.equal(nativeOauthContractChecked, true)
assert.equal(storedOauthCredential?.accountId, 'fixture-desktop-account')

const callbackAbort = new AbortController()
const waitingForCallback = waitForAutomaticBrowserCallback({ signal: callbackAbort.signal })
callbackAbort.abort(new Error('Callback completed elsewhere.'))
await assert.rejects(waitingForCallback, /Callback completed elsewhere/, 'the manual-code fallback stays pending until the OAuth callback closes it')

console.log('account connection actions: ok')
