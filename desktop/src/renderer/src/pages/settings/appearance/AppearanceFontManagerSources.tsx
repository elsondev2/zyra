import { Download, HardDrive, Monitor, RefreshCw, Search, Trash2, Upload } from 'lucide-react'
import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import { SettingsButton, SettingsInput } from '../settings-layout'
import { ManagedFontPreview } from './ManagedFontPreview'
import {
    formatFontBytes,
    getLocalFontPreviewStack,
    type FontTarget,
    type GoogleFontRow
} from './font-manager-model'

const listClass = 'min-h-0 flex-1 overflow-y-auto rounded-lg border border-[var(--settings-border)] bg-[var(--settings-section)] [scrollbar-gutter:stable]'

type ManagedFontActions = {
    target: FontTarget
    busyKey: string
    usedManagedFontIds: readonly string[]
    onUseManaged: (font: DevScopeManagedFont) => void
    onRemoveManaged: (font: DevScopeManagedFont) => void
}

function InstalledFontSample({ family, target }: { family: string; target: FontTarget }) {
    return (
        <span className="block truncate text-[12px] text-[var(--settings-text-secondary)]" style={{ fontFamily: getLocalFontPreviewStack(family) }}>
            {target === 'code' ? 'const zyra = "Aa 0123"' : 'The quick brown fox · Aa 0123'}
        </span>
    )
}

function ManagedFontRow({ font, target, busyKey, protectedFont, onUse, onRemove }: {
    font: DevScopeManagedFont
    target: FontTarget
    busyKey: string
    protectedFont: boolean
    onUse: () => void
    onRemove: () => void
}) {
    return (
        <div className="flex min-h-14 items-center gap-3 border-b border-[var(--settings-row-divider)] px-3 py-2 last:border-b-0">
            {font.source === 'imported'
                ? <Upload size={14} className="shrink-0 text-[var(--settings-text-muted)]" />
                : <HardDrive size={14} className="shrink-0 text-[var(--settings-text-muted)]" />}
            <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-[12px] font-medium">{font.family}</span>
                    <span className="shrink-0 text-[10px] text-[var(--settings-text-muted)]">{formatFontBytes(font.sizeBytes)}</span>
                </div>
                <ManagedFontPreview font={font} target={target} className="block truncate text-[11px] text-[var(--settings-text-secondary)]" />
            </div>
            <SettingsButton disabled={Boolean(busyKey)} onClick={onUse}>
                {busyKey === `use:${font.id}` ? 'Loading...' : 'Use'}
            </SettingsButton>
            <SettingsButton
                variant="ghost"
                disabled={Boolean(busyKey) || protectedFont}
                onClick={onRemove}
                aria-label={`Remove ${font.family}`}
                title={protectedFont ? 'Change this font in the current or saved custom theme before removing it' : 'Remove cached font'}
            >
                <Trash2 size={12} />
            </SettingsButton>
        </div>
    )
}

