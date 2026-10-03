// Developer-only provisioning. --import-client uses a native file picker for
// Google's Desktop client JSON; --enter-secret offers a human-only masked input.
// Credentials never enter chat, stdout or argv.
// Bundle with Electron external; run the bundle with the local Electron binary.
import { app, dialog, safeStorage } from 'electron'
import { join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { PluginMcpCredentialStore } from '../src/main/assistant/plugin-mcp-credential-store'
import { GOOGLE_MCP_CLIENT_KEY, validateGoogleDesktopClientId, validateGoogleDesktopClientSecret } from '../src/main/assistant/google-plugin-mcp-client'
import { writeJsonAtomically } from '../src/main/setup/atomic-json'
import { promptGoogleDesktopClientSecret, type GoogleDesktopSecretInput } from './helpers/google-desktop-secret-prompt'

app.disableHardwareAcceleration()
// safeStorage's Windows key is profile-specific and initialized at readiness.
// Select the same profile as Zyra before touching encrypted registration bytes.
const suffix = String(process.env.ZYRA_DEV_INSTANCE_SUFFIX || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 32)
const profileName = suffix ? `Zyra-dev-${suffix}` : 'Zyra-dev'
app.setName(profileName)
app.setPath('userData', join(app.getPath('appData'), profileName))
app.setPath('sessionData', join(app.getPath('userData'), 'session'))
app.whenReady().then(async () => {
    const importing = process.argv.includes('--import-client')
    const entering = process.argv.includes('--enter-secret')
    if (importing && entering) throw new Error('Choose one registration input method.')
    let clientId = importing ? '' : validateGoogleDesktopClientId(process.env.ZYRA_GOOGLE_DESKTOP_CLIENT_ID)
    let clientSecret: string | undefined
    let enteredSecret: GoogleDesktopSecretInput | undefined
    if (importing) {
        const selected = await dialog.showOpenDialog({ title: 'Import Zyra Desktop Google client JSON', properties: ['openFile'], filters: [{ name: 'Google client JSON', extensions: ['json'] }] })
        if (selected.canceled || selected.filePaths.length !== 1) { app.quit(); return }
        const contents = await readFile(selected.filePaths[0])
        if (contents.length > 64 * 1024) throw new Error('Google client JSON exceeds its limit.')
        const installed = JSON.parse(contents.toString('utf8'))?.installed
        if (!installed || typeof installed !== 'object') throw new Error('Choose a Google Desktop client JSON, not a web client.')
        clientId = validateGoogleDesktopClientId(installed.client_id)
        clientSecret = validateGoogleDesktopClientSecret(installed.client_secret)
    }
    if (entering) {
        enteredSecret = await promptGoogleDesktopClientSecret()
        if (!enteredSecret) { app.quit(); return }
        clientSecret = enteredSecret.secret
    }
    const file = join(app.getPath('userData'), 'assistant', 'plugins', 'credentials', 'google-mcp-client.enc')
    const store = new PluginMcpCredentialStore(file, {
        isAvailable: () => safeStorage.isEncryptionAvailable(),
        encrypt: value => safeStorage.encryptString(value),
        decrypt: value => safeStorage.decryptString(value)
    })
    if (!process.argv.includes('--verify')) {
        const existing = (await store.get(GOOGLE_MCP_CLIENT_KEY))?.issuers?.['https://accounts.google.com']?.client as { client_id?: unknown } | undefined
        if (existing && (!(importing || entering) || existing.client_id !== clientId)) throw new Error('Google registration already exists; import must match the registered Desktop client.')
        if (!clientSecret) throw new Error('Use --import-client or --enter-secret to configure the complete Google Desktop registration.')
        await store.update(GOOGLE_MCP_CLIENT_KEY, record => ({ ...record, issuers: { ...record.issuers, 'https://accounts.google.com': { client: { client_id: clientId, client_secret: clientSecret } } } }))
    }
    const saved = (await store.get(GOOGLE_MCP_CLIENT_KEY))?.issuers?.['https://accounts.google.com']?.client as { client_id?: string; client_secret?: unknown }
    const savedSecret = validateGoogleDesktopClientSecret(saved?.client_secret)
    const encrypted = await readFile(file)
    if (saved?.client_id !== clientId || (clientSecret && savedSecret !== clientSecret) || encrypted.includes(Buffer.from(clientId)) || encrypted.includes(Buffer.from(savedSecret))) throw new Error('Encrypted registration verification failed.')
    await writeJsonAtomically(`${file}.verification.json`, { verified: true, osEncrypted: true, clientIdMatches: true, clientSecretEncrypted: true })
    console.log('Complete Google Desktop registration verified in OS-encrypted storage. Credential values were not logged.')
    // Closing the last window can quit Electron. Only close after the atomic
    // write, decrypt/readback and verification metadata have all completed.
    enteredSecret?.complete()
    // Graceful shutdown flushes the profile key to Local State. app.exit()
    // can leave a first-run encrypted registration permanently unreadable.
    app.quit()
}).catch(() => { console.error('Google Desktop registration provisioning failed; no credential values logged.'); app.exit(1) })
