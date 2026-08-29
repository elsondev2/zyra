import { useSettings } from '@/lib/settings'
import { SettingsRow, SettingsSection, SettingsSegmented } from './settings-layout'

export function ExplorerPreferencesSections() {
    const { settings, updateSettings } = useSettings()

    return (
        <>
            <SettingsSection title="Project browser">
                <SettingsRow title="Project browser view" description="Choose the default project browser presentation." control={<SettingsSegmented value={settings.browserViewMode} options={[{ value: 'finder', label: 'Finder' }, { value: 'grid', label: 'Grid' }]} onChange={(browserViewMode) => updateSettings({ browserViewMode })} label="Project browser view" />} />
                <SettingsRow title="Project content layout" description="Display project content as an explorer tree or grouped sections." control={<SettingsSegmented value={settings.browserContentLayout} options={[{ value: 'explorer', label: 'Explorer' }, { value: 'grouped', label: 'Grouped' }]} onChange={(browserContentLayout) => updateSettings({ browserContentLayout })} label="Project content layout" />} />
            </SettingsSection>
        </>
    )
}

export default ExplorerPreferencesSections
