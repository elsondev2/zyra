import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { FiltersEngine, Request } from '@ghostery/adblocker'
import {
    createYouTubeStyleInjection,
    injectYouTubeCosmeticsInRequestingFrame,
    YOUTUBE_COSMETIC_FALLBACK_STYLES
} from '../src/main/browser-adblock-service'
import {
    isBrowserAdBlockCompatibilityPageUrl,
    isSpotifyProtectedResourceUrl,
    isYouTubeBrowserPageUrl,
    resolveBrowserAdBlockInitiatorUrls,
    resolveBrowserAdBlockSessionTransition,
    resolveBrowserAdDetectionOrigin,
    shouldBypassYouTubePlaybackRequest
} from '../src/main/browser-adblock-policy'
import { isBrowserDevscopeBridgePath } from '../src/shared/browser-assistant-bridge'

assert.equal(resolveBrowserAdBlockSessionTransition(true, false), 'enable-blocking')
assert.equal(resolveBrowserAdBlockSessionTransition(true, true), 'keep-blocking', 'preference refreshes cannot clear an already-enabled Ghostery listener')
assert.equal(resolveBrowserAdBlockSessionTransition(false, true), 'disable-to-passive')
assert.equal(resolveBrowserAdBlockSessionTransition(false, false), 'keep-passive')

const candidate = {
    requestUrl: 'https://ads.example/banner.js',
    pageUrl: 'https://news.example/story',
    resourceType: 'script',
    matched: true
}
assert.equal(resolveBrowserAdDetectionOrigin(candidate), 'https://news.example')
assert.equal(resolveBrowserAdDetectionOrigin({ ...candidate, matched: false }), null)
assert.equal(resolveBrowserAdDetectionOrigin({ ...candidate, excepted: true }), null)
assert.equal(resolveBrowserAdDetectionOrigin({ ...candidate, resourceType: 'mainFrame' }), null, 'top-level navigation never triggers the ad prompt')
assert.equal(resolveBrowserAdDetectionOrigin({ ...candidate, pageUrl: 'http://localhost:5174/' }), null, 'local development pages never trigger the ad prompt')
assert.equal(resolveBrowserAdDetectionOrigin({ ...candidate, pageUrl: 'http://127.0.0.1:3000/' }), null)
assert.equal(resolveBrowserAdDetectionOrigin({ ...candidate, requestUrl: 'http://localhost:9000/ad.js' }), null)
assert.equal(isBrowserAdBlockCompatibilityPageUrl('http://app.localhost:5174/'), true)
assert.equal(isBrowserAdBlockCompatibilityPageUrl('http://127.0.0.2:3000/'), true)
assert.equal(isBrowserAdBlockCompatibilityPageUrl('http://[::1]:4173/'), true)
assert.equal(isBrowserAdBlockCompatibilityPageUrl('https://open.spotify.com/'), true)
assert.equal(isBrowserAdBlockCompatibilityPageUrl('https://chatgpt.com/'), true, 'ChatGPT bypasses scriptlet injection that can recursively wrap page APIs')
assert.equal(isBrowserAdBlockCompatibilityPageUrl('https://www.tiktok.com/'), true, 'TikTok signup and media flows bypass page-level compatibility hazards')
assert.equal(resolveBrowserAdDetectionOrigin({ ...candidate, pageUrl: 'https://open.spotify.com/track/example' }), null, 'Spotify never receives an offer for blocking that is intentionally bypassed')
assert.equal(isSpotifyProtectedResourceUrl('https://audio-fa.scdn.co/audio.mp4'), true)
assert.equal(isYouTubeBrowserPageUrl('https://www.youtube.com/watch?v=video'), true)
assert.equal(isYouTubeBrowserPageUrl('https://music.youtube.com/watch?v=video'), true)
assert.equal(isYouTubeBrowserPageUrl('https://www.youtube-nocookie.com/embed/video'), true)
assert.equal(isYouTubeBrowserPageUrl('https://www.youtubekids.com/watch?v=video'), true)
assert.equal(isYouTubeBrowserPageUrl('https://youtube.com.evil.example/watch?v=video'), false)
assert.deepEqual(resolveBrowserAdBlockInitiatorUrls({
    frameAvailable: true,
    frameUrl: 'https://ads.example/frame',
    referrer: 'https://www.youtube.com/watch?v=video',
    topLevelUrl: 'https://www.youtube.com/watch?v=video'
}), ['https://ads.example/frame'], 'a live child frame cannot borrow its YouTube top-level owner to bypass filtering')
assert.deepEqual(resolveBrowserAdBlockInitiatorUrls({
    frameAvailable: false,
    referrer: 'https://www.youtube-nocookie.com/embed/video',
    topLevelUrl: 'https://news.example/story'
}), ['https://www.youtube-nocookie.com/embed/video'], 'an embedded YouTube referrer is used only when its frame no longer survives')
assert.deepEqual(resolveBrowserAdBlockInitiatorUrls({
    frameAvailable: false,
    topLevelUrl: 'https://www.youtube.com/watch?v=video'
}), ['https://www.youtube.com/watch?v=video'], 'the top-level URL is the final initiator fallback')
const youtubeInitiators = ['https://www.youtube.com/watch?v=video']
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: 'https://rr1---sn.example.googlevideo.com/videoplayback?expire=1',
    resourceType: 'media'
}), true, 'YouTube media transport fails open because ads and content share Googlevideo delivery')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: 'https://rr1---sn.example.googlevideo.com/videoplayback?expire=1',
    resourceType: 'xhr'
}), true, 'YouTube MediaSource and SABR transport can be classified as XHR')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: 'https://rr1---sn.example.googlevideo.com/videoplayback/segment/1',
    resourceType: 'other'
}), true, 'Chromium transport reclassification cannot blank YouTube playback')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: ['https://news.example/embed', 'https://www.youtube-nocookie.com/embed/video'],
    requestUrl: 'https://rr1---sn.example.googlevideo.com/videoplayback?expire=1',
    resourceType: 'xhr'
}), true, 'a YouTube requesting frame protects embedded playback even under an unrelated top-level page')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: ['https://news.example/story'],
    requestUrl: 'https://rr1---sn.example.googlevideo.com/videoplayback?expire=1',
    resourceType: 'media'
}), false, 'Googlevideo is exempt only when a real YouTube page owns the request')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: 'https://googlevideo.com.evil.example/videoplayback',
    resourceType: 'media'
}), false)
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: 'https://rr1---sn.example.googlevideo.com/initplayback?oad=1',
    resourceType: 'xhr'
}), false, 'explicit ad-oriented Googlevideo endpoints remain filterable')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: 'https://googleads.g.doubleclick.net/pagead/id',
    resourceType: 'xhr'
}), false, 'known ad and tracking hosts remain filterable')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: 'https://www.youtube.com/api/stats/ads',
    resourceType: 'xhr'
}), false, 'YouTube ad telemetry remains filterable')

