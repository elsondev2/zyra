import { createHash, randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { BrowserWindow, ipcMain } from 'electron'
import { validateGoogleDesktopClientSecret } from '../../src/main/assistant/google-plugin-mcp-client'

/** Human-only input. No model/browser tooling, clipboard reads or plaintext files. */
export type GoogleDesktopSecretInput = { secret: string; complete(): void }

export async function promptGoogleDesktopClientSecret(): Promise<GoogleDesktopSecretInput | undefined> {
    const channel = `zyra-google-secret-${randomUUID()}`
    const script = `document.querySelector('form').addEventListener('submit',async event=>{event.preventDefault();const input=document.querySelector('input');const button=document.querySelector('button');const value=input.value;input.value='';button.disabled=true;try{const result=await window.googleSetup.save(value);if(!result.ok){document.querySelector('[role=status]').textContent=result.message;button.disabled=false;input.focus();}else{document.querySelector('[role=status]').textContent='Saving and verifying encrypted registration…';}}catch{document.querySelector('[role=status]').textContent='Setup closed. No value was logged.';}});`
    const hash = createHash('sha256').update(script).digest('base64')
    const html = `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'sha256-${hash}'; style-src 'unsafe-inline'; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Zyra Google setup</title><style>:root{color-scheme:dark}*{box-sizing:border-box}body{margin:0;padding:24px;background:#10161c;color:#e6e9ed;font:14px system-ui}h1{font-size:18px;margin:0 0 12px}p{color:#a8b1bc;line-height:1.5;margin:0 0 20px}label{display:block;margin-bottom:8px}input{width:100%;padding:10px;background:#19212b;border:1px solid #475361;border-radius:4px;color:inherit;font:inherit}input:focus{outline:2px solid #9dc5fa;outline-offset:2px}button{margin-top:16px;padding:9px 14px;background:#9dc5fa;color:#10161c;border:0;border-radius:4px;font:inherit;cursor:pointer}button:disabled{opacity:.55}[role=status]{margin-top:12px;font-size:12px}</style></head><body><h1>Zyra Desktop Google setup</h1><p>Paste the NEW client secret from Google Cloud. It stays on this device and is saved with OS encryption.</p><form><label for="secret">New client secret</label><input id="secret" type="password" autocomplete="off" maxlength="512" autofocus required spellcheck="false"><button type="submit">Save encrypted registration</button><p role="status">Close this window to cancel.</p></form><script>${script}</script></body></html>`
    const window = new BrowserWindow({
        width: 510, height: 350, show: false, resizable: false, autoHideMenuBar: true,
        backgroundColor: '#10161c', title: 'Zyra Google setup',
        webPreferences: {
            nodeIntegration: false, contextIsolation: true, sandbox: true,
            partition: `google-secret-prompt-${randomUUID()}`,
            preload: join(process.cwd(), 'scripts', 'helpers', 'google-desktop-secret-preload.cjs'),
            additionalArguments: [`--zyra-google-secret-channel=${channel}`]
        }
    })
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    window.webContents.on('will-navigate', event => event.preventDefault())
    const result = new Promise<GoogleDesktopSecretInput | undefined>(resolve => {
        let settled = false
        ipcMain.handle(channel, (event, value: unknown) => {
            if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || settled) return { ok: false, message: 'Setup is unavailable.' }
            try { validateGoogleDesktopClientSecret(value) }
            catch { return { ok: false, message: 'Paste the new Google client secret, then try again.' } }
            settled = true
            resolve({ secret: value as string, complete: () => { if (!window.isDestroyed()) window.close() } })
            return { ok: true }
        })
        window.once('closed', () => { ipcMain.removeHandler(channel); if (!settled) resolve(undefined) })
    })
    try {
        await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
        window.show()
        window.focus()
    }
    catch (error) {
        window.destroy()
        throw error
    }
    return result
}
