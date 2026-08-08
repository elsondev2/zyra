import {
    createContext,
    useCallback,
    useContext,
    useLayoutEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode
} from 'react'

type AssistantTitleBarRegistration = {
    owner: symbol
    content: ReactNode
}

type AssistantTitleBarEndRegistration = AssistantTitleBarRegistration & {
    open: boolean
}

type AssistantTitleBarContextValue = {
    content: ReactNode
    endRegion: { content: ReactNode; open: boolean } | null
    publish: (owner: symbol, content: ReactNode) => void
    clear: (owner: symbol) => void
    publishEnd: (owner: symbol, content: ReactNode, open: boolean) => void
    clearEnd: (owner: symbol) => void
}

const AssistantTitleBarContext = createContext<AssistantTitleBarContextValue | null>(null)

export function AssistantTitleBarProvider({ children }: { children: ReactNode }) {
    const [registration, setRegistration] = useState<AssistantTitleBarRegistration | null>(null)
    const [endRegistration, setEndRegistration] = useState<AssistantTitleBarEndRegistration | null>(null)

    const publish = useCallback((owner: symbol, content: ReactNode) => {
        setRegistration((current) => content
            ? { owner, content }
            : current?.owner === owner ? null : current)
    }, [])

    const clear = useCallback((owner: symbol) => {
        setRegistration((current) => current?.owner === owner ? null : current)
    }, [])

    const publishEnd = useCallback((owner: symbol, content: ReactNode, open: boolean) => {
        setEndRegistration((current) => content
            ? { owner, content, open }
            : current?.owner === owner ? null : current)
    }, [])

    const clearEnd = useCallback((owner: symbol) => {
        setEndRegistration((current) => current?.owner === owner ? null : current)
    }, [])

    const value = useMemo<AssistantTitleBarContextValue>(() => ({
        content: registration?.content || null,
        endRegion: endRegistration
            ? { content: endRegistration.content, open: endRegistration.open }
            : null,
        publish,
        clear,
        publishEnd,
        clearEnd
    }), [clear, clearEnd, endRegistration, publish, publishEnd, registration])

    return (
        <AssistantTitleBarContext.Provider value={value}>
            {children}
        </AssistantTitleBarContext.Provider>
    )
}

export function useAssistantTitleBarContent(): ReactNode {
    return useContext(AssistantTitleBarContext)?.content || null
}

export function useAssistantTitleBarEndRegion(): { content: ReactNode; open: boolean } | null {
    return useContext(AssistantTitleBarContext)?.endRegion || null
}

export function usePublishAssistantTitleBarContent(content: ReactNode): void {
    const context = useContext(AssistantTitleBarContext)
    const ownerRef = useRef(Symbol('assistant-title-bar'))
    const publish = context?.publish
    const clear = context?.clear

    useLayoutEffect(() => {
        publish?.(ownerRef.current, content)
    }, [content, publish])

    useLayoutEffect(() => () => {
        clear?.(ownerRef.current)
    }, [clear])
}

export function usePublishAssistantTitleBarEndRegion(content: ReactNode, open: boolean): void {
    const context = useContext(AssistantTitleBarContext)
    const ownerRef = useRef(Symbol('assistant-title-bar-end'))
    const publishEnd = context?.publishEnd
    const clearEnd = context?.clearEnd

    useLayoutEffect(() => {
        publishEnd?.(ownerRef.current, content, open)
    }, [content, open, publishEnd])

    useLayoutEffect(() => () => {
        clearEnd?.(ownerRef.current)
    }, [clearEnd])
}
