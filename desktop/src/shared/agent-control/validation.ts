import {
    CONTROL_CAPABILITIES,
    type ControlAction,
    type ControlActionRequest,
    type ControlCapability,
    type ControlPrincipal
} from './contracts'
import { CONTROL_BOUNDS, isSafeControlUrl } from './policy'

const capabilitySet = new Set<string>(CONTROL_CAPABILITIES)
const sideEffectSet = new Set([
    'none', 'send-or-publish', 'purchase', 'account-change', 'security-change', 'destructive-delete',
    'file-upload', 'sensitive-data-submit', 'software-install', 'legal-acceptance'
])
const identifierPattern = /^[a-zA-Z0-9][a-zA-Z0-9:._-]{0,191}$/

export class ControlValidationError extends Error {
    readonly code = 'CONTROL_VALIDATION_ERROR'
}

function fail(message: string): never {
    throw new ControlValidationError(message)
}

export function assertControlIdentifier(value: unknown, label: string): string {
    if (typeof value !== 'string' || !identifierPattern.test(value)) fail(`${label} is invalid.`)
    return value
}

export function assertControlCapabilities(value: unknown): ControlCapability[] {
    if (!Array.isArray(value) || value.length === 0 || value.length > CONTROL_CAPABILITIES.length) {
        fail('Capabilities must be a non-empty bounded array.')
    }
    const capabilities = [...new Set(value.map((entry) => {
        if (typeof entry !== 'string' || !capabilitySet.has(entry)) fail(`Unknown control capability: ${String(entry)}`)
        return entry as ControlCapability
    }))]
    return capabilities
}

export function assertControlPrincipal(value: unknown): ControlPrincipal {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Principal is invalid.')
    const principal = value as Record<string, unknown>
    if (principal.type === 'root') {
        return {
            type: 'root',
            threadId: assertControlIdentifier(principal.threadId, 'threadId'),
            turnId: assertControlIdentifier(principal.turnId, 'turnId')
        }
    }
    if (principal.type === 'agent') {
        return {
            type: 'agent',
            fleetId: assertControlIdentifier(principal.fleetId, 'fleetId'),
            agentRunId: assertControlIdentifier(principal.agentRunId, 'agentRunId'),
            parentThreadId: assertControlIdentifier(principal.parentThreadId, 'parentThreadId')
        }
    }
    return fail('Principal type is invalid.')
}

function boundedString(value: unknown, label: string, max: number): string {
    if (typeof value !== 'string' || value.length === 0 || value.length > max) fail(`${label} is invalid.`)
    return value
}

function finiteNumber(value: unknown, label: string, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail(`${label} is invalid.`)
    return value
}

function sideEffect(value: unknown) {
    if (value === undefined) return undefined
    if (typeof value !== 'string' || !sideEffectSet.has(value)) fail('Side-effect class is invalid.')
    return value as 'none' | 'send-or-publish' | 'purchase' | 'account-change' | 'security-change' | 'destructive-delete' | 'file-upload' | 'sensitive-data-submit' | 'software-install' | 'legal-acceptance'
}

