import type { AppearanceSettingsController } from './useAppearanceSettingsController'
import { SettingsRow, SettingsSection, SettingsSegmented, SettingsSwitch } from '../settings-layout'

export function AppearanceLayoutPage({ controller }: { controller: AppearanceSettingsController }) {
    const { settings } = controller

    return (
        <>
            <SettingsSection title="Preferences">
                <SettingsRow
                    title="Interface density"
                    description="Choose comfortable spacing or fit more information on screen."
                    control={(
                        <SettingsSegmented
                            value={settings.compactMode ? 'compact' : 'comfortable'}
                            options={[
                                { value: 'comfortable', label: 'Comfortable' },
                                { value: 'compact', label: 'Compact' }
                            ]}
                            onChange={(value) => controller.setCompactMode(value === 'compact')}
                            label="Interface density"
                        />
                    )}
                />
                <SettingsRow
                    title="Reduce motion"
                    description="Minimize transitions, animation and smooth scrolling."
                    control={<SettingsSwitch checked={settings.accessibilityReduceMotion} onCheckedChange={controller.setReduceMotion} label="Reduce motion" />}
                />
            </SettingsSection>

            <SettingsSection title="Interface">
                <SettingsRow
                    title="Chat rail"
                    description="Keep the conversation sidebar collapsed across restarts on this surface."
                    control={<SettingsSwitch checked={settings.sidebarCollapsed} onCheckedChange={controller.setSidebarCollapsed} label="Collapse chat rail" />}
                />
                {settings.sidebarCollapsed ? (<SettingsRow
                    title="Sidebar hover preview"
                    description="Temporarily show a minimized sidebar when the pointer reaches the left edge."
                    control={<SettingsSwitch checked={settings.sidebarHoverPreviewEnabled} onCheckedChange={controller.setSidebarHoverPreviewEnabled} label="Preview minimized sidebar on hover" />}
                />) : null}
                <SettingsRow
                    title="Agent Inbox sidebar"
                    description="Keep chats in creation order with compact completed rows."
                    info="Active work uses expanded cards; turn this off to return to the standard chat list."
                    control={<SettingsSwitch checked={settings.assistantAgentInboxSidebarEnabled} onCheckedChange={controller.setAgentInboxSidebarEnabled} label="Use Agent Inbox sidebar" />}
                />
            </SettingsSection>
        </>
    )
}
