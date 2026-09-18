// Chrome Web Store signing identity, assigned to the Zyra Browser listing.
export const CHROME_EXTENSION_STORE_ID = 'bjigiapjhbnobifggaopjhipndjmbaof'
export const CHROME_EXTENSION_STORE_URL = CHROME_EXTENSION_STORE_ID
    ? `https://chromewebstore.google.com/detail/${CHROME_EXTENSION_STORE_ID}`
    : null

export function chromeExtensionOrigins(ids: readonly string[]): ReadonlySet<string> {
    return new Set(ids.filter(id => /^[a-p]{32}$/.test(id)).map(id => `chrome-extension://${id}`))
}

export const CHROME_EXTENSION_DEVELOPMENT_ID = 'eidhaonkphoiadpcnfcpiijmkdboheel'