export function assertControlAction(value: unknown): ControlAction {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Action is invalid.')
    const action = value as Record<string, unknown>
    switch (action.type) {
        case 'click':
            return { type: 'click', elementRef: assertControlIdentifier(action.elementRef, 'elementRef'), ...(sideEffect(action.sideEffect) ? { sideEffect: sideEffect(action.sideEffect) } : {}) }
        case 'type':
            return {
                type: 'type',
                elementRef: assertControlIdentifier(action.elementRef, 'elementRef'),
                text: boundedString(action.text, 'text', CONTROL_BOUNDS.maxTypedTextLength),
                replace: action.replace === true,
                ...(sideEffect(action.sideEffect) ? { sideEffect: sideEffect(action.sideEffect) } : {})
            }
        case 'key':
            return {
                type: 'key',
                key: boundedString(action.key, 'key', 64),
                modifiers: Array.isArray(action.modifiers) ? action.modifiers.slice(0, 8).map((entry) => boundedString(entry, 'modifier', 24)) : undefined,
                ...(sideEffect(action.sideEffect) ? { sideEffect: sideEffect(action.sideEffect) } : {})
            }
        case 'scroll':
            return {
                type: 'scroll',
                elementRef: action.elementRef === undefined ? undefined : assertControlIdentifier(action.elementRef, 'elementRef'),
                deltaX: finiteNumber(action.deltaX, 'deltaX', -100_000, 100_000),
                deltaY: finiteNumber(action.deltaY, 'deltaY', -100_000, 100_000)
            }
        case 'select':
            if (!Array.isArray(action.values) || action.values.length === 0 || action.values.length > 32) fail('Select values are invalid.')
            return {
                type: 'select',
                elementRef: assertControlIdentifier(action.elementRef, 'elementRef'),
                values: action.values.map((entry) => boundedString(entry, 'select value', 512)),
                ...(sideEffect(action.sideEffect) ? { sideEffect: sideEffect(action.sideEffect) } : {})
            }
        case 'navigate': {
            const url = boundedString(action.url, 'url', CONTROL_BOUNDS.maxUrlLength)
            if (!isSafeControlUrl(url)) fail('Only HTTP and HTTPS navigation is allowed.')
            return { type: 'navigate', url }
        }
        case 'focus':
            return { type: 'focus' }
        case 'wait': {
            if (!action.condition || typeof action.condition !== 'object' || Array.isArray(action.condition)) fail('Wait condition is invalid.')
            const condition = action.condition as Record<string, unknown>
            const timeoutMs = finiteNumber(action.timeoutMs, 'timeoutMs', 0, CONTROL_BOUNDS.defaultActionTimeoutMs)
            if (condition.type === 'delay') return { type: 'wait', condition: { type: 'delay', durationMs: finiteNumber(condition.durationMs, 'durationMs', 0, timeoutMs) }, timeoutMs }
            if (condition.type === 'target-ready') return { type: 'wait', condition: { type: 'target-ready' }, timeoutMs }
            if (condition.type === 'url-changed') return { type: 'wait', condition: { type: 'url-changed', from: typeof condition.from === 'string' ? condition.from.slice(0, CONTROL_BOUNDS.maxUrlLength) : undefined }, timeoutMs }
            if (condition.type === 'element-absent') return { type: 'wait', condition: { type: 'element-absent', elementRef: assertControlIdentifier(condition.elementRef, 'elementRef') }, timeoutMs }
            if (condition.type === 'element-present') return { type: 'wait', condition: { type: 'element-present', name: typeof condition.name === 'string' ? condition.name.slice(0, 512) : undefined, role: typeof condition.role === 'string' ? condition.role.slice(0, 128) : undefined }, timeoutMs }
            return fail('Unknown wait condition.')
        }
        default:
            return fail(`Unknown control action: ${String(action.type)}`)
    }
}

export function assertControlActionRequest(value: unknown): ControlActionRequest {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Action request is invalid.')
    const request = value as Record<string, unknown>
    if (request.version !== 1) fail('Unsupported control protocol version.')
    return {
        version: 1,
        requestId: assertControlIdentifier(request.requestId, 'requestId'),
        grantId: assertControlIdentifier(request.grantId, 'grantId'),
        targetId: assertControlIdentifier(request.targetId, 'targetId'),
        observationRevision: finiteNumber(request.observationRevision, 'observationRevision', 1, Number.MAX_SAFE_INTEGER),
        action: assertControlAction(request.action)
    }
}

export function assertBridgeMessageSize(value: unknown): void {
    const bytes = Buffer.byteLength(JSON.stringify(value), 'utf8')
    if (bytes > CONTROL_BOUNDS.maxBridgeMessageBytes) fail('Control message exceeds the size limit.')
}