const hostileYouTubeEngine = FiltersEngine.parse(`
||googlevideo.com/videoplayback$media,xhr,domain=youtube.com
||googlevideo.com/initplayback?*oad=$xhr,domain=youtube.com
||doubleclick.net^$xhr
`)
const protectedPlaybackRequest = Request.fromRawDetails({
    type: 'xhr',
    url: 'https://rr1---sn.example.googlevideo.com/videoplayback?expire=1',
    sourceUrl: youtubeInitiators[0]
})
assert.equal(hostileYouTubeEngine.match(protectedPlaybackRequest).match, true, 'the regression fixture proves an upstream rule can classify shared playback as an ad')
assert.equal(shouldBypassYouTubePlaybackRequest({
    initiatorUrls: youtubeInitiators,
    requestUrl: protectedPlaybackRequest.url,
    resourceType: 'xhr'
}), true, 'Zyra protects playback even when the current filter engine would cancel it')
assert.equal(hostileYouTubeEngine.match(Request.fromRawDetails({
    type: 'xhr',
    url: 'https://rr1---sn.example.googlevideo.com/initplayback?oad=1',
    sourceUrl: youtubeInitiators[0]
})).match, true, 'ad-oriented Googlevideo traffic remains available to the filter engine')

function createCosmeticDomHarness(initiallyReady: boolean) {
    class FakeStyleElement {
        readonly attributes = new Map<string, string>()
        textContent = ''
        setAttribute(name: string, value: string): void {
            this.attributes.set(name, value)
        }
    }
    const styles: FakeStyleElement[] = []
    const container = {
        appendChild(style: FakeStyleElement): void {
            styles.push(style)
        },
        querySelector(selector: string): FakeStyleElement | null {
            const marker = selector.match(/data-zyra-youtube-cosmetics(?:="([^"]+)")?/)
            if (!marker) return null
            return styles.find((style) => {
                const value = style.attributes.get('data-zyra-youtube-cosmetics')
                return value !== undefined && (marker[1] === undefined || value === marker[1])
            }) || null
        }
    }
    let head: typeof container | null = initiallyReady ? container : null
    let documentElement: typeof container | null = initiallyReady ? container : null
    let onDomContentLoaded: (() => void) | null = null
    const document = {
        get head() { return head },
        get documentElement() { return documentElement },
        querySelector: container.querySelector,
        createElement(tag: string): FakeStyleElement {
            assert.equal(tag, 'style')
            return new FakeStyleElement()
        }
    }
    return {
        context: {
            location: { origin: 'https://www.youtube.com' },
            document,
            HTMLStyleElement: FakeStyleElement,
            addEventListener(type: string, listener: () => void): void {
                if (type === 'DOMContentLoaded') onDomContentLoaded = listener
            }
        },
        makeReady(): void {
            head = container
            documentElement = container
            onDomContentLoaded?.()
        },
        styles
    }
}

