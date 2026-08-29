export type MonacoExternalValueSyncInput = {
    currentValue: string
    incomingValue: string
    readOnly: boolean
    modelPathChanged: boolean
    lastLocallyEmittedValue: string | null
}

export function shouldApplyMonacoExternalValue({
    currentValue,
    incomingValue,
    readOnly,
    modelPathChanged,
    lastLocallyEmittedValue
}: MonacoExternalValueSyncInput): boolean {
    if (currentValue === incomingValue) return false
    if (readOnly || modelPathChanged) return true
    if (lastLocallyEmittedValue !== null && currentValue === lastLocallyEmittedValue) return false
    return true
}
