export type AssistantBrowserFailureKind =
    | 'dns'
    | 'offline'
    | 'timeout'
    | 'connection'
    | 'certificate'
    | 'generic'

export interface AssistantBrowserFailureCopy {
    kind: AssistantBrowserFailureKind
    title: string
    message: string
    hint: string
}

export function classifyAssistantBrowserFailure(error: string | null | undefined): AssistantBrowserFailureCopy {
    const value = error || ''

    if (/ERR_NAME_NOT_RESOLVED|NAME_NOT_RESOLVED|ERR_DNS|DNS_PROBE/i.test(value)) {
        return {
            kind: 'dns',
            title: 'This site can’t be reached',
            message: 'Zyra couldn’t find the server for this address.',
            hint: 'Check the spelling of the address, then try again.'
        }
    }

    if (/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|ERR_NETWORK_IO_SUSPENDED|ERR_CONNECTION_OFFLINE/i.test(value)) {
        return {
            kind: 'offline',
            title: 'You’re offline',
            message: 'Zyra lost its connection to the internet while opening this page.',
            hint: 'Reconnect to the internet, then try again.'
        }
    }

    if (/ERR_TIMED_OUT|ERR_CONNECTION_TIMED_OUT|timeout|timed out/i.test(value)) {
        return {
            kind: 'timeout',
            title: 'The site took too long to respond',
            message: 'The server did not respond in time.',
            hint: 'The site may be busy. Wait a moment, then try again.'
        }
    }

    if (/ERR_CERT|ERR_SSL|ERR_BAD_SSL|CERT_AUTHORITY|CERT_COMMON_NAME|CERT_DATE_INVALID|SSL_PROTOCOL/i.test(value)) {
        return {
            kind: 'certificate',
            title: 'This site can’t provide a secure connection',
            message: 'Zyra could not verify the site’s security certificate.',
            hint: 'Check your device’s date and time, or try again later.'
        }
    }

    if (/ERR_CONNECTION_RESET|ERR_CONNECTION_REFUSED|ERR_CONNECTION_CLOSED|ERR_ADDRESS_UNREACHABLE|ERR_NETWORK_ACCESS_DENIED/i.test(value)) {
        return {
            kind: 'connection',
            title: 'The connection was interrupted',
            message: 'Zyra reached the address, but the connection to the site could not be completed.',
            hint: 'Check your connection or try again in a moment.'
        }
    }

    return {
        kind: 'generic',
        title: 'This page couldn’t be loaded',
        message: 'Something went wrong while Zyra was opening this page.',
        hint: 'Check the address and your connection, then try again.'
    }
}
