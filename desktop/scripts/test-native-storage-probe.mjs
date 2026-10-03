import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('./fixtures/native-storage-backend-electron.cjs', import.meta.url), 'utf8')
async function probe(encryptionAvailable, storageBackend, decryptedValue = 'synthetic-native-storage-probe') {
    let exitCode
    const messages = []
    vm.runInNewContext(source, {
        require: name => name === 'node:assert/strict' ? assert : {
            app: {
                disableHardwareAcceleration() {}, setPath() {},
                whenReady: () => Promise.resolve(),
                quit: () => { exitCode = 0 }, exit: code => { exitCode = code }
            },
            safeStorage: {
                isEncryptionAvailable: () => encryptionAvailable,
                getSelectedStorageBackend: () => storageBackend,
                encryptString: () => Buffer.from('synthetic-ciphertext'),
                decryptString: () => decryptedValue
            }
        },
        process: { env: { ZYRA_NATIVE_TEST_STORAGE_PROFILE: '/synthetic-profile' } },
        console: { log: (...args) => messages.push(args.join(' ')), error: (...args) => messages.push(args.join(' ')) }
    })
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(messages.some(message => message.includes('synthetic-native-storage-probe')), false)
    return exitCode
}
assert.equal(await probe(false, 'basic_text'), 1, 'unavailable encryption fails closed')
assert.equal(await probe(true, 'basic_text'), 1, 'plaintext fallback cannot pass even if encryption reports available')
assert.equal(await probe(true, 'gnome_libsecret', 'wrong-value'), 1, 'native readback must match the encrypted input')
assert.equal(await probe(true, 'gnome_libsecret'), 0)
console.log('Native storage preflight: secure backend, encryption availability, readback and secret-free diagnostics passed.')