export function GoogleFontSource({
    rows,
    query,
    downloadedOnly,
    onQueryChange,
    onDownloadedOnlyChange,
    onDownload,
    ...actions
}: ManagedFontActions & {
    rows: readonly GoogleFontRow[]
    query: string
    downloadedOnly: boolean
    onQueryChange: (query: string) => void
    onDownloadedOnlyChange: (downloadedOnly: boolean) => void
    onDownload: (family: string) => void
}) {
    return (
        <>
            <div className="flex shrink-0 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--settings-text-muted)]" />
                    <SettingsInput
                        value={query}
                        onChange={event => onQueryChange(event.target.value)}
                        placeholder={downloadedOnly ? 'Search downloaded Google Fonts' : 'Search or enter an exact Google font family'}
                        className="!w-full !pl-8"
                        autoFocus
                    />
                </div>
                <SettingsButton
                    variant={downloadedOnly ? 'accent' : 'outline'}
                    aria-pressed={downloadedOnly}
                    onClick={() => onDownloadedOnlyChange(!downloadedOnly)}
                    title="Show downloaded Google Fonts only"
                >
                    <HardDrive size={12} />
                    Downloaded
                </SettingsButton>
            </div>
            <div className={listClass}>
                {rows.length === 0 ? (
                    <div className="flex h-full min-h-24 items-center justify-center px-4 text-center text-xs text-[var(--settings-text-muted)]">
                        {downloadedOnly ? 'No matching downloaded Google Fonts.' : 'No matching Google Fonts.'}
                    </div>
                ) : null}
                {rows.map(row => row.managedFont && downloadedOnly ? (
                    <ManagedFontRow
                        key={row.managedFont.id}
                        font={row.managedFont}
                        target={actions.target}
                        busyKey={actions.busyKey}
                        protectedFont={actions.usedManagedFontIds.includes(row.managedFont.id)}
                        onUse={() => actions.onUseManaged(row.managedFont!)}
                        onRemove={() => actions.onRemoveManaged(row.managedFont!)}
                    />
                ) : (
                    <div key={row.family} className="flex min-h-14 items-center gap-3 border-b border-[var(--settings-row-divider)] px-3 py-2 last:border-b-0">
                        <Download size={14} className="shrink-0 text-[var(--settings-text-muted)]" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium">{row.family}</div>
                            {row.managedFont ? (
                                <ManagedFontPreview font={row.managedFont} target={actions.target} className="block truncate text-[11px] text-[var(--settings-text-secondary)]" />
                            ) : (
                                <div className="text-[10px] text-[var(--settings-text-muted)]">{row.custom ? 'Exact Google Fonts family · Download to preview' : 'Download to preview'}</div>
                            )}
                        </div>
                        <SettingsButton
                            variant={row.managedFont ? 'outline' : 'accent'}
                            disabled={Boolean(actions.busyKey)}
                            onClick={() => row.managedFont ? actions.onUseManaged(row.managedFont) : onDownload(row.family)}
                        >
                            {actions.busyKey === `google:${row.family}` ? 'Downloading...' : row.managedFont ? 'Use' : 'Download'}
                        </SettingsButton>
                    </div>
                ))}
            </div>
        </>
    )
}

export function InstalledFontSource({
    fonts,
    hasInstalledFonts,
    hasError = false,
    query,
    target,
    busyKey,
    onQueryChange,
    onRefresh,
    onUseLocal
}: {
    fonts: readonly string[]
    hasInstalledFonts: boolean
    hasError?: boolean
    query: string
    target: FontTarget
    busyKey: string
    onQueryChange: (query: string) => void
    onRefresh: () => void
    onUseLocal: (family: string) => void
}) {
    return (
        <>
            <div className="flex shrink-0 items-center gap-2">
                <div className="relative min-w-0 flex-1">
                    <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--settings-text-muted)]" />
                    <SettingsInput value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Search installed fonts" className="!w-full !pl-8" autoFocus />
                </div>
                <SettingsButton
                    variant="ghost"
                    disabled={Boolean(busyKey)}
                    onClick={onRefresh}
                    aria-label="Refresh installed fonts"
                    title="Refresh installed fonts"
                    className="!w-8 !px-0"
                >
                    <RefreshCw size={13} className={busyKey === 'installed:scan' ? 'animate-spin motion-reduce:animate-none' : undefined} />
                </SettingsButton>
            </div>
            <div className={listClass}>
                {fonts.length === 0 ? (
                    <div className="flex h-full min-h-24 items-center justify-center px-4 text-center text-xs text-[var(--settings-text-muted)]">
                        {busyKey === 'installed:scan' ? 'Loading installed fonts...' : hasError ? 'Installed fonts unavailable.' : hasInstalledFonts ? 'No matching installed fonts.' : 'No installed fonts found.'}
                    </div>
                ) : null}
                {fonts.map(family => (
                    <div key={family} className="flex min-h-14 items-center gap-3 border-b border-[var(--settings-row-divider)] px-3 py-2 last:border-b-0">
                        <Monitor size={14} className="shrink-0 text-[var(--settings-text-muted)]" />
                        <div className="min-w-0 flex-1">
                            <div className="truncate text-[12px] font-medium">{family}</div>
                            <InstalledFontSample family={family} target={target} />
                        </div>
                        <SettingsButton disabled={Boolean(busyKey)} onClick={() => onUseLocal(family)}>Use</SettingsButton>
                    </div>
                ))}
            </div>
        </>
    )
}

