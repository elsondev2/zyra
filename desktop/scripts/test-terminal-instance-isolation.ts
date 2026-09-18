import assert from 'node:assert/strict'
import { mock } from 'bun:test'

mock.module('electron', () => ({ app: { isPackaged: false, getPath() { throw new Error('Development must not touch the global launcher') } } }))
const { installTerminalCommand, removeTerminalCommand } = await import('../src/main/terminal-command-service')
await assert.rejects(installTerminalCommand(), /installed app, not a development instance/)
await assert.rejects(removeTerminalCommand(), /installed app, not a development instance/)
console.log('Development instances cannot replace or remove the installed global terminal command: ok')
