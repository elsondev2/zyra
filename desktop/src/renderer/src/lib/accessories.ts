import type { AccessoryOpenInput } from '@shared/accessories'

export async function openAccessory(input: AccessoryOpenInput): Promise<{ success: boolean; error?: string }> {
    if (typeof window.devscope.accessories?.open !== 'function') return { success: false, error: 'Restart Zyra Desktop to open Accessories.' }
    try { return await window.devscope.accessories.open(input) }
    catch (cause) { return { success: false, error: cause instanceof Error ? cause.message : 'Could not open the accessory.' } }
}
