import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const desktopRoot = resolve(scriptDirectory, '..')
const repoRoot = resolve(desktopRoot, '..')
const accountServicePath = resolve(desktopRoot, 'src/main/assistant/zyra-account-service.ts')
const accountServiceSource = readFileSync(accountServicePath, 'utf8')
const accountModuleMatch = /join\(resolveZyraRoot\(\), 'src', '([^']+)'\)/.exec(accountServiceSource)

assert.ok(accountModuleMatch?.[1], 'the account service must load a dedicated Zyra account module')

const accountModuleUrl = pathToFileURL(resolve(repoRoot, 'src', accountModuleMatch[1])).href
const require = createRequire(import.meta.url)
const electronPath = require('electron')
const probe = `
const account = await import(${JSON.stringify(accountModuleUrl)});
if (typeof account.buildChatGptAccountStatus !== 'function') throw new Error('ChatGPT account status export is missing');
if (typeof account.fetchCodexResetCredits !== 'function') throw new Error('reset list export is missing');
const usage = account.normalizeCodexUsageStats({ rate_limit: { primary_window: { used_percent: 25 } } }, 'test');
if (usage.primary?.usedPercent !== 25) throw new Error('usage normalization failed');
console.log('assistant-account-electron-import-ok');
`
const result = spawnSync(electronPath, ['--input-type=module', '-e', probe], {
    cwd: repoRoot,
    env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1'
    },
    encoding: 'utf8',
    timeout: 30_000,
    windowsHide: true
})

assert.equal(
    result.status,
    0,
    `Electron could not load the account module.\n${String(result.stderr || result.stdout || '').trim()}`
)
assert.match(result.stdout, /assistant-account-electron-import-ok/)

console.log('assistant account Electron runtime tests passed')
