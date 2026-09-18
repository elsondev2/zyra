import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import { AssistantTuiPresenceIndicator } from '../src/renderer/src/pages/assistant/AssistantTuiPresenceIndicator'

const markup = renderToStaticMarkup(<>
    <AssistantTuiPresenceIndicator compact focusable={false} />
    <AssistantTuiPresenceIndicator compact focusable={false} mobileDevices={['My phone', 'Travel phone']} />
</>)
assert.equal((markup.match(/role="status"/g) || []).length, 2)
assert.ok(markup.includes('data-tui-presence="open"'))
assert.ok(markup.includes('data-mobile-presence="open"'))
assert.ok(markup.includes('lucide-smartphone'))
assert.ok(markup.includes('lucide-square-terminal'))
assert.ok(markup.includes('aria-label="Open on My phone, Travel phone"'))
assert.ok(!markup.includes('tabindex'), 'nested row indicators do not add competing keyboard stops')
const focusable = renderToStaticMarkup(<AssistantTuiPresenceIndicator mobileDevices={['<Phone & tablet>']} />)
assert.ok(focusable.includes('tabindex="0"'), 'header indicators are keyboard accessible')
assert.ok(focusable.includes('&lt;Phone &amp; tablet&gt;'), 'device labels render as text')
console.log('Mobile and terminal presence render together with accessible labels: passed')
