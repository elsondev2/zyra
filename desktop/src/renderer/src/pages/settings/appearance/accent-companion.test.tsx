import { renderToStaticMarkup } from 'react-dom/server'
import { ACCENT_COLORS } from '@shared/preferences/accent-presets'
import { getContrastRatio } from '@/lib/settings-theme-semantics'
import { AppearanceAccentPicker } from './AppearanceAccentPicker'
import { suggestAccentCompanion } from './accent-companion'

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message)
}

assert(ACCENT_COLORS.length === 19, 'Three new presets complete the final row with the add swatch.')
for (const background of ['#080b11', '#ffffff']) {
    for (const primary of ['#ffcc00', '#330066', '#808080', '#d946ef']) {
        const companion = suggestAccentCompanion(primary, background)
        assert(/^#[0-9a-f]{6}$/.test(companion), `Companion for ${primary} is a hex color.`)
        assert(getContrastRatio(companion, background) >= 4.49, `Companion for ${primary} is legible on ${background}.`)
    }
}
const neutral = suggestAccentCompanion('#808080', '#080b11')
assert(neutral.slice(1, 3) === neutral.slice(3, 5) && neutral.slice(3, 5) === neutral.slice(5, 7), 'A neutral primary keeps a neutral companion.')

const finalPage = renderToStaticMarkup(<AppearanceAccentPicker value={ACCENT_COLORS.at(-1)!} background="#080b11" onChange={() => {}} />)
for (const label of ['Sky', 'Magenta', 'Slate', 'Copper']) {
    const swatch = finalPage.match(new RegExp(`<label[^>]*title="${label}"[^>]*class="([^"]*)"`))
    assert(swatch && !swatch[1].split(' ').includes('hidden'), `${label} is visible on the final page.`)
}
assert(finalPage.includes('Custom accent custom color picker'), 'The final slot opens the custom picker.')
console.log('Accent presets, custom slot, and contrast-aware companion: ok')
