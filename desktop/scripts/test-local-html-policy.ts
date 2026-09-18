import assert from 'node:assert/strict'
import { buildLocalHtmlContentSecurityPolicy as policy } from '../src/main/local-html-security-policy'
const ancestors = (url?: string) => policy(url).split('; ').find(item => item.startsWith('frame-ancestors'))
assert.equal(ancestors(), 'frame-ancestors file:')
assert.equal(ancestors('http://localhost:5174/'), 'frame-ancestors file: http://localhost:5174')
assert.equal(ancestors('http://127.0.0.1:4242/app/#preview'), 'frame-ancestors file: http://127.0.0.1:4242')
assert.equal(ancestors('http://[::1]:5174/'), 'frame-ancestors file: http://[::1]:5174')
for (const value of ['https://example.test', 'http://localhost.evil.test:5174/', 'http://user:pass@localhost:5174', 'data:text/html,x', 'file:///tmp/other.html', 'http://localhost:*/', 'invalid']) assert.equal(ancestors(value), 'frame-ancestors file:')
for (const url of [undefined, 'http://localhost:5174']) {
    const result = policy(url)
    for (const directive of ['sandbox', "script-src 'none'", "connect-src 'none'", "frame-src 'none'", "object-src 'none'", "form-action 'none'"]) assert.ok(result.split('; ').includes(directive))
    assert.ok(!result.includes('*'))
}
console.log('Local HTML policy: exact dev origin, packaged ancestor, no wildcard or remote parent, passive sandbox: ok')
