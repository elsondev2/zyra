import { randomUUID } from 'crypto'
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { nativeImage, type NativeImage, type WebContents } from 'electron'
import type { ControlAction, ControlElement, ControlObservation } from '../../../shared/agent-control/contracts'
import { CONTROL_BOUNDS, normalizedOrigin } from '../../../shared/agent-control/policy'
import { browserCdpKeyDescriptor, buildBrowserPointerPath } from '../browser-input'
import { AgentControlError } from '../control-errors'
import type { RegisteredControlTarget } from '../target-registry'
import type { AgentControlDriver, DriverActionContext, DriverObservationOptions } from './driver'

export const ZYRA_BROWSER_CDP_ALLOWLIST = new Set([
    'Accessibility.enable',
    'Accessibility.getFullAXTree',
    'DOM.enable',
    'DOM.getBoxModel',
    'DOM.focus',
    'Page.enable',
    'Page.captureScreenshot',
    'Page.getLayoutMetrics',
    'Page.navigate',
    'Input.dispatchMouseEvent',
    'Input.dispatchKeyEvent',
    'Input.insertText'
])

type AxNode = {
    nodeId?: string
    backendDOMNodeId?: number
    role?: { value?: unknown }
    name?: { value?: unknown }
    value?: { value?: unknown }
    description?: { value?: unknown }
    properties?: Array<{ name?: string; value?: { value?: unknown } }>
    ignored?: boolean
}

type RevisionElements = { revision: number; refs: Map<string, { backendNodeId: number; role: string }> }

export class ZyraBrowserDriver implements AgentControlDriver {
    readonly kind = 'zyra-browser' as const
    private readonly revisions = new Map<string, RevisionElements>()
    private readonly pointerByTarget = new Map<string, { x: number; y: number }>()
    private readonly inputFocusByTarget = new Set<string>()
    private readonly attached = new Set<number>()
    private readonly artifacts = new Map<string, string>()
    private lastDisconnectReason: string | undefined

    constructor(private readonly artifactDirectory: string) {}

