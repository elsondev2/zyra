import { PluginMcpCredentialStore } from './plugin-mcp-credential-store'

export const GOOGLE_MCP_CLIENT_KEY = 'zyra-google-desktop-client'
const scope = (name: string) => `https://www.googleapis.com/auth/${name}`
const profiles: Record<string, readonly string[]> = {
    'https://gmailmcp.googleapis.com/mcp/v1': [scope('gmail.readonly'), scope('gmail.compose'), scope('gmail.modify')],
    'https://drivemcp.googleapis.com/mcp/v1': [scope('drive.readonly'), scope('drive.file')],
    'https://calendarmcp.googleapis.com/mcp/v1': [scope('calendar.calendarlist.readonly'), scope('calendar.events.freebusy'), scope('calendar.events.readonly'), scope('calendar.events')]
}

const apiServices = {
    'https://gmailmcp.googleapis.com/mcp/v1': { name: 'Gmail', destination: 'gmail.googleapis.com', verifiedFlag: 'gmailApiVerified', module: 'gmail-api-client.mjs', client: 'GmailApiClient' },
    'https://calendarmcp.googleapis.com/mcp/v1': { name: 'Google Calendar', destination: 'www.googleapis.com/calendar/v3', verifiedFlag: 'calendarApiVerified', module: 'calendar-api-client.mjs', client: 'CalendarApiClient' },
    'https://drivemcp.googleapis.com/mcp/v1': { name: 'Google Drive', destination: 'www.googleapis.com/drive/v3', verifiedFlag: 'driveApiVerified', module: 'drive-api-client.mjs', client: 'DriveApiClient' },
} as const

/** Only app-owned exact registered descriptors can select these API adapters. */
export function googleApiService(server: { kind: string; url?: string; bearerTokenEnvVar?: string }) {
    if (server.kind !== 'http' || server.bearerTokenEnvVar || !server.url || !Object.hasOwn(apiServices, server.url)) return null
    return apiServices[server.url as keyof typeof apiServices]
}

export function isGmailApiServer(server: { kind: string; url?: string; bearerTokenEnvVar?: string }): boolean {
    return googleApiService(server)?.verifiedFlag === 'gmailApiVerified'
}

export function googleMcpScopes(url: string): string[] | null {
    return Object.hasOwn(profiles, url) ? [...profiles[url]] : null
}

export function validateGoogleDesktopClientId(value: unknown): string {
    if (typeof value !== 'string' || !/^\d{6,32}-[a-z0-9]{10,100}\.apps\.googleusercontent\.com$/u.test(value)) {
        throw new Error('Google Desktop OAuth client registration is invalid.')
    }
    return value
}

export function validateGoogleDesktopClientSecret(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{16,512}$/u.test(value)) {
        throw new Error('Google Desktop client secret is missing or invalid. Complete local Google setup before connecting.')
    }
    return value
}

/** App-owned registration, separate from package files and per-plugin user tokens. */
export class GooglePluginMcpClient {
    constructor(private readonly store: PluginMcpCredentialStore) {}

    async configuration(url: string): Promise<{ scopes: string[]; oauth: { clientId: string; clientSecret: string }; googleDesktop: true } | null> {
        const scopes = googleMcpScopes(url)
        if (!scopes) return null
        const client = (await this.store.get(GOOGLE_MCP_CLIENT_KEY))?.issuers?.['https://accounts.google.com']?.client as { client_id?: unknown; client_secret?: unknown } | undefined
        if (!client) throw new Error('Google sign-in is not configured for this Zyra installation.')
        return { scopes, oauth: { clientId: validateGoogleDesktopClientId(client.client_id), clientSecret: validateGoogleDesktopClientSecret(client.client_secret) }, googleDesktop: true }
    }
}
