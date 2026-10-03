import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import { useInstructorVoicePreview } from '../src/renderer/src/pages/assistant/useInstructorVoicePreview'

let setAutoplay: unknown
function VoicePreviewContract() {
    setAutoplay = useInstructorVoicePreview().setAutoplay
    return null
}

renderToStaticMarkup(<VoicePreviewContract />)
assert.equal(typeof setAutoplay, 'function', 'Voice conversation settings must be able to disable preview autoplay')
const settingsSource = readFileSync(new URL('../src/renderer/src/pages/settings/VoiceSettings.tsx', import.meta.url), 'utf8')
assert.match(settingsSource, /opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100[^"`]*transition-opacity/, 'the orb preview icon fades in only on hover or keyboard focus')
assert.match(settingsSource, /getInstructorVoiceVisualTheme\(voice\)\.primary/, 'each voice dot uses its own visual theme color')
assert.match(settingsSource, /const selected = voice === preferences\.voice[\s\S]*aria-pressed=\{selected\}/, 'voice dots retain their selected state')
console.log('Voice conversation settings preview contract: ok')
