import type { ControlAuditEvent, ControlElement, ControlObservation } from '../../shared/agent-control/contracts'

const sensitiveName = /pass(word|code)|secret|token|api[\s_-]?key|credit[\s_-]?card|cvv|cvc|social[\s_-]?security|one[\s_-]?time|otp/i
const sensitiveRole = /password/i
const querySecret = /^(?:access_?token|auth|authorization|code|credential|key|password|refresh_?token|secret|session|state|token)$/i

export function redactControlUrl(value: string | undefined): string | undefined {
    if (!value) return value
    try {
        const url = new URL(value)
        for (const key of [...url.searchParams.keys()]) {
            if (querySecret.test(key)) url.searchParams.set(key, '[REDACTED]')
        }
        url.hash = ''
        return url.toString()
    } catch {
        return value.slice(0, 512)
    }
}

export function redactControlElement(element: ControlElement): ControlElement {
    const sensitive = Boolean(element.sensitive || sensitiveRole.test(element.role) || sensitiveName.test(`${element.name || ''} ${element.description || ''}`))
    if (!sensitive) {
        return {
            ...element,
            name: element.name?.slice(0, 512),
            text: element.text?.slice(0, 2_048),
            value: element.value?.slice(0, 2_048),
            description: element.description?.slice(0, 512)
        }
    }
    return {
        ...element,
        sensitive: true,
        text: element.text ? '[REDACTED]' : undefined,
        value: element.value ? '[REDACTED]' : undefined,
        states: [...new Set([...(element.states || []), 'redacted'])]
    }
}

export function redactObservation(observation: ControlObservation): ControlObservation {
    const elements = observation.elements.map(redactControlElement)
    const redacted = elements.some((element) => element.sensitive)
    return {
        ...observation,
        url: redactControlUrl(observation.url),
        elements,
        redactions: [...new Set([...(observation.redactions || []), ...(redacted ? ['sensitive-control-values'] : []), 'url-query-secrets'])]
    }
}

export function redactAuditEvent(event: ControlAuditEvent): ControlAuditEvent {
    return {
        ...event,
        origin: event.origin ? redactControlUrl(event.origin) : undefined,
        message: event.message?.replace(/(password|secret|token|credential)\s*[:=]\s*\S+/gi, '$1=[REDACTED]').slice(0, 1_024),
        redactions: [...new Set([...(event.redactions || []), 'typed-text', 'url-query-secrets', 'pairing-secrets'])]
    }
}
