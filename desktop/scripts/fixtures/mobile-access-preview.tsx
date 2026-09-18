// Isolated visual QA with synthetic devices. No real device policy is changed.
import React from 'react'
import { createRoot } from 'react-dom/client'
import '../../src/renderer/src/index.css'
import { MobileConnectionSettings } from '../../src/renderer/src/pages/settings/MobileConnectionSettings'
import type { MobileAccessState, MobileAccessApi } from '../../src/shared/mobile-access'
let state: MobileAccessState = { config: { enabled: true, address: '192.168.1.10', projects: ['C:/Projects'] }, running: true, addresses: [{ name: 'Wi-Fi', address: '192.168.1.10' }, { name: 'Ethernet', address: '192.168.2.10' }], devices: [{ id: 'phone-a', name: 'My Android', createdAt: 1 }, { id: 'phone-b', name: 'Work phone', createdAt: 1 }] }
const projects = ['Website', 'Research', 'Desktop', 'Android', 'Notes', 'Website', ...Array.from({ length: 16 }, (_, i) => 'Project ' + (i + 1))].map((name, i) => ({ name, paths: ['C:/Projects/' + i + '/' + name, 'C:/Projects/' + i + '/worktree'] }))
const api: MobileAccessApi = { getState: async () => structuredClone(state), getProjects: async () => projects,
 configure: async config => { state = { ...state, config, running: config.enabled }; return structuredClone(state) },
 setDeviceAccess: async (id, access) => { state = { ...state, devices: state.devices.map(device => device.id === id ? { ...device, ...access } : device) }; return structuredClone(state) },
 revoke: async () => structuredClone(state), pair: async () => { throw Error('Pairing is disabled in the isolated visual preview.') } }
window.devscope = { mobileAccess: api } as typeof window.devscope
function Preview() { return <main style={{ overflowY: 'auto', height: '100vh', padding: '40px 20px' }}><div style={{ maxWidth: 760, margin: '0 auto' }}><p className="mb-5 text-xs text-[var(--settings-text-secondary)]">Isolated visual QA · synthetic devices and projects</p><MobileConnectionSettings /></div></main> }
createRoot(document.getElementById('root')!).render(<Preview />)
