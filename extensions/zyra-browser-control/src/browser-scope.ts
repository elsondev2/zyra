import { pageUrl } from './shared/safety'
import type { AppController } from './app-controller'

/** Browser sharing is explicit and lasts only for this worker's connection. */
export class BrowserScope {
  active = false
  private generation = 0
  private tail: Promise<void> = Promise.resolve()
  constructor(private controller: AppController, private changed: (error?: string) => void) {}
  disable() { this.active = false; this.generation++ }
  async enable() {
    const generation = ++this.generation
    const tabs = (await chrome.tabs.query({})).filter(tab => {
      try { pageUrl(tab.url || ''); return !tab.incognito && tab.id !== undefined } catch { return false }
    })
    if (tabs.length > 20) throw new Error('Share individual tabs when this browser has more than twenty website tabs.')
    const previous = this.controller.control.list().map(grant => ({...grant}))
    const added: number[] = []
    try {
      for (const tab of tabs) {
        if (generation !== this.generation) throw new Error('Browser sharing was cancelled.')
        await this.controller.grant(tab.id!, 'control', 'tab')
        if (!previous.some(grant => grant.tabId === tab.id)) added.push(tab.id!)
      }
      if (generation !== this.generation) throw new Error('Browser sharing was cancelled.')
      this.active = true; this.changed()
    } catch (reason) {
      for (const id of added) await this.controller.release(id).catch(() => undefined)
      if (generation === this.generation) for (const grant of previous) await this.controller.grant(grant.tabId, grant.mode, grant.scope).catch(() => undefined)
      throw reason
    }
  }
  tabCompleted(tabId: number) {
    if (!this.active) return
    const generation = this.generation
    this.tail = this.tail.then(async () => {
      if (!this.active || generation !== this.generation || this.controller.control.list().some(grant => grant.tabId === tabId)) return
      const tab = await chrome.tabs.get(tabId)
      if (tab.incognito) return
      try { pageUrl(tab.url || '') } catch { return }
      await this.controller.grant(tabId, 'control', 'tab')
      if (!this.active || generation !== this.generation) await this.controller.release(tabId)
      this.changed()
    }).catch(reason => this.changed(reason instanceof Error ? reason.message : 'Could not share a new tab.'))
    return this.tail
  }
}
