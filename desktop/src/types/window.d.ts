import type { DevScopeApi } from '../shared/contracts/devscope-api'

declare global {
    interface Window {
        devscope: DevScopeApi
    }
}

export {}