    async observe(target: RegisteredControlTarget, options: DriverObservationOptions): Promise<ControlObservation> {
        const guest = this.getGuest(target)
        await this.ensureAttached(guest)
        const [response, metrics] = await Promise.all([
            this.command(guest, 'Accessibility.getFullAXTree', { depth: 12 }) as Promise<{ nodes?: AxNode[] }>,
            this.command(guest, 'Page.getLayoutMetrics') as Promise<{
                cssVisualViewport?: { clientWidth?: number; clientHeight?: number; scale?: number }
                cssLayoutViewport?: { clientWidth?: number; clientHeight?: number }
            }>
        ])
        const nodes = Array.isArray(response.nodes) ? response.nodes : []
        const viewport = {
            width: Math.max(1, Math.round(Number(metrics.cssVisualViewport?.clientWidth || metrics.cssLayoutViewport?.clientWidth || 1))),
            height: Math.max(1, Math.round(Number(metrics.cssVisualViewport?.clientHeight || metrics.cssLayoutViewport?.clientHeight || 1))),
            scale: Number(metrics.cssVisualViewport?.scale || 1)
        }
        const refs = new Map<string, { backendNodeId: number; role: string }>()
        const elements: ControlElement[] = []
        for (const node of nodes) {
            if (elements.length >= CONTROL_BOUNDS.maxObservationElements) break
            if (node.ignored || !Number.isInteger(node.backendDOMNodeId)) continue
            const role = stringAx(node.role?.value) || 'generic'
            const name = stringAx(node.name?.value)
            const value = stringAx(node.value?.value)
            const description = stringAx(node.description?.value)
            if (!name && !value && !isUsefulRole(role)) continue
            const elementRef = `element:${options.revision}:${elements.length + 1}`
            refs.set(elementRef, { backendNodeId: node.backendDOMNodeId!, role })
            const states = (node.properties || []).flatMap((property) => {
                const propertyValue = property.value?.value
                return propertyValue === true ? [String(property.name || '')] : []
            }).filter(Boolean).slice(0, 24)
            const sensitive = /password/i.test(role) || /pass(word|code)|secret|token|credential/i.test(`${name} ${description}`)
            elements.push({
                elementRef,
                role: role.slice(0, 128),
                name: name.slice(0, 512) || undefined,
                value: sensitive ? undefined : value.slice(0, 2_048) || undefined,
                description: description.slice(0, 512) || undefined,
                states,
                actions: actionsForRole(role),
                sensitive
            })
        }
        this.revisions.set(target.target.targetId, { revision: options.revision, refs })
        trimRevisionMap(this.revisions)

        let screenshotRef: string | undefined
        const redactions: string[] = []
        if (options.includeScreenshot) {
            const sourceImage = await this.captureRenderedPage(guest)
            const visualImage = sourceImage.resize({ width: viewport.width, height: viewport.height, quality: 'good' })
            let bytes: Buffer<ArrayBufferLike> = Buffer.alloc(0)
            for (const quality of [65, 50, 35]) {
                bytes = visualImage.toJPEG(quality)
                if (bytes.length <= CONTROL_BOUNDS.maxVisualScreenshotBytes) break
            }
            if (bytes.length > CONTROL_BOUNDS.maxVisualScreenshotBytes) {
                redactions.push('screenshot-size-limit')
            } else if (bytes.length > 0) {
                mkdirSync(this.artifactDirectory, { recursive: true })
                screenshotRef = `control-artifact:${randomUUID()}`
                const filePath = join(this.artifactDirectory, `${screenshotRef.slice('control-artifact:'.length)}.jpg`)
                writeFileSync(filePath, bytes, { mode: 0o600 })
                this.artifacts.set(screenshotRef, filePath)
                while (this.artifacts.size > 20) {
                    const oldest = this.artifacts.keys().next().value
                    if (!oldest) break
                    const oldFile = this.artifacts.get(oldest)
                    this.artifacts.delete(oldest)
                    if (oldFile) { try { unlinkSync(oldFile) } catch {} }
                }
            }
        }

        const rawUrl = guest.getURL()
        const url = rawUrl === 'about:blank' ? undefined : rawUrl
        const origin = url ? normalizedOrigin(url) || undefined : undefined
        if (target.target.kind === 'zyra-browser') target.target.origin = origin || null
        return {
            version: 1,
            observationId: `control-observation:${randomUUID()}`,
            revision: options.revision,
            targetId: target.target.targetId,
            capturedAt: new Date().toISOString(),
            targetState: guest.isLoadingMainFrame() ? 'navigating' : 'ready',
            url,
            title: guest.getTitle().slice(0, 512) || undefined,
            origin,
            viewport,
            elements,
            screenshotRef,
            truncation: nodes.length > elements.length ? { totalElements: nodes.length, returnedElements: elements.length } : undefined,
            redactions
        }
    }

