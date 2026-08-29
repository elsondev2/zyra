import assert from 'node:assert/strict'
import {
    fetchGoogleBrowserSearchSuggestions,
    isEligibleGoogleBrowserSuggestionQuery
} from '../src/main/browser-new-tab-service'

assert.equal(isEligibleGoogleBrowserSuggestionQuery('react performance'), true)
assert.equal(isEligibleGoogleBrowserSuggestionQuery('https://example.com/private'), false)
assert.equal(isEligibleGoogleBrowserSuggestionQuery('localhost:5173'), false)
assert.equal(isEligibleGoogleBrowserSuggestionQuery('example.com/docs'), false)
for (const query of ['access_token=secret', 'api_key=secret', 'token=secret', 'secret=value', 'session_token=secret', 'client_secret=secret', 'credential=secret', 'x-amz-signature=secret', 'private_key=secret', 'access_key_id=secret', 'aws_access_key_id=secret']) {
    assert.equal(isEligibleGoogleBrowserSuggestionQuery(query), false, `${query} must never be sent to Google suggestions`)
}

const originalFetch = globalThis.fetch
const requestedUrls: string[] = []
globalThis.fetch = (async (input: string | URL | Request) => {
    const url = String(input)
    requestedUrls.push(url)
    if (url.startsWith('https://suggestqueries.google.com/')) {
        return new Response(JSON.stringify(['zyra browser', ['zyra browser', 'zyra browser history', 'zyra browser app']]), {
            status: 200,
            headers: { 'content-type': 'application/json' }
        })
    }
    throw new Error(`Unexpected URL: ${url}`)
}) as typeof fetch

try {
    assert.deepEqual(await fetchGoogleBrowserSearchSuggestions('zyra browser'), [
        'zyra browser',
        'zyra browser history',
        'zyra browser app'
    ])
    assert.equal(requestedUrls.some((url) => url.includes('client=firefox') && url.includes('q=zyra+browser')), true)
    console.log('Browser New Tab remote services: ok')
} finally {
    globalThis.fetch = originalFetch
}
