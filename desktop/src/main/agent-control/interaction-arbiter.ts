import type { ControlInteractionCategory, ControlInteractionEvent, ControlStageIntent } from '../../shared/agent-control/contracts'

const WINDOW_MS = 2_000
const MAX_EVENTS_PER_TARGET = 48

export type InteractionDecision = {
    disposition: 'continue' | 'adapt' | 'pause'
    evidence: ControlInteractionEvent[]
    reason?: string
}

export class TargetInteractionArbiter {
    private sequence = 0
    private readonly eventsByTarget = new Map<string, ControlInteractionEvent[]>()

    record(targetId: string, category: ControlInteractionCategory, inputType: string, stageId?: string, point?: { x: number; y: number }): ControlInteractionEvent {
        const event: ControlInteractionEvent = {
            sequence: ++this.sequence,
            actor: 'user',
            targetId,
            category,
            inputType: boundedInputType(inputType),
            ...(point ? { x: point.x, y: point.y } : {}),
            stageId,
            occurredAt: new Date().toISOString()
        }
        const events = this.eventsByTarget.get(targetId) || []
        const previous = events.at(-1)
        if (previous?.category === category && Date.now() - Date.parse(previous.occurredAt) < 80) return previous
        events.push(event)
        this.eventsByTarget.set(targetId, events.slice(-MAX_EVENTS_PER_TARGET))
        this.prune(targetId)
        return event
    }

    checkpoint(targetId: string): number {
        return this.eventsByTarget.get(targetId)?.at(-1)?.sequence || 0
    }

    decide(targetId: string, afterSequence: number, stage?: ControlStageIntent): InteractionDecision {
        this.prune(targetId)
        const evidence = (this.eventsByTarget.get(targetId) || []).filter((event) => event.sequence > afterSequence)
        const purposeful = evidence.filter((event) => event.category !== 'pointer-move')
        const divergent = stage ? purposeful.filter((event) => !matchesStageIntent(event, stage)) : purposeful
        if (divergent.length >= 2) {
            return {
                disposition: 'pause',
                evidence: divergent,
                reason: `Detected ${divergent.length} purposeful interactions outside the active target-local stage intent.`
            }
        }
        if (purposeful.length > 0) {
            return {
                disposition: 'adapt',
                evidence: purposeful,
                reason: divergent.length
                    ? 'Detected one possibly divergent target-local interaction; the stage will reobserve before more work.'
                    : 'Detected target-local collaboration matching the stage; the stage will reobserve before more work.'
            }
        }
        return { disposition: 'continue', evidence }
    }

    clear(targetId?: string): void {
        if (targetId) this.eventsByTarget.delete(targetId)
        else this.eventsByTarget.clear()
    }

    private prune(targetId: string): void {
        const cutoff = Date.now() - WINDOW_MS
        const events = (this.eventsByTarget.get(targetId) || []).filter((event) => Date.parse(event.occurredAt) >= cutoff)
        if (events.length) this.eventsByTarget.set(targetId, events)
        else this.eventsByTarget.delete(targetId)
    }
}

export function controlInteractionCategory(inputType: string): ControlInteractionCategory | null {
    if (/^(mouseMove|mouseEnter|mouseLeave|pointerMove|pointerRawUpdate)$/.test(inputType)) return 'pointer-move'
    if (/^(mouseDown|contextMenu|pointerDown|touchStart|gestureTap|gestureDoubleTap|gestureLongPress)/.test(inputType)) return 'pointer-action'
    if (/^(mouseWheel|gestureScroll|touchScroll)/.test(inputType)) return 'scroll'
    if (/^(rawKeyDown|keyDown)$/.test(inputType)) return 'keyboard'
    if (/^(gesturePinch|touchMove)/.test(inputType)) return 'gesture'
    return null
}

function matchesStageIntent(event: ControlInteractionEvent, stage: ControlStageIntent): boolean {
    const activity = event.category === 'keyboard'
        ? 'keyboard'
        : event.category === 'scroll'
            ? 'scroll'
            : event.category === 'pointer-action' || event.category === 'pointer-move'
                ? 'pointer'
                : 'mixed'
    if (stage.expectedActivity !== 'mixed' && activity !== stage.expectedActivity) return false
    if (!stage.expectedRegion || event.x === undefined || event.y === undefined) return true
    const region = stage.expectedRegion
    return event.x >= region.x && event.y >= region.y
        && event.x <= region.x + region.width && event.y <= region.y + region.height
}

function boundedInputType(value: string): string {
    return String(value || 'unknown').slice(0, 64)
}