    async act(target: RegisteredControlTarget, action: ControlAction, context: DriverActionContext): Promise<{ changed: boolean }> {
        const guest = this.getGuest(target)
        const targetId = target.target.targetId
        await this.ensureAttached(guest)
        if (context.signal?.aborted) throw new AgentControlError('CONTROL_CANCELLED', 'Browser action was cancelled.')
        switch (action.type) {
            case 'navigate':
                this.releaseInputFocus(target)
                await this.command(guest, 'Page.navigate', { url: action.url })
                await this.waitForReady(guest, context.signal)
                return { changed: true }
            case 'focus':
                throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Integrated Browser control never takes physical keyboard focus. Click or focus an observed page element instead.')
            case 'wait':
                await this.waitForCondition(guest, action, context)
                return { changed: false }
            case 'move': {
                const point = { x: action.x, y: action.y }
                await this.movePointer(guest, targetId, point, action.durationMs, context)
                context.updateCursor?.({ ...point, phase: 'idle', visible: true, durationMs: 0 })
                return { changed: false }
            }
            case 'click': {
                const point = action.x !== undefined && action.y !== undefined
                    ? { x: action.x, y: action.y }
                    : await this.elementPoint(guest, targetId, context.revision, action.elementRef!)
                await this.movePointer(guest, targetId, point, 180, context)
                const button = action.button || 'left'
                const clickCount = action.clickCount || 1
                await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button, clickCount })
                let completed = false
                try {
                    context.updateCursor?.({ ...point, phase: 'pressing', visible: true, durationMs: 0 })
                    await delay(70, context.signal)
                    completed = true
                } finally {
                    await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button, clickCount })
                    context.updateCursor?.({ ...point, phase: 'idle', visible: true, durationMs: 0 })
                }
                if (completed) this.inputFocusByTarget.add(targetId)
                return { changed: true }
            }
            case 'drag': {
                const from = { x: action.fromX, y: action.fromY }
                const to = { x: action.toX, y: action.toY }
                const button = action.button || 'left'
                const durationMs = Math.max(120, Math.min(2_000, action.durationMs || 420))
                await this.movePointer(guest, targetId, from, 160, context)
                const path = buildBrowserPointerPath(from, to, durationMs)
                let current = from
                let completed = false
                await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...from, button, clickCount: 1 })
                try {
                    context.updateCursor?.({ ...from, phase: 'dragging', visible: true, durationMs: 0 })
                    for (const [index, point] of path.entries()) {
                        await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button, buttons: 1 })
                        current = point
                        this.pointerByTarget.set(targetId, point)
                        context.updateCursor?.({ ...point, phase: 'dragging', visible: true, durationMs: 0 })
                        if (index < path.length - 1) await delay(durationMs / path.length, context.signal)
                    }
                    completed = true
                } finally {
                    await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...current, button, clickCount: 1 })
                    this.pointerByTarget.set(targetId, current)
                    context.updateCursor?.({ ...current, phase: 'idle', visible: true, durationMs: 0 })
                }
                if (completed) this.inputFocusByTarget.add(targetId)
                return { changed: true }
            }
            case 'type': {
                let point: { x: number; y: number } | undefined
                if (action.elementRef) {
                    point = await this.elementPoint(guest, targetId, context.revision, action.elementRef)
                    await this.movePointer(guest, targetId, point, 160, context)
                    const reference = this.element(targetId, context.revision, action.elementRef)
                    await this.command(guest, 'DOM.focus', { backendNodeId: reference.backendNodeId })
                    this.inputFocusByTarget.add(targetId)
                } else if (action.x !== undefined && action.y !== undefined) {
                    point = { x: action.x, y: action.y }
                    await this.movePointer(guest, targetId, point, 160, context)
                    await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 })
                    try {
                        context.updateCursor?.({ ...point, phase: 'pressing', visible: true, durationMs: 0 })
                        await delay(70, context.signal)
                    } finally {
                        await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
                        context.updateCursor?.({ ...point, phase: 'idle', visible: true, durationMs: 0 })
                    }
                    this.inputFocusByTarget.add(targetId)
                }
                if (!point && !this.inputFocusByTarget.has(targetId)) {
                    throw new AgentControlError('CONTROL_TARGET_BLOCKED', 'Click or focus an observed page element before sending target-local keyboard input.')
                }
                if (!action.elementRef) await this.assertFocusedTypingSafe(guest)
                context.updateCursor?.({ ...point, phase: 'typing', visible: true, durationMs: 0 })
                if (action.replace) await this.dispatchKey(guest, 'a', ['control'])
                await this.command(guest, 'Input.insertText', { text: action.text })
                context.updateCursor?.({ ...point, phase: 'idle', visible: true, durationMs: 0 })
                return { changed: true }
            }
            case 'key':
                if (!this.inputFocusByTarget.has(targetId)) {
                    throw new AgentControlError('CONTROL_TARGET_BLOCKED', 'Click or focus an observed page element before sending target-local keyboard input.')
                }
                context.updateCursor?.({ phase: 'typing', visible: true, durationMs: 0 })
                await this.dispatchKey(guest, action.key, action.modifiers)
                context.updateCursor?.({ phase: 'idle', visible: true, durationMs: 0 })
                return { changed: true }
            case 'scroll': {
                const point = action.x !== undefined && action.y !== undefined
                    ? { x: action.x, y: action.y }
                    : action.elementRef
                        ? await this.elementPoint(guest, targetId, context.revision, action.elementRef)
                        : { x: 10, y: 10 }
                await this.movePointer(guest, targetId, point, 120, context)
                await this.command(guest, 'Input.dispatchMouseEvent', {
                    type: 'mouseWheel', x: point.x, y: point.y, deltaX: action.deltaX, deltaY: action.deltaY
                })
                context.updateCursor?.({ ...point, phase: 'idle', visible: true, durationMs: 0 })
                return { changed: true }
            }
            case 'select': {
                const point = await this.elementPoint(guest, targetId, context.revision, action.elementRef)
                await this.movePointer(guest, targetId, point, 160, context)
                const reference = this.element(targetId, context.revision, action.elementRef)
                await this.command(guest, 'DOM.focus', { backendNodeId: reference.backendNodeId })
                this.inputFocusByTarget.add(targetId)
                await this.dispatchKey(guest, 'Home')
                for (const value of action.values) {
                    await this.command(guest, 'Input.insertText', { text: value })
                    await this.dispatchKey(guest, 'Enter')
                }
                context.updateCursor?.({ ...point, phase: 'idle', visible: true, durationMs: 0 })
                return { changed: true }
            }
        }
    }

    readScreenshot(screenshotRef: string) {
        const file = this.artifacts.get(screenshotRef)
        if (!file) return undefined
        try {
            const bytes = readFileSync(file)
            if (bytes.length === 0 || bytes.length > CONTROL_BOUNDS.maxVisualScreenshotBytes) return undefined
            return { data: bytes.toString('base64'), mimeType: 'image/jpeg' as const, bytes: bytes.length }
        } catch {
            return undefined
        }
    }

    releaseInputFocus(target: RegisteredControlTarget): void {
        this.inputFocusByTarget.delete(target.target.targetId)
    }

    async release(target: RegisteredControlTarget): Promise<void> {
        const guest = this.getGuest(target, false)
        this.revisions.delete(target.target.targetId)
        this.pointerByTarget.delete(target.target.targetId)
        this.releaseInputFocus(target)
        if (!guest || guest.isDestroyed() || !this.attached.has(guest.id)) return
        try {
            guest.debugger.detach()
        } catch {
            // Already detached is an expected lifecycle state.
        }
        this.attached.delete(guest.id)
    }

    async emergencyStop(): Promise<void> {
        for (const file of this.artifacts.values()) { try { unlinkSync(file) } catch {} }
        this.artifacts.clear()
        this.pointerByTarget.clear()
        this.inputFocusByTarget.clear()
        for (const targetId of this.revisions.keys()) this.revisions.delete(targetId)
        this.lastDisconnectReason = 'emergency-stop'
    }

    health() {
        return { state: this.lastDisconnectReason ? 'degraded' as const : 'ready' as const, lastDisconnectReason: this.lastDisconnectReason }
    }

    private getGuest(target: RegisteredControlTarget, required = true): WebContents {
        const guest = target.trustedIdentity as WebContents
        if (!guest || guest.isDestroyed()) {
            if (required) throw new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The Browser tab was closed.')
            return guest
        }
        return guest
    }

    private async ensureAttached(guest: WebContents): Promise<void> {
        if (guest.isDestroyed()) throw new AgentControlError('CONTROL_TARGET_NOT_FOUND', 'The Browser tab was closed.')
        if (this.attached.has(guest.id) && guest.debugger.isAttached()) return
        try {
            if (!guest.debugger.isAttached()) guest.debugger.attach('1.3')
            this.attached.add(guest.id)
            guest.debugger.once('detach', (_event, reason) => {
                this.attached.delete(guest.id)
                this.lastDisconnectReason = String(reason || 'debugger-detached')
            })
            await this.command(guest, 'Accessibility.enable')
            await this.command(guest, 'DOM.enable')
            await this.command(guest, 'Page.enable')
            this.lastDisconnectReason = undefined
        } catch (error) {
            this.attached.delete(guest.id)
            throw new AgentControlError('CONTROL_DRIVER_UNAVAILABLE', `Browser control could not attach: ${error instanceof Error ? error.message : String(error)}`, { retryable: true })
        }
    }

    private command(
        guest: WebContents,
        method: string,
        params: Record<string, unknown> = {},
        timeoutMs: number = CONTROL_BOUNDS.defaultActionTimeoutMs
    ): Promise<unknown> {
        if (!ZYRA_BROWSER_CDP_ALLOWLIST.has(method)) throw new AgentControlError('CONTROL_CAPABILITY_DENIED', `CDP command ${method} is not allowed.`)
        return withTimeout(
            guest.debugger.sendCommand(method, params),
            timeoutMs,
            `Browser command ${method} timed out.`
        )
    }

    private async captureRenderedPage(guest: WebContents): Promise<NativeImage> {
        const errors: string[] = []
        for (const fromSurface of [true, false]) {
            try {
                const screenshot = await this.command(guest, 'Page.captureScreenshot', {
                    format: 'jpeg', quality: 70, fromSurface, captureBeyondViewport: false
                }, 4_000) as { data?: string }
                const bytes = Buffer.from(String(screenshot.data || ''), 'base64')
                const image = nativeImage.createFromBuffer(bytes)
                if (!image.isEmpty()) return image
                errors.push(`CDP fromSurface=${fromSurface} returned an empty frame`)
            } catch (error) {
                errors.push(error instanceof Error ? error.message : String(error))
            }
        }

        try {
            guest.invalidate()
            await delay(50)
            const image = await withTimeout(guest.capturePage(), 4_000, 'Browser capturePage timed out.')
            if (!image.isEmpty()) return image
            errors.push('Electron capturePage returned an empty frame')
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error))
        }

        throw new AgentControlError(
            'CONTROL_TIMEOUT',
            `Browser screenshot capture failed across bounded rendered-frame paths: ${errors.slice(0, 3).join('; ')}`,
            { retryable: true }
        )
    }

    private async assertFocusedTypingSafe(guest: WebContents): Promise<void> {
        const response = await this.command(guest, 'Accessibility.getFullAXTree', { depth: 8 }) as { nodes?: AxNode[] }
        const focused = (response.nodes || []).find((node) => node.properties?.some((property) => (
            property.name === 'focused' && property.value?.value === true
        )))
        if (!focused) return
        const semantics = `${stringAx(focused.role?.value)} ${stringAx(focused.name?.value)} ${stringAx(focused.description?.value)}`
        const protectedValue = focused.properties?.some((property) => (
            /protected|password/i.test(String(property.name || '')) && property.value?.value === true
        ))
        if (protectedValue || /password|passcode|secret|token|credential/i.test(semantics)) {
            throw new AgentControlError('CONTROL_CAPABILITY_DENIED', 'Model control cannot type into the focused password or sensitive field. Pause control and enter it manually.')
        }
    }

    private element(targetId: string, revision: number, elementRef: string) {
        const current = this.revisions.get(targetId)
        if (!current || current.revision !== revision) throw new AgentControlError('CONTROL_STALE_OBSERVATION', 'Element references expired with the observation revision.', { retryable: true })
        const reference = current.refs.get(elementRef)
        if (!reference) throw new AgentControlError('CONTROL_STALE_OBSERVATION', 'The element reference is no longer valid.', { retryable: true })
        return reference
    }

    private async elementPoint(guest: WebContents, targetId: string, revision: number, elementRef: string): Promise<{ x: number; y: number }> {
        const reference = this.element(targetId, revision, elementRef)
        const response = await this.command(guest, 'DOM.getBoxModel', { backendNodeId: reference.backendNodeId }) as { model?: { content?: number[]; border?: number[] } }
        const coordinates = response.model?.content || response.model?.border
        if (!coordinates || coordinates.length < 8) throw new AgentControlError('CONTROL_TARGET_BLOCKED', 'The element has no actionable on-screen bounds.')
        const xs = coordinates.filter((_value, index) => index % 2 === 0)
        const ys = coordinates.filter((_value, index) => index % 2 === 1)
        return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
    }

    private async movePointer(
        guest: WebContents,
        targetId: string,
        point: { x: number; y: number },
        durationValue: number | undefined,
        context: DriverActionContext
    ): Promise<void> {
        const durationMs = Math.max(0, Math.min(2_000, durationValue ?? 180))
        const path = buildBrowserPointerPath(this.pointerByTarget.get(targetId), point, durationMs)
        for (const [index, current] of path.entries()) {
            await this.command(guest, 'Input.dispatchMouseEvent', { type: 'mouseMoved', ...current })
            this.pointerByTarget.set(targetId, current)
            context.updateCursor?.({ ...current, phase: 'moving', visible: true, durationMs: 0 })
            if (index < path.length - 1) await delay(durationMs / path.length, context.signal)
        }
    }

    private async dispatchKey(guest: WebContents, key: string, modifiers: string[] = []): Promise<void> {
        const modifierMask = modifiers.reduce((mask, modifier) => mask | ({ alt: 1, control: 2, ctrl: 2, meta: 4, shift: 8 }[modifier.toLowerCase()] || 0), 0)
        const descriptor = browserCdpKeyDescriptor(key)
        await this.command(guest, 'Input.dispatchKeyEvent', { type: 'keyDown', ...descriptor, modifiers: modifierMask })
        await this.command(guest, 'Input.dispatchKeyEvent', { type: 'keyUp', ...descriptor, modifiers: modifierMask })
    }

    private async waitForReady(guest: WebContents, signal?: AbortSignal): Promise<void> {
        const started = Date.now()
        while (guest.isLoadingMainFrame() && Date.now() - started < CONTROL_BOUNDS.defaultActionTimeoutMs) await delay(50, signal)
    }

    private async waitForCondition(guest: WebContents, action: Extract<ControlAction, { type: 'wait' }>, context: DriverActionContext): Promise<void> {
        if (action.condition.type === 'delay') {
            await delay(action.condition.durationMs, context.signal)
            return
        }
        const started = Date.now()
        while (Date.now() - started < action.timeoutMs) {
            if (action.condition.type === 'target-ready' && !guest.isLoadingMainFrame()) return
            if (action.condition.type === 'url-changed' && guest.getURL() !== (action.condition.from || context.previousObservation.url)) return
            await delay(75, context.signal)
        }
        throw new AgentControlError('CONTROL_TIMEOUT', 'The Browser wait condition timed out.', { retryable: true })
    }
}

