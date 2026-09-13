import type { BrowserRecordingOverlayApi, BrowserRecordingOverlayCommand, BrowserRecordingOverlayState } from '../shared/contracts/browser-recording-overlay'

/** Serialized into the dedicated trusted overlay. Keep this function self-contained. */
export function mountBrowserRecordingOverlay(): void {
    const api = (window as unknown as { zyraRecordingOverlay: BrowserRecordingOverlayApi }).zyraRecordingOverlay
    const get = <T extends HTMLElement>(id: string) => document.getElementById(id) as T
    const root = get('recorder')
    const menu = get('menu')
    const choices = get('choices')
    const message = get('message')
    const pause = get<HTMLButtonElement>('pause')
    const microphone = get<HTMLButtonElement>('microphone')
    const audio = get<HTMLButtonElement>('audio')
    let state: BrowserRecordingOverlayState | null = null
    let opened: 'microphone' | 'audio' | null = null
    let menuAnimation: Animation | null = null
    let menuCloseTimer = 0
    let menuSignature = ''
    let reportedHeight = 0
    let stateEvents = 0
    const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const resize = () => {
        const height = Math.min(340, Math.ceil(root.offsetHeight + 16))
        if (height !== reportedHeight) { reportedHeight = height; api.resize(height) }
    }
    new ResizeObserver(resize).observe(root)
    const send = (command: BrowserRecordingOverlayCommand) => api.command(command)
    const closeMenu = (restoreFocus = true) => {
        const trigger = opened === 'microphone' ? microphone : audio
        opened = null
        microphone.setAttribute('aria-expanded', 'false')
        audio.setAttribute('aria-expanded', 'false')
        menuAnimation?.cancel()
        window.clearTimeout(menuCloseTimer)
        const finish = () => {
            window.clearTimeout(menuCloseTimer)
            if (!opened) { menu.hidden = true; resize() }
        }
        if (!menu.hidden && !reduced()) {
            menuAnimation = menu.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-4px)' }], { duration: 130, easing: 'cubic-bezier(.4,0,.2,1)' })
            menuAnimation.onfinish = finish
            // A blurred or occluded Chromium view may suspend its animation clock.
            menuCloseTimer = window.setTimeout(finish, 160)
        } else finish()
        if (restoreFocus) trigger.focus()
    }
    const renderMenu = () => {
        if (!state || !opened) return
        const isMicrophone = opened === 'microphone'
        const pending = isMicrophone ? state.microphonePending : state.audioPending
        const entries = isMicrophone
            ? [{ id: 'off', label: 'Microphone off', supported: true }, { id: '', label: 'Default microphone', supported: true }, ...state.microphones.filter(device => device.id && device.id !== 'default').map(device => ({ ...device, supported: true }))]
            : [{ id: 'off', label: 'Audio off', supported: true }, { id: 'tab', label: 'Tab audio', supported: state.tabAudioSupported }, { id: 'system', label: 'System audio', supported: state.systemAudioSupported }]
        const signature = JSON.stringify([opened, entries])
        if (signature !== menuSignature) {
            menuSignature = signature
            const fragment = document.createDocumentFragment()
            for (const entry of entries) {
                const button = document.createElement('button')
                button.type = 'button'
                button.dataset.value = entry.id
                button.dataset.supported = String(entry.supported)
                button.setAttribute('role', 'menuitemradio')
                const mark = document.createElement('span'); mark.className = 'choice-mark'; mark.textContent = '✓'; mark.setAttribute('aria-hidden', 'true')
                const label = document.createElement('span'); label.className = 'choice-label'; label.textContent = entry.label
                button.append(mark, label)
                if (!entry.supported) { const hint = document.createElement('span'); hint.className = 'hint'; hint.textContent = 'Unavailable'; button.append(hint) }
                fragment.append(button)
            }
            choices.replaceChildren(fragment)
        }
        for (const button of choices.querySelectorAll<HTMLButtonElement>('button')) {
            button.disabled = pending || button.dataset.supported !== 'true'
            button.setAttribute('aria-checked', String(button.dataset.value === (isMicrophone ? state.microphone : state.audioSource)))
        }
        get('menu-title').textContent = isMicrophone ? 'Microphone' : 'Recording audio'
        get('refresh').hidden = !isMicrophone
    }
    const openMenu = (kind: 'microphone' | 'audio') => {
        if (opened === kind) { closeMenu(); return }
        opened = kind
        window.clearTimeout(menuCloseTimer)
        menuAnimation?.cancel()
        renderMenu()
        microphone.setAttribute('aria-expanded', String(kind === 'microphone'))
        audio.setAttribute('aria-expanded', String(kind === 'audio'))
        menu.hidden = false
        resize()
        if (!reduced()) menuAnimation = menu.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 180, easing: 'cubic-bezier(.22,1,.36,1)' })
        choices.querySelector<HTMLButtonElement>('[aria-checked="true"]:not(:disabled)')?.focus()
        if (kind === 'microphone') send({ kind: 'refresh-devices' })
    }
    microphone.addEventListener('click', () => openMenu('microphone'))
    audio.addEventListener('click', () => openMenu('audio'))
    window.addEventListener('blur', () => { if (opened) closeMenu(false) })
    pause.addEventListener('click', () => { if (state) send({ kind: state.status === 'paused' ? 'resume' : 'pause' }) })
    document.addEventListener('click', event => {
        const button = (event.target as Element).closest<HTMLButtonElement>('button')
        if (!button || button.disabled) return
        if (button.parentElement === choices && opened) {
            if (opened === 'microphone') send({ kind: 'microphone', deviceId: button.dataset.value || '' })
            else send({ kind: 'audio', source: button.dataset.value as 'off' | 'tab' | 'system' })
            closeMenu()
        } else if (button.dataset.command) send({ kind: button.dataset.command } as BrowserRecordingOverlayCommand)
    })
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && opened) { event.preventDefault(); closeMenu(); return }
        if (!opened || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        event.preventDefault()
        const buttons = [...choices.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length
        buttons[next]?.focus()
    })
    const render = (next: BrowserRecordingOverlayState) => {
        state = next
        root.dataset.status = next.status
        root.title = next.title
        for (const key of ['background', 'foreground', 'muted', 'accent', 'border'] as const) document.documentElement.style.setProperty(`--${key}`, next.theme[key])
        document.documentElement.style.colorScheme = next.theme.dark ? 'dark' : 'light'
        const seconds = Math.max(0, Math.floor(next.elapsedMs / 1000))
        get('duration').textContent = seconds >= 3600 ? `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
        const active = next.status === 'recording' || next.status === 'paused'
        const terminal = next.status === 'saved' || next.status === 'error'
        pause.hidden = terminal
        pause.disabled = !active
        pause.dataset.action = next.status === 'paused' ? 'resume' : 'pause'
        pause.title = next.status === 'paused' ? 'Resume recording' : 'Pause recording'
        pause.setAttribute('aria-label', pause.title)
        get<HTMLButtonElement>('stop').disabled = !active
        get('stop').hidden = terminal
        microphone.hidden = terminal; audio.hidden = terminal
        microphone.disabled = !active || next.microphonePending
        audio.disabled = !active || next.audioPending
        microphone.dataset.selected = String(next.microphone !== 'off')
        microphone.title = next.microphonePending ? 'Connecting microphone…' : next.microphone === 'off' ? 'Microphone off' : 'Microphone on'
        microphone.setAttribute('aria-label', microphone.title)
        audio.dataset.selected = String(next.audioSource !== 'off')
        audio.title = next.audioPending ? 'Changing recording audio…' : next.audioSource === 'off' ? 'Recording audio off' : next.audioSource === 'tab' ? 'Recording tab audio' : 'Recording system audio'
        audio.setAttribute('aria-label', audio.title)
        get('dismiss').hidden = !terminal || next.unsaved
        get('saved-actions').hidden = !terminal || (!next.hasArtifact && !next.unsaved)
        get('view').hidden = !next.hasArtifact
        get('save-copy').hidden = !next.unsaved
        const text = next.error || (next.status === 'starting' ? 'Starting recording…' : next.status === 'stopping' ? 'Saving recording…' : next.status === 'saved' ? 'Recording saved' : next.status === 'paused' ? 'Recording paused' : '')
        message.hidden = !text
        message.dataset.error = String(Boolean(next.error))
        if (message.textContent !== text) message.textContent = text
        if (terminal && opened) closeMenu(false)
        else renderMenu()
        resize()
    }
    api.onState(next => { stateEvents++; render(next) })
    void api.getState().then(next => { if (next && stateEvents === 0) render(next) }).catch(() => {
        if (stateEvents) return
        message.hidden = false; message.textContent = 'Recording controls unavailable.'; resize()
    })
    resize()
}
