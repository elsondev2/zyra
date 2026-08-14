type InvokeHandler = (...args: any[]) => any

type IpcMainWithHandle = {
    handle(channel: string, handler: InvokeHandler): unknown
}

export type OnboardingIpcGateDependencies = {
    isAccessAllowed: () => boolean
    allowedBeforeOnboarding: ReadonlySet<string>
    blockedResult: () => unknown
}

/**
 * Gates every invoke handler registered through this facade. Setup handlers use
 * Electron's original ipcMain directly, while normal Desktop handlers register
 * through this proxy so newly added channels fail closed by default.
 */
export function createOnboardingGatedIpcMain<T extends IpcMainWithHandle>(
    target: T,
    dependencies: OnboardingIpcGateDependencies
): T {
    return new Proxy(target, {
        get(original, property, receiver) {
            if (property === 'handle') {
                return (channel: string, handler: InvokeHandler) => original.handle(
                    channel,
                    dependencies.allowedBeforeOnboarding.has(channel)
                        ? handler
                        : (...args: unknown[]) => dependencies.isAccessAllowed()
                            ? handler(...args)
                            : dependencies.blockedResult()
                )
            }

            const value = Reflect.get(original, property, receiver)
            return typeof value === 'function' ? value.bind(original) : value
        }
    }) as T
}
