import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const desktopRoot = resolve(import.meta.dirname, '..')
const account = readFileSync(resolve(desktopRoot, 'src/renderer/src/pages/settings/AccountSettings.tsx'), 'utf8')
const service = readFileSync(resolve(desktopRoot, 'src/main/setup/openai-connection-service.ts'), 'utf8')
const handlers = readFileSync(resolve(desktopRoot, 'src/main/ipc/handlers/setup-handlers.ts'), 'utf8')
const browser = readFileSync(resolve(desktopRoot, 'src/renderer/src/lib/browser-devscope-adapter.ts'), 'utf8')

assert.match(account, /connectChatGpt/)
assert.match(account, /connectApiKey/)
assert.match(account, /switchDefaultConnection/)
assert.match(account, /disconnectOpenAI\(\{ method: disconnectMethod, confirmed: true \}\)/)
assert.match(account, /Use for new chats/)
assert.match(account, /Existing chats keep their canonical model and connection/)
assert.match(account, /<ConfirmModal/)
assert.doesNotMatch(account, /window\.confirm/)
assert.match(account, /Open Zyra Desktop on this computer to connect, replace, switch, or disconnect/)
assert.match(service, /getConnectionsStatus/)
assert.match(service, /removeZyraAuth/)
assert.match(handlers, /ONBOARDING_IPC\.disconnectOpenAI/)
assert.match(handlers, /input\?\.confirmed !== true/)
assert.match(handlers, /CONFIRMATION_REQUIRED/)
assert.match(browser, /disconnectOpenAI: \(\) => unavailable\('OpenAI account changes require Zyra Desktop\.'/)

console.log('account connection actions: ok')