export function ManualFontSource({
    importedFonts,
    manualFamily,
    onManualFamilyChange,
    onImport,
    onUseLocal,
    ...actions
}: ManagedFontActions & {
    importedFonts: readonly DevScopeManagedFont[]
    manualFamily: string
    onManualFamilyChange: (family: string) => void
    onImport: () => void
    onUseLocal: (family: string) => void
}) {
    return (
        <div className="space-y-3">
            <div className="divide-y divide-[var(--settings-row-divider)] overflow-hidden rounded-lg border border-[var(--settings-border)] bg-[var(--settings-section)]">
                <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                    <Upload size={15} className="shrink-0 text-[var(--settings-text-muted)]" />
                    <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-medium">Import a font file</div>
                        <div className="text-[10px] text-[var(--settings-text-muted)]">TTF, OTF, WOFF, or WOFF2</div>
                    </div>
                    <SettingsButton variant="accent" disabled={Boolean(actions.busyKey)} onClick={onImport}>
                        {actions.busyKey === 'manual:import' ? 'Importing...' : 'Choose file'}
                    </SettingsButton>
                </div>
                <div className="flex min-h-14 items-center gap-3 px-3 py-2.5">
                    <Monitor size={15} className="shrink-0 text-[var(--settings-text-muted)]" />
                    <label htmlFor="manual-font-family" className="shrink-0 text-[12px] font-medium">Installed family by name</label>
                    <SettingsInput
                        id="manual-font-family"
                        value={manualFamily}
                        onChange={event => onManualFamilyChange(event.target.value)}
                        onKeyDown={event => {
                            if (event.key === 'Enter' && manualFamily.trim()) onUseLocal(manualFamily)
                        }}
                        placeholder="e.g. Aptos"
                        className="!min-w-0 !flex-1"
                    />
                    <SettingsButton disabled={!manualFamily.trim() || Boolean(actions.busyKey)} onClick={() => onUseLocal(manualFamily)}>Use</SettingsButton>
                </div>
            </div>

            <section aria-labelledby="imported-fonts-heading">
                <div className="mb-1.5 flex items-center justify-between px-1">
                    <h3 id="imported-fonts-heading" className="text-[11px] font-medium text-[var(--settings-text-secondary)]">Imported fonts</h3>
                    {importedFonts.length ? <span className="text-[10px] tabular-nums text-[var(--settings-text-muted)]">{importedFonts.length}</span> : null}
                </div>
                <div className="max-h-[280px] overflow-y-auto rounded-lg border border-[var(--settings-border)] bg-[var(--settings-section)] [scrollbar-gutter:stable]">
                    {importedFonts.length === 0 ? <div className="px-3 py-4 text-center text-xs text-[var(--settings-text-muted)]">No imported fonts.</div> : null}
                    {importedFonts.map(font => (
                        <ManagedFontRow
                            key={font.id}
                            font={font}
                            target={actions.target}
                            busyKey={actions.busyKey}
                            protectedFont={actions.usedManagedFontIds.includes(font.id)}
                            onUse={() => actions.onUseManaged(font)}
                            onRemove={() => actions.onRemoveManaged(font)}
                        />
                    ))}
                </div>
            </section>
        </div>
    )
}
