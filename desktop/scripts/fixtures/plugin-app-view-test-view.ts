import { App } from '@modelcontextprotocol/ext-apps'

const app = new App({ name: 'Zyra test view', version: '1.0.0' })
const status = document.getElementById('status')!
app.ontoolresult = (result) => { status.textContent = result.content.find((entry) => entry.type === 'text')?.text || 'missing' }
document.getElementById('call')!.addEventListener('click', async () => {
    const result = await app.callServerTool({ name: 'refresh', arguments: {} })
    status.textContent = result.content.find((entry) => entry.type === 'text')?.text || 'missing'
})
void app.connect()
