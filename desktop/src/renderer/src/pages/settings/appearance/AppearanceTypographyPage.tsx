import { UiTypographySample, CodeTypographySample } from './TypographySamples'
import {
    APPEARANCE_CODE_FONTS,
    APPEARANCE_UI_FONTS,
    getAppearanceCodeFontStack,
    getAppearanceUiFontStack,
    type AppearanceCodeFont,
    type AppearanceUiFont
} from '@/lib/settings'
import type { AppearanceSettingsController } from './useAppearanceSettingsController'
import { SettingsNotice, SettingsRow, SettingsSection, SettingsSelect } from '../settings-layout'
import { createSettingsRowTargetId } from '../settings-search'

function UiFontSelect({ controller }: { controller: AppearanceSettingsController }) {
    const font = controller.settings.appearanceUiFont
    return (
        <SettingsSelect
            value={font}
            onChange={(event) => {
                if (event.target.value === '__more_fonts__') controller.setFontManagerTarget('ui')
                else controller.selectUiFont(event.target.value as AppearanceUiFont)
            }}
            aria-label="UI font"
            className="!w-[190px] !min-w-[190px]"
            style={{ fontFamily: getAppearanceUiFontStack(font) }}
        >
            {!APPEARANCE_UI_FONTS.some((entry) => entry.id === font) ? <option value={font}>{controller.resolveFontLabel(font)}</option> : null}
            {APPEARANCE_UI_FONTS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            <option disabled>──────────</option>
            <option value="__more_fonts__">Browse more fonts...</option>
        </SettingsSelect>
    )
}

function CodeFontSelect({ controller }: { controller: AppearanceSettingsController }) {
    const font = controller.settings.appearanceCodeFont
    return (
        <SettingsSelect
            value={font}
            onChange={(event) => {
                if (event.target.value === '__more_fonts__') controller.setFontManagerTarget('code')
                else controller.selectCodeFont(event.target.value as AppearanceCodeFont)
            }}
            aria-label="Code font"
            className="!w-[190px] !min-w-[190px]"
            style={{ fontFamily: getAppearanceCodeFontStack(font) }}
        >
            {!APPEARANCE_CODE_FONTS.some((entry) => entry.id === font) ? <option value={font}>{controller.resolveFontLabel(font)}</option> : null}
            {APPEARANCE_CODE_FONTS.map((entry) => <option key={entry.id} value={entry.id}>{entry.label}</option>)}
            <option disabled>──────────</option>
            <option value="__more_fonts__">Browse more fonts...</option>
        </SettingsSelect>
    )
}

export function AppearanceTypographyPage({ controller }: { controller: AppearanceSettingsController }) {
    const { settings } = controller

    return (
        <SettingsSection title="Typography" searchSection="Theme">
            <SettingsRow
                title="UI font"
                description="Set the typeface used for navigation, messages and settings."
                control={<UiFontSelect controller={controller} />}
                searchTargetId={createSettingsRowTargetId('Theme', 'UI font')}
            >
                <UiTypographySample fontFamily={getAppearanceUiFontStack(settings.appearanceUiFont)} />
            </SettingsRow>

            <SettingsRow
                title="Code font"
                description="Set the monospace typeface used for code, diffs and terminals."
                control={<CodeFontSelect controller={controller} />}
                searchTargetId={createSettingsRowTargetId('Theme', 'Code font')}
            >
                <CodeTypographySample fontFamily={getAppearanceCodeFontStack(settings.appearanceCodeFont)} />
            </SettingsRow>

            {controller.managedFontsError ? (
                <SettingsNotice tone="error">{controller.managedFontsError}</SettingsNotice>
            ) : null}
        </SettingsSection>
    )
}
