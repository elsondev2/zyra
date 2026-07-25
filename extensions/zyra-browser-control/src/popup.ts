// @ts-nocheck
const port = document.querySelector('#port')
const code = document.querySelector('#code')
const status = document.querySelector('#status')
const pair = document.querySelector('#pair')
const grant = document.querySelector('#grant')
const disconnect = document.querySelector('#disconnect')

pair.addEventListener('click', () => run(async () => {
  const loopbackGranted = await chrome.permissions.request({ origins: ['http://127.0.0.1/*'] })
  if (!loopbackGranted) throw new Error('Loopback permission is required to pair with local Zyra.')
  const result = await send({ type: 'pair', port: Number(port.value), code: code.value.trim() })
  return `Paired with Zyra (${result.pairId.slice(-8)}).`
}))
grant.addEventListener('click', () => run(async () => {
  const result = await send({ type: 'grant-active-tab' })
  return `Granted only tab ${result.tabId}.`
}))
disconnect.addEventListener('click', () => run(async () => {
  await send({ type: 'disconnect' })
  return 'Disconnected. No tab remains controllable.'
}))

void refresh()

async function refresh() {
  try {
    const result = await send({ type: 'status' })
    status.textContent = result.session ? `Paired · ${result.tabs.length} exact tab grant${result.tabs.length === 1 ? '' : 's'}` : 'Not paired'
  } catch {
    status.textContent = 'Not paired'
  }
}

async function run(operation) {
  for (const button of [pair, grant, disconnect]) button.disabled = true
  status.textContent = 'Working…'
  try { status.textContent = await operation() } catch (error) { status.textContent = error instanceof Error ? error.message : String(error) }
  finally { for (const button of [pair, grant, disconnect]) button.disabled = false }
}

function send(message) {
  return new Promise((resolve, reject) => chrome.runtime.sendMessage(message, (response) => {
    if (chrome.runtime.lastError) return reject(chrome.runtime.lastError)
    if (!response?.ok) return reject(new Error(response?.error || 'Extension request failed.'))
    resolve(response.result)
  }))
}