const earlyCosmetics = createCosmeticDomHarness(false)
assert.doesNotThrow(() => runInNewContext(
    createYouTubeStyleInjection('ytd-ad-slot-renderer { display: none !important; }', 'https://www.youtube.com'),
    earlyCosmetics.context
), 'initial YouTube cosmetics must wait safely when the document root does not exist yet')
assert.equal(earlyCosmetics.styles.length, 0)
earlyCosmetics.makeReady()
assert.equal(earlyCosmetics.styles.length, 1, 'base YouTube cosmetic styles install when the document becomes ready')

const accumulatingCosmetics = createCosmeticDomHarness(true)
runInNewContext(createYouTubeStyleInjection('#masthead-ad { display: none !important; }', 'https://www.youtube.com'), accumulatingCosmetics.context)
runInNewContext(createYouTubeStyleInjection('ytd-ad-slot-renderer { display: none !important; }', 'https://www.youtube.com'), accumulatingCosmetics.context)
assert.equal(accumulatingCosmetics.styles.length, 2, 'later DOM-driven cosmetics cannot replace the base feed-ad stylesheet')
assert.match(accumulatingCosmetics.styles.map((style) => style.textContent).join('\n'), /#masthead-ad/)
assert.match(accumulatingCosmetics.styles.map((style) => style.textContent).join('\n'), /ytd-ad-slot-renderer/)
runInNewContext(createYouTubeStyleInjection('#masthead-ad { display: none !important; }', 'https://www.youtube.com'), accumulatingCosmetics.context)
assert.equal(accumulatingCosmetics.styles.length, 2, 'repeated cosmetic updates are deduplicated')
assert.match(YOUTUBE_COSMETIC_FALLBACK_STYLES, /yt-ad-slot-renderer/)
assert.match(YOUTUBE_COSMETIC_FALLBACK_STYLES, /ytd-ad-slot-renderer/)
assert.match(YOUTUBE_COSMETIC_FALLBACK_STYLES, /ytd-in-feed-ad-layout-renderer/)
assert.match(YOUTUBE_COSMETIC_FALLBACK_STYLES, /ytd-rich-item-renderer:has/, 'promoted feed cards collapse with their ad slot')
assert.doesNotMatch(YOUTUBE_COSMETIC_FALLBACK_STYLES, /googlevideo|videoplayback|\.html5-video-container/, 'page cosmetics never target shared playback transport or the content video')

let mismatchedOriginFilterLookup = false
await injectYouTubeCosmeticsInRequestingFrame({
    getCosmeticsFilters: () => {
        mismatchedOriginFilterLookup = true
        return { active: true, styles: '', scripts: [] }
    }
} as never, {
    senderFrame: {
        url: 'https://music.youtube.com/watch?v=video',
        isDestroyed: () => false
    },
    frameId: 7,
    processId: 11
} as never, 'https://www.youtube.com/watch?v=video', undefined)
assert.equal(mismatchedOriginFilterLookup, false, 'a navigation race cannot apply www.youtube.com cosmetics to music.youtube.com')

const styleExecutions: Array<{ code: string; userGesture: boolean | undefined }> = []
await injectYouTubeCosmeticsInRequestingFrame({
    getCosmeticsFilters: () => ({
        active: true,
        styles: 'ytd-ad-slot-renderer { display: none !important; }',
        scripts: []
    })
} as never, {
    senderFrame: {
        url: 'https://www.youtube.com/watch?v=video',
        isDestroyed: () => false,
        executeJavaScript: (code: string, userGesture?: boolean) => {
            styleExecutions.push({ code, userGesture })
            return Promise.resolve()
        }
    },
    frameId: 7,
    processId: 11
} as never, 'https://www.youtube.com/watch?v=video', undefined)
assert.equal(styleExecutions.length, 1)
assert.equal(styleExecutions[0]?.userGesture, false, 'cosmetic CSS cannot grant synthetic user activation to page monkeypatches')
assert.match(styleExecutions[0]?.code || '', /data-zyra-youtube-cosmetics/)

const behaviorEngine = FiltersEngine.parse(`
||ads.example^$media,script,image
news.example##.sponsored-slot
@@*$domain=open.spotify.com
`)
assert.equal(behaviorEngine.match(Request.fromRawDetails({ type: 'media', url: 'https://ads.example/audio-ad.mp3', sourceUrl: 'https://news.example/' })).match, true, 'media ad requests are matched')
assert.equal(behaviorEngine.match(Request.fromRawDetails({ type: 'script', url: 'https://ads.example/player-ad.js', sourceUrl: 'https://news.example/' })).match, true, 'script ad requests are matched')
assert.ok(behaviorEngine.getCosmeticsFilters({ url: 'https://news.example/', hostname: 'news.example', domain: 'news.example' }).styles.length > 0, 'page-level cosmetic ad slots receive hiding styles')
const spotifyMatch = behaviorEngine.match(Request.fromRawDetails({ type: 'media', url: 'https://ads.example/media.mp3', sourceUrl: 'https://open.spotify.com/' }))
assert.equal(Boolean(spotifyMatch.exception), true, 'Spotify source requests are compatibility-exempt')

assert.equal(isBrowserDevscopeBridgePath(['getBrowserAdBlockStatus']), false, 'thin Browser clients cannot inspect the Desktop blocker')
assert.equal(isBrowserDevscopeBridgePath(['setBrowserAdBlockEnabled']), false, 'thin Browser clients cannot change the Desktop blocker')
assert.equal(isBrowserDevscopeBridgePath(['onBrowserAdDetected']), false, 'thin Browser clients cannot subscribe to Desktop request detection')

const serviceSource = readFileSync(new URL('../src/main/browser-adblock-service.ts', import.meta.url), 'utf8')
const previewHandlersSource = readFileSync(new URL('../src/main/ipc/handlers/browser-preview-handlers.ts', import.meta.url), 'utf8')
const settingsRuntimeSource = readFileSync(new URL('../src/renderer/src/lib/settings.tsx', import.meta.url), 'utf8')
const settingsSource = readFileSync(new URL('../src/renderer/src/pages/settings/BrowserControlSettings.tsx', import.meta.url), 'utf8')
const workspaceSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserWorkspace.tsx', import.meta.url), 'utf8')
const promptSource = readFileSync(new URL('../src/renderer/src/pages/assistant/AssistantBrowserAdBlockPrompt.tsx', import.meta.url), 'utf8')
assert.match(settingsRuntimeSource, /assistantBrowserAdBlockEnabled: false/, 'built-in ad blocking defaults off')
assert.match(settingsRuntimeSource, /assistantBrowserAdBlockPromptDismissed: false/, 'the one-time offer is initially eligible')
assert.match(serviceSource, /fromPrebuiltFull/, 'the blocker uses Ghostery network, cosmetic, scriptlet, and annoyance rules')
assert.match(serviceSource, /FILTER_CACHE_TTL_MS = 7[\s\S]*mtimeMs[\s\S]*fromPrebuiltFull[\s\S]*deserialize\(cached\)/, 'filter data refreshes weekly and falls back to the last known-good cache offline')
assert.match(serviceSource, /@@\|\|open\.spotify\.com\^\$document/, 'Spotify playback has a compatibility exception rather than partial media blocking')
assert.match(serviceSource, /class ZyraElectronBlocker[\s\S]*isBrowserAdBlockCompatibilityPageUrl\(requestPageUrl\(details\)\)[\s\S]*isSpotifyProtectedResourceUrl\(details\.url\)/, 'enabled network and media filtering bypasses local and protected Spotify traffic directly')
assert.match(serviceSource, /onBeforeRequest[\s\S]*resolveYouTubePlaybackBypass\(details, true\)[\s\S]*onHeadersReceived[\s\S]*resolveYouTubePlaybackBypass\(details, false\)/, 'request-time YouTube transport decisions remain stable through response headers')
assert.match(serviceSource, /details\.frame[\s\S]*details\.referrer[\s\S]*details\.webContents/, 'embedded YouTube playback resolves bounded frame, referrer, and top-level initiators')
assert.match(serviceSource, /youtubePlaybackDecisions[\s\S]*YOUTUBE_REQUEST_DECISION_LIMIT[\s\S]*YOUTUBE_REQUEST_DECISION_TTL_MS/, 'YouTube request decisions are bounded and expire')
assert.match(serviceSource, /event\.senderFrame[\s\S]*requestUrl\.origin !== expectedOrigin[\s\S]*new Set\(scripts\)[\s\S]*frame\.executeJavaScript\(isolateYouTubeScriptlet/, 'YouTube cosmetics remain bound to the exact live requesting-frame origin')
assert.match(serviceSource, /createYouTubeStyleInjection\(frameStyles, expectedOrigin\), false/, 'cosmetic CSS executes without synthetic user activation')
assert.match(serviceSource, /new Set\(scripts\)[\s\S]*frame\.executeJavaScript\(isolateYouTubeScriptlet/, 'YouTube scriptlets are deduplicated, isolated, awaited, and injected into their requesting frame')
assert.match(serviceSource, /data-zyra-youtube-cosmetics[\s\S]*styleKey[\s\S]*DOMContentLoaded/, 'YouTube base cosmetics survive document-start timing and later style updates')
assert.match(serviceSource, /enable-blocking[\s\S]*enableBlockingInSession[\s\S]*reloadCurrentYouTubeDocuments[\s\S]*disable-to-passive[\s\S]*reloadCurrentYouTubeDocuments/, 'ad-block transitions reload live YouTube documents so preload and injected-style state match the toggle')
assert.match(serviceSource, /location\.origin !==[\s\S]*youtubeFrameMatchesOrigin\(frame, expectedOrigin\)/, 'every YouTube cosmetic injection is guarded in-page and revalidated across awaits')
assert.doesNotMatch(serviceSource, /YouTube cosmetic styles[\s\S]{0,500}sender\.insertCSS/, 'YouTube styles never cross frame boundaries through WebContents-wide insertion')
assert.match(serviceSource, /if \(!response\.ok\) throw new Error/, 'HTTP failures cannot replace the last-known-good serialized filter engine')
assert.match(serviceSource, /onInjectCosmeticFilters[\s\S]*isBrowserAdBlockCompatibilityPageUrl\(url\)/, 'local and Spotify pages also bypass cosmetic and scriptlet filtering')
assert.match(serviceSource, /attachNetworkOnlySession[\s\S]*applyNetworkOnlySessionState[\s\S]*blocker\.onHeadersReceived[\s\S]*blocker\.onBeforeRequest/, 'temporary Browser sessions retain Ghostery network filtering without registering duplicate process-global cosmetic IPC handlers')
assert.match(previewHandlersSource, /createIncognitoBrowserSession[\s\S]*attachNetworkOnlySession\(browserSession\)/, 'incognito Browser sessions use the multi-session-safe blocker path')
assert.match(previewHandlersSource, /disposeIncognitoBrowserSession[\s\S]*detachNetworkOnlySession\(browserSession\)/, 'incognito Browser sessions release blocker listeners when their last tab closes')
assert.match(serviceSource, /webRequest\.onBeforeRequest\(\{ urls:/, 'disabled mode passively detects matching traffic')
assert.match(serviceSource, /callback\(\{\}\)/, 'passive detection never blocks the request')
assert.match(serviceSource, /disableBlockingInSession[\s\S]*installPassiveDetector/, 'turning blocking off restores passive detection')
assert.match(serviceSource, /setEnabled\([\s\S]*enqueueOperation[\s\S]*applySessionState\(\)[\s\S]*preferences\.updateSurfaceFromMain\('desktop'/, 'runtime transition and persistence execute inside one serialized operation')
assert.match(serviceSource, /enqueueOperation<T>[\s\S]*operationQueue\.then\(operation, operation\)[\s\S]*result\.then\(\(\) => undefined, \(\) => undefined\)/, 'failed operations cannot break or bypass the serialized blocker queue')
assert.doesNotMatch(settingsSource, /setBrowserAdBlockEnabled[\s\S]{0,500}updateSettings\(\{[\s\S]{0,160}assistantBrowserAdBlockEnabled/, 'Settings does not perform a second non-atomic blocker preference write')
assert.doesNotMatch(workspaceSource, /setBrowserAdBlockEnabled[\s\S]{0,500}updateSettings\(\{[\s\S]{0,160}assistantBrowserAdBlockEnabled/, 'the page prompt leaves blocker persistence in main')
assert.match(workspaceSource, /attempt < 8[\s\S]*resolveDetection\(event, attempt \+ 1\)/, 'the one-time offer survives ad requests that arrive while a guest handle is still attaching')
assert.match(settingsSource, /Built-in ad blocking/, 'Browser settings expose an explicit toggle')
assert.match(promptSource, /Block ads in Zyra Browser\?/, 'ad-bearing pages offer the built-in blocker')
assert.match(promptSource, /Keep off[\s\S]*Turn on/, 'the offer presents both persistent choices')

console.log('Browser ad-block policy: ok')
