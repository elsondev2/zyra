import assert from 'node:assert/strict'
import {
    ASSISTANT_MODEL_CATALOG_REFRESH_INTERVAL_MS,
    isAssistantModelCatalogRefreshDue
} from '../src/main/assistant/model-catalog-refresh-policy'

const now = 100_000

assert.equal(isAssistantModelCatalogRefreshDue(0, now), true)
assert.equal(isAssistantModelCatalogRefreshDue(Number.NaN, now), true)
assert.equal(isAssistantModelCatalogRefreshDue(now, now), false)
assert.equal(isAssistantModelCatalogRefreshDue(now, now + ASSISTANT_MODEL_CATALOG_REFRESH_INTERVAL_MS - 1), false)
assert.equal(isAssistantModelCatalogRefreshDue(now, now + ASSISTANT_MODEL_CATALOG_REFRESH_INTERVAL_MS), true)
assert.equal(ASSISTANT_MODEL_CATALOG_REFRESH_INTERVAL_MS, 15 * 60_000)
assert.equal(isAssistantModelCatalogRefreshDue(now, now + 59_999, true), false)
assert.equal(isAssistantModelCatalogRefreshDue(now, now + 60_000, true), true, 'failed refresh retries promptly without dropping the catalog')

console.log('Assistant model catalog refresh policy: ok')
