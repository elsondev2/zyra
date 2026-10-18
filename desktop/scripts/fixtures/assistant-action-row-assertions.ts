export function assertLeftAlignedActionRow(row: HTMLElement, label: string): void {
    const icon = row.querySelector<HTMLElement>('[data-assistant-action-summary] > :first-child')
    if (!icon) throw new Error(`${label}: normal tool row retains its icon`)
    const bounds = row.getBoundingClientRect(), style = getComputedStyle(row)
    const left = bounds.left + parseFloat(style.paddingLeft) + parseFloat(style.borderLeftWidth)
    if (!(Math.abs(icon.getBoundingClientRect().left - left) < 1)) {
        throw new Error(`${label}: normal tool rows stay left-aligned, not centered like compaction`)
    }
    if (row.scrollWidth > row.clientWidth) throw new Error(`${label}: normal tool row fits without horizontal overflow`)
}
