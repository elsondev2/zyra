import { Globe2, Monitor, Upload } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { DevScopeManagedFont } from '@shared/contracts/font-contracts'
import {
    createAppearanceLocalFont,
    createAppearanceManagedFont,
    DEFAULT_APPEARANCE_UI_FONT,
    getAppearanceManagedFontId,
    type AppearanceCodeFont,
    type AppearanceUiFont
} from '@/lib/settings'
import { ensureAppearanceFontLoaded, forgetAppearanceManagedFont } from '@/lib/appearance-font-runtime'
import { SettingsDialog, SettingsNotice, SettingsSegmented } from '../settings-layout'
import { GoogleFontSource, InstalledFontSource, ManualFontSource } from './AppearanceFontManagerSources'
import {
    buildGoogleFontRows,
    filterInstalledFonts,
    getImportedFonts,
    shouldLoadInstalledFonts,
    type FontManagerSource,
    type FontTarget
} from './font-manager-model'

type FontSelection = AppearanceUiFont | AppearanceCodeFont

export function AppearanceFontManagerDialog({
    open,
    target,
    managedFonts,
    currentFont,
    usedManagedFontIds,
    onManagedFontsChange,
    onSelect,
    onClose
}: {
    open: boolean
    target: FontTarget
    managedFonts: DevScopeManagedFont[]
    currentFont: FontSelection
    usedManagedFontIds: string[]
    onManagedFontsChange: (fonts: DevScopeManagedFont[]) => void
    onSelect: (font: FontSelection) => void
    onClose: () => void
}) {
    const [source, setSource] = useState<FontManagerSource>('google')
    const [query, setQuery] = useState('')
    const [downloadedOnly, setDownloadedOnly] = useState(false)
    const [manualFamily, setManualFamily] = useState('')
    const [installedFonts, setInstalledFonts] = useState<string[]>([])
    const [busyKey, setBusyKey] = useState('')
    const [status, setStatus] = useState<{ tone: 'neutral' | 'error' | 'success'; message: string } | null>(null)
    const openRef = useRef(open)
    const sourceRef = useRef(source)
    const installedSourceActiveRef = useRef(false)
    const operationGenerationRef = useRef(0)
    openRef.current = open
    sourceRef.current = source
    useEffect(() => {
        openRef.current = open
        return () => { openRef.current = false; operationGenerationRef.current += 1 }
    }, [open])

    const closeDialog = () => {
        operationGenerationRef.current += 1
        openRef.current = false
        setStatus(null)
        setBusyKey('')
        onClose()
    }

    const googleRows = useMemo(
        () => buildGoogleFontRows(query, downloadedOnly, managedFonts),
        [downloadedOnly, managedFonts, query]
    )
    const importedFonts = useMemo(() => getImportedFonts(managedFonts), [managedFonts])
    const visibleInstalledFonts = useMemo(
        () => filterInstalledFonts(installedFonts, query),
        [installedFonts, query]
    )

    const selectManagedFont = async (font: DevScopeManagedFont) => {
        const operationGeneration = operationGenerationRef.current
        const selection = createAppearanceManagedFont(font.id)
        setBusyKey(`use:${font.id}`)
        try {
            await ensureAppearanceFontLoaded(selection)
            if (!openRef.current || operationGeneration !== operationGenerationRef.current) return
            onSelect(selection)
            closeDialog()
        } catch (error) {
            if (openRef.current) setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to load the font.' })
        } finally {
            if (operationGeneration === operationGenerationRef.current) setBusyKey('')
        }
    }

    const downloadGoogle = async (family: string) => {
        const operationGeneration = operationGenerationRef.current
        setBusyKey(`google:${family}`)
        setStatus({ tone: 'neutral', message: `Downloading ${family} into Zyra's local font cache...` })
        try {
            const result = await window.devscope.fonts.downloadGoogle(family)
            if (!result.success) throw new Error(result.error)
            const nextFonts = [...managedFonts.filter(font => font.id !== result.font.id), result.font]
                .sort((left, right) => left.family.localeCompare(right.family))
            onManagedFontsChange(nextFonts)
            if (openRef.current && operationGeneration === operationGenerationRef.current) setStatus(null)
        } catch (error) {
            if (openRef.current) setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to download the Google Font.' })
        } finally {
            if (operationGeneration === operationGenerationRef.current) setBusyKey('')
        }
    }

    const scanInstalledFonts = useCallback(async () => {
        const operationGeneration = operationGenerationRef.current
        setBusyKey('installed:scan')
        setStatus(null)
        try {
            const result = await window.devscope.fonts.listSystem()
            if (!result.success) throw new Error(result.error)
            if (!openRef.current || operationGeneration !== operationGenerationRef.current || sourceRef.current !== 'installed') return
            setInstalledFonts(result.fonts)
        } catch (error) {
            if (openRef.current && sourceRef.current === 'installed') {
                setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Zyra could not read installed fonts.' })
            }
        } finally {
            if (operationGeneration === operationGenerationRef.current) setBusyKey('')
        }
    }, [])

    useEffect(() => {
        const installedSourceActive = open && source === 'installed'
        if (shouldLoadInstalledFonts(open, source, installedSourceActiveRef.current)) void scanInstalledFonts()
        installedSourceActiveRef.current = installedSourceActive
    }, [open, scanInstalledFonts, source])

    const importFont = async () => {
        const operationGeneration = operationGenerationRef.current
        setBusyKey('manual:import')
        setStatus(null)
        try {
            const result = await window.devscope.fonts.importFile()
            if (!result.success) throw new Error(result.error)
            if (result.cancelled || !result.font) return
            const nextFonts = [...managedFonts.filter(font => font.id !== result.font?.id), result.font]
                .sort((left, right) => left.family.localeCompare(right.family))
            onManagedFontsChange(nextFonts)
            if (openRef.current && operationGeneration === operationGenerationRef.current) setStatus(null)
        } catch (error) {
            if (openRef.current) setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to import the font.' })
        } finally {
            if (operationGeneration === operationGenerationRef.current) setBusyKey('')
        }
    }

    const removeFont = async (font: DevScopeManagedFont) => {
        if (usedManagedFontIds.includes(font.id)) {
            setStatus({ tone: 'error', message: 'Change this font in the current or saved custom theme before removing it.' })
            return
        }
        const operationGeneration = operationGenerationRef.current
        setBusyKey(`remove:${font.id}`)
        try {
            const result = await window.devscope.fonts.removeManaged(font.id)
            if (!result.success) throw new Error(result.error)
            forgetAppearanceManagedFont(font.id)
            onManagedFontsChange(managedFonts.filter(entry => entry.id !== font.id))
            if (getAppearanceManagedFontId(currentFont) === font.id) onSelect(target === 'code' ? 'system-mono' : DEFAULT_APPEARANCE_UI_FONT)
            if (openRef.current) setStatus({ tone: 'success', message: `${font.family} was removed from Zyra's font cache.` })
        } catch (error) {
            if (openRef.current) setStatus({ tone: 'error', message: error instanceof Error ? error.message : 'Failed to remove the font.' })
        } finally {
            if (operationGeneration === operationGenerationRef.current) setBusyKey('')
        }
    }

    const useLocalFamily = (family: string) => {
        const normalized = family.trim()
        if (!normalized) return
        onSelect(createAppearanceLocalFont(normalized))
        closeDialog()
    }

    const changeSource = (nextSource: FontManagerSource) => {
        sourceRef.current = nextSource
        setSource(nextSource)
        setQuery('')
        setStatus(null)
    }

    const managedFontActions = {
        target,
        busyKey,
        usedManagedFontIds,
        onUseManaged: (font: DevScopeManagedFont) => void selectManagedFont(font),
        onRemoveManaged: (font: DevScopeManagedFont) => void removeFont(font)
    }
    const sourceControl = (
        <div className="w-[180px]">
            <SettingsSegmented<FontManagerSource>
                value={source}
                options={[
                    { value: 'google', label: 'Google Fonts', icon: <Globe2 size={13} /> },
                    { value: 'installed', label: 'Installed', icon: <Monitor size={13} /> },
                    { value: 'manual', label: 'Manual', icon: <Upload size={13} /> }
                ]}
                onChange={changeSource}
                label="Font source"
                disabled={Boolean(busyKey)}
            />
        </div>
    )

    return (
        <SettingsDialog
            open={open}
            title={target === 'code' ? 'Choose a code font' : 'Choose a UI font'}
            description="Download or import a font to preview it, then choose Use to apply it."
            descriptionMode="info"
            headerAction={sourceControl}
            onClose={closeDialog}
            className="flex h-[640px] max-h-[calc(100vh-40px)] !max-w-[700px] flex-col"
            contentClassName="flex min-h-0 flex-1 flex-col !space-y-0 gap-3 overflow-y-auto"
        >
            {source === 'google' ? (
                <GoogleFontSource
                    {...managedFontActions}
                    rows={googleRows}
                    query={query}
                    downloadedOnly={downloadedOnly}
                    onQueryChange={setQuery}
                    onDownloadedOnlyChange={value => {
                        setDownloadedOnly(value)
                        setStatus(null)
                    }}
                    onDownload={family => void downloadGoogle(family)}
                />
            ) : null}
            {source === 'installed' ? (
                <InstalledFontSource
                    fonts={visibleInstalledFonts}
                    hasInstalledFonts={installedFonts.length > 0}
                    hasError={status?.tone === 'error'}
                    query={query}
                    target={target}
                    busyKey={busyKey || (!installedSourceActiveRef.current ? 'installed:scan' : '')}
                    onQueryChange={setQuery}
                    onRefresh={() => void scanInstalledFonts()}
                    onUseLocal={useLocalFamily}
                />
            ) : null}
            {source === 'manual' ? (
                <ManualFontSource
                    {...managedFontActions}
                    importedFonts={importedFonts}
                    manualFamily={manualFamily}
                    onManualFamilyChange={setManualFamily}
                    onImport={() => void importFont()}
                    onUseLocal={useLocalFamily}
                />
            ) : null}
            {status ? <SettingsNotice tone={status.tone} className="shrink-0">{status.message}</SettingsNotice> : null}
        </SettingsDialog>
    )
}
