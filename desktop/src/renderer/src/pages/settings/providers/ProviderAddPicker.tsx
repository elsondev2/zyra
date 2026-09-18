import { ChevronRight, Plug } from 'lucide-react'
import { SettingsProviderIcon } from '../SettingsProviderIcon'
import type { ProviderAddChoice, ProviderAddKind } from './provider-add-options'

export function ProviderAddPicker({ choices, onSelect, builtInBusy = false }: { choices: readonly ProviderAddChoice[]; onSelect: (id: ProviderAddKind) => void; builtInBusy?: boolean }) {
    return <div className="divide-y divide-[var(--settings-border)]" aria-label="Available providers">
        {choices.map(choice => <button key={choice.id} type="button"
            disabled={builtInBusy && (choice.id === 'openai-codex' || choice.id === 'openai')}
            onClick={() => onSelect(choice.id)}
            className="flex min-h-14 w-full items-center gap-3 rounded-md px-2 py-3 text-left transition-colors hover:bg-[var(--settings-row-hover)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-45">
            {choice.id === 'custom' || choice.id === 'opencode' ? <Plug size={16} className="shrink-0 text-[var(--settings-text-muted)]" /> : <SettingsProviderIcon provider={choice.id === 'openai-codex' ? 'chatgpt' : choice.id === 'anthropic' ? 'claude' : choice.id} />}
            <span className="min-w-0 flex-1"><span className="block text-[13px] font-medium text-[var(--settings-text)]">{choice.label}</span><span className="mt-0.5 block text-[11px] text-[var(--settings-text-secondary)]">{choice.description}</span></span>
            <ChevronRight size={14} className="shrink-0 text-[var(--settings-text-muted)]" />
        </button>)}
    </div>
}
