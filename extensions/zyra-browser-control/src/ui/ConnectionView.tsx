import { useState } from 'react';
import { Cable, ChevronDown, Unplug, Check } from 'lucide-react';
import type { ExtensionState } from '../shared/protocol';
export type Action = (type: string, params?: Record<string, unknown>) => Promise<boolean>;
export function ConnectionView({ state, action, busy, onConnected }: { state: ExtensionState; action: Action; busy: string; onConnected?: () => void }) {
  const [port, setPort] = useState(state.port ? String(state.port) : ''), [code, setCode] = useState('');
  const valid = /^\d{8}$/.test(code.replace(/[\s-]/g, '')) && Number(port) >= 1 && Number(port) <= 65535;
  return <div className="connection-view"><h2>{state.connected ? 'Browser sharing connection' : 'Connect to Zyra'}</h2>
    {state.connected ? <><div className="connected-summary"><div className="connected-icon"><Check size={19} /></div><div><strong>Browser sharing connected</strong><p>{state.installation?.label || (state.clientOrigin ? `Desktop service: ${state.clientOrigin}` : 'On this device')}</p></div></div><div className="connection-count"><span>Shared tabs</span><strong>{state.grants.length}</strong></div><p className="footnote connection-note">Only tabs you share are available to Zyra. This shows browser sharing, not whether a Zyra chat or agent is running.</p><button className="secondary" disabled={!!busy} onClick={() => action('disconnect')}><Unplug size={14} />Disconnect browser</button></> : <>
      <p className="muted connection-intro">{state.connecting ? 'Checking the browser connection with Zyra Desktop…' : 'Open Zyra Desktop. This browser connects automatically.'}</p>
      <button className="primary" disabled={!!busy || state.connecting} onClick={async () => { if (await action('auto-connect')) onConnected?.() }}><Cable size={14}/>{state.connecting ? 'Connecting…' : 'Connect to Zyra'}</button>
      <details className="help"><summary>Connect to an older Zyra app<ChevronDown size={13}/></summary>
      <form onSubmit={async e => { e.preventDefault(); if (valid && await action('connect', { port: Number(port), code })) { setCode(''); onConnected?.(); } }}>
        <label htmlFor="pairing-code">Pairing code</label><input id="pairing-code" inputMode="numeric" autoComplete="off" value={code} maxLength={11} onChange={e => setCode(e.target.value)} required/>
        <label htmlFor="bridge-port">Port</label><input id="bridge-port" type="number" min="1" max="65535" value={port} onChange={e => setPort(e.target.value)} required/>
        <button className="primary" disabled={!valid || !!busy}>Connect</button>
      </form></details>
      <details className="help"><summary>How sharing works<ChevronDown size={13} /></summary><p>Click the extension icon to chat beside a tab, or ask a Desktop chat to use this Chrome browser. You can also select Read or Control for individual tabs here. Keep Zyra Desktop open while connected.</p></details>
    </>}
  </div>;
}