function stringAx(value: unknown): string {
    if (typeof value === 'string') return value
    if (typeof value === 'number' || typeof value === 'boolean') return String(value)
    return ''
}

function isUsefulRole(role: string): boolean {
    return /button|checkbox|combobox|dialog|heading|image|link|list|menu|option|radio|search|slider|switch|tab|textbox|tree/i.test(role)
}

function actionsForRole(role: string): string[] {
    const actions: string[] = []
    if (/button|checkbox|link|menuitem|option|radio|switch|tab/i.test(role)) actions.push('click')
    if (/textbox|searchbox|combobox/i.test(role)) actions.push('type')
    if (/combobox|listbox/i.test(role)) actions.push('select')
    return actions
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => reject(new AgentControlError('CONTROL_TIMEOUT', message, { retryable: true })), timeoutMs)
        promise.then(
            (value) => {
                clearTimeout(timer)
                resolve(value)
            },
            (error) => {
                clearTimeout(timer)
                reject(error)
            }
        )
    })
}

async function delay(ms: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) throw new AgentControlError('CONTROL_CANCELLED', 'Browser action was cancelled.')
    await new Promise<void>((resolve, reject) => {
        const finish = () => {
            signal?.removeEventListener('abort', abort)
            resolve()
        }
        const timer = setTimeout(finish, Math.max(0, ms))
        const abort = () => {
            clearTimeout(timer)
            signal?.removeEventListener('abort', abort)
            reject(new AgentControlError('CONTROL_CANCELLED', 'Browser action was cancelled.'))
        }
        signal?.addEventListener('abort', abort, { once: true })
    })
}

function trimRevisionMap(map: Map<string, RevisionElements>): void {
    while (map.size > 100) map.delete(map.keys().next().value!)
}
