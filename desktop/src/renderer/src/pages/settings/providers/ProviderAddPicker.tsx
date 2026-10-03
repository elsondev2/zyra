import { useState, type ReactNode } from 'react'
import { ChevronLeft, ChevronRight, Plug } from 'lucide-react'
import { SettingsProviderIcon } from '../SettingsProviderIcon'
import { groupProviderAddChoices, type ProviderAddChoice, type ProviderAddGroupId, type ProviderAddKind } from './provider-add-options'

const rowClassName = 'group flex min-h-[68px] w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-[var(--settings-row-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-45'

function LeafIcon({ id }: { id: ProviderAddKind }) {
    if (id === 'custom') return <Plug size={16} className="shrink-0 text-[var(--settings-text-muted)]" />
    return <SettingsProviderIcon provider={id === 'openai-codex' ? 'chatgpt' : id === 'anthropic' ? 'claude' : id} />
}

function RowIcon({ children }: { children: ReactNode }) {
    return <span aria-hidden="true" className="grid h-8 w-8 shrink-0 place-items-center">{children}</span>
}

function isLeafDisabled(id: ProviderAddKind, builtInBusy: boolean) {
    return builtInBusy && (id === 'openai-codex' || id === 'openai')
}

function LeafRow({ choice, disabled, onSelect }: { choice: ProviderAddChoice; disabled: boolean; onSelect: (id: ProviderAddKind) => void }) {
    return <button type="button"
        disabled={disabled}
        onClick={() => onSelect(choice.id)}
        className={rowClassName}>
        <RowIcon><LeafIcon id={choice.id} /></RowIcon>
        <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-[var(--settings-text)]">{choice.label}</span><span className="mt-0.5 block text-[11px] leading-4 text-[var(--settings-text-secondary)]">{choice.description}</span></span>
        <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-[var(--settings-text-muted)] transition-colors group-hover:text-[var(--settings-text)]" />
    </button>
}

/** Two-level provider picker. Vendor families drill into a sub-page with a
 * horizontal fade; everything else selects directly. */
export function ProviderAddPicker({ choices, onSelect, builtInBusy = false, initialGroupId = null }: { choices: readonly ProviderAddChoice[]; onSelect: (id: ProviderAddKind) => void; builtInBusy?: boolean; initialGroupId?: ProviderAddGroupId | null }) {
    const [groupId, setGroupId] = useState<ProviderAddGroupId | null>(initialGroupId)
    const [direction, setDirection] = useState<'forward' | 'back'>('forward')
    const rows = groupProviderAddChoices(choices)
    const activeGroup = groupId ? rows.find((row): row is Extract<typeof row, { kind: 'group' }> => row.kind === 'group' && row.group.id === groupId) : null
    const openGroup = (id: ProviderAddGroupId) => { setDirection('forward'); setGroupId(id) }
    const closeGroup = () => { setDirection('back'); setGroupId(null) }
    return <div className="overflow-hidden" aria-label="Available providers">
        <div
            key={activeGroup ? `group-${activeGroup.group.id}` : 'top'}
            className={direction === 'forward' ? 'animate-provider-add-in-right' : 'animate-provider-add-in-left'}
        >
            {activeGroup ? <>
                <button key="back" type="button" onClick={closeGroup}
                    aria-label="Back to providers"
                    className="mb-1 flex h-9 w-auto items-center gap-1 rounded-md px-2 text-[12px] font-medium text-[var(--settings-text-secondary)] transition-colors hover:bg-[var(--settings-row-hover)] hover:text-[var(--settings-text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)]">
                    <ChevronLeft size={14} className="shrink-0" />{activeGroup.group.label}
                </button>
                <div className="divide-y divide-[var(--settings-row-divider)]">
                    {activeGroup.choices.map(choice => <LeafRow key={choice.id} choice={choice} disabled={isLeafDisabled(choice.id, builtInBusy)} onSelect={onSelect} />)}
                </div>
            </> : <div className="divide-y divide-[var(--settings-row-divider)]">
                {rows.map(row => row.kind === 'leaf' ? <LeafRow key={row.choice.id} choice={row.choice} disabled={isLeafDisabled(row.choice.id, builtInBusy)} onSelect={onSelect} /> : <button key={`group-${row.group.id}`} type="button"
                    disabled={row.choices.every(choice => isLeafDisabled(choice.id, builtInBusy))}
                    onClick={() => openGroup(row.group.id)}
                    aria-label={`${row.group.label} options`}
                    className={rowClassName}>
                    <RowIcon>
                        <SettingsProviderIcon provider={row.group.id === 'openai' ? 'chatgpt' : 'opencode'} />
                    </RowIcon>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-[var(--settings-text)]">{row.group.label}</span>
                        <span className="mt-0.5 block text-[11px] leading-4 text-[var(--settings-text-secondary)]">{row.group.description}</span>
                    </span>
                    <ChevronRight size={15} aria-hidden="true" className="shrink-0 text-[var(--settings-text-muted)] transition-colors group-hover:text-[var(--settings-text)]" />
                </button>)}
            </div>}
        </div>
    </div>
}
