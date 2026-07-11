const disabledFeature = (feature: string) => ({
    success: false,
    error: `${feature} is disabled in Zyra`
})

export function createDisabledAdapters() {
    return {
        terminal: {
            create: () => Promise.resolve(disabledFeature('Terminal')),
            list: () => Promise.resolve({ success: true, sessions: [] }),
            kill: () => Promise.resolve(disabledFeature('Terminal')),
            write: () => Promise.resolve(disabledFeature('Terminal')),
            resize: () => Promise.resolve(disabledFeature('Terminal')),
            capabilities: () => Promise.resolve(disabledFeature('Terminal')),
            suggestions: () => Promise.resolve({ success: true, suggestions: [] }),
            banner: () => Promise.resolve({ success: true, banner: 'Zyra: terminal disabled' }),
            onOutput: () => () => { }
        },
        agentscope: {
            create: () => Promise.resolve(disabledFeature('AgentScope')),
            start: () => Promise.resolve(disabledFeature('AgentScope')),
            write: () => Promise.resolve(disabledFeature('AgentScope')),
            sendMessage: () => Promise.resolve(disabledFeature('AgentScope')),
            kill: () => Promise.resolve(disabledFeature('AgentScope')),
            remove: () => Promise.resolve(disabledFeature('AgentScope')),
            get: () => Promise.resolve(disabledFeature('AgentScope')),
            history: () => Promise.resolve({ success: true, messages: [] }),
            list: () => Promise.resolve({ success: true, sessions: [] }),
            resize: () => Promise.resolve(disabledFeature('AgentScope')),
            onSessionCreated: () => () => { },
            onSessionUpdated: () => () => { },
            onSessionClosed: () => () => { },
            onOutput: () => () => { },
            onStatusChange: () => () => { }
        }
    }
}
