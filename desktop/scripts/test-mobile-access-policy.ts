import assert from 'node:assert/strict'
import { preferredMobileAddress, mobileAccessError, mobilePairingCompleted } from '../src/shared/mobile-access-policy'
const addresses = [{name:'vEthernet (WSL)',address:'172.20.1.1'},{name:'Ethernet',address:'192.168.2.2'},{name:'Wi-Fi',address:'192.168.1.2'}]
assert.equal(preferredMobileAddress(addresses), '192.168.1.2')
assert.equal(preferredMobileAddress(addresses,'192.168.2.2'), '192.168.2.2')
assert.equal(preferredMobileAddress(addresses,'192.168.8.9'), '192.168.1.2')
assert.equal(preferredMobileAddress([]), '')
assert.equal(mobileAccessError(new Error("Error invoking remote method 'zyra:mobile-access': Error: Connect to Wi-Fi.")), 'Connect to Wi-Fi.')
assert.equal(mobileAccessError(new Error('Pairing expired.')), 'Pairing expired.')
console.log('Mobile network selection and user-facing errors passed')

const phone = { id: 'phone', name: 'Phone', createdAt: 1, lastPairedAt: 2 }
assert.equal(mobilePairingCompleted([phone], [phone]), false)
assert.equal(mobilePairingCompleted([phone], [{ ...phone, lastPairedAt: 3 }]), true)
assert.equal(mobilePairingCompleted([phone], [{ ...phone, id: 'another' }]), true)
assert.equal(mobilePairingCompleted([phone], [{ ...phone, connected: true }]), false)
