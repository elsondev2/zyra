import { lazy, Suspense } from 'react'
import { getAppearanceManagedFontId, type AppearanceCodeFont, type AppearanceUiFont } from '@/lib/settings'
import { SettingsPageTabs } from './SettingsPageTabs'
import { SettingsPageContainer } from './settings-layout'
import { AppearanceColorsPage } from './appearance/AppearanceColorsPage'
import { AppearanceLayoutPage } from './appearance/AppearanceLayoutPage'
import { AppearanceThemePage } from './appearance/AppearanceThemePage'
import { AppearanceTypographyPage } from './appearance/AppearanceTypographyPage'
import { useAppearanceSettingsController } from './appearance/useAppearanceSettingsController'

const AppearanceFontManagerDialog = lazy(async () => ({
    default: (await import('./appearance/AppearanceFontManagerDialog')).AppearanceFontManagerDialog
}))

export type AppearanceSettingsView = 'theme' | 'typography' | 'layout' | 'colors'

const VIEW_DESCRIPTIONS: Record<AppearanceSettingsView, string> = {
    theme: 'Choose the palette Zyra uses across chats, code and settings.',
    typography: 'Choose the fonts used for interface text and code.',
    layout: 'Adjust spacing, motion and the chat rail.',
    colors: 'Edit the exact values stored in your custom theme.'
}

export default function AppearanceSettings({ view = 'theme' }: { view?: AppearanceSettingsView }) {
    const controller = useAppearanceSettingsController(view === 'typography')
    const { fontManagerTarget, settings } = controller

    const page = view === 'typography'
        ? <AppearanceTypographyPage controller={controller} />
        : view === 'layout'
            ? <AppearanceLayoutPage controller={controller} />
            : view === 'colors'
                ? <AppearanceColorsPage controller={controller} />
                : <AppearanceThemePage controller={controller} />

    return (
        <SettingsPageContainer
            title={view === 'colors' ? 'Customize colors' : 'Appearance'}
            description={VIEW_DESCRIPTIONS[view]}
            navigation={view === 'colors' ? <></> : <SettingsPageTabs family="appearance" />}
            backTo={view === 'colors' ? '/settings/app/appearance' : '/settings/app'}
            backLabel={view === 'colors' ? 'Theme' : 'App'}
            showSettingsBack={view === 'colors'}
        >
            {page}

            {fontManagerTarget ? (
                <Suspense fallback={null}>
                    <AppearanceFontManagerDialog
                        open
                        target={fontManagerTarget}
                        managedFonts={controller.managedFonts}
                        currentFont={fontManagerTarget === 'code' ? settings.appearanceCodeFont : settings.appearanceUiFont}
                        usedManagedFontIds={[
                            getAppearanceManagedFontId(settings.appearanceUiFont),
                            getAppearanceManagedFontId(settings.appearanceCodeFont),
                            settings.appearanceCustomTheme ? getAppearanceManagedFontId(settings.appearanceCustomTheme.uiFont) : null,
                            settings.appearanceCustomTheme ? getAppearanceManagedFontId(settings.appearanceCustomTheme.codeFont) : null
                        ].filter((fontId): fontId is string => Boolean(fontId))}
                        onManagedFontsChange={controller.updateManagedFonts}
                        onSelect={(font) => {
                            if (fontManagerTarget === 'code') controller.selectCodeFont(font as AppearanceCodeFont)
                            else controller.selectUiFont(font as AppearanceUiFont)
                        }}
                        onClose={() => controller.setFontManagerTarget(null)}
                    />
                </Suspense>
            ) : null}
        </SettingsPageContainer>
    )
}
