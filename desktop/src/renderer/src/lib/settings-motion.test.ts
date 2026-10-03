import assert from 'node:assert/strict'
import { resolveAppearanceMotionRate } from './settings-motion'

assert.equal(resolveAppearanceMotionRate('calm', 100), 0.65)
assert.equal(resolveAppearanceMotionRate('normal', 100), 1)
assert.equal(resolveAppearanceMotionRate('brisk', 100), 1.5)
assert.equal(resolveAppearanceMotionRate('custom', 125), 1.25)
assert.equal(resolveAppearanceMotionRate('custom', 20), 0.5)
assert.equal(resolveAppearanceMotionRate('custom', 240), 2)

console.log('Appearance motion rates: presets and custom bounds: ok')
