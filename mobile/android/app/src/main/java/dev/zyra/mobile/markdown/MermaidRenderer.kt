package dev.zyra.mobile.markdown

import android.content.Context
import android.webkit.*
import android.view.View
import dev.zyra.mobile.data.MermaidPolicy
import kotlinx.coroutines.*
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import org.json.JSONObject
import org.json.JSONTokener
import java.io.ByteArrayInputStream
import java.security.MessageDigest

/** One transient, offline trusted-script renderer. Untrusted Markdown never becomes executable HTML. */
object MermaidRenderer {
    private const val ORIGIN = "https://zyra-diagram.invalid"
    private val gate = Mutex()
    private val cache = LinkedHashMap<String, String>(16, .75f, true)
    private var characters = 0
    private const val DOCUMENT = """<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src 'none'; connect-src 'none'; font-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'"><script src="/mermaid.min.js"></script><script src="/bootstrap.js"></script></head><body></body></html>"""

    suspend fun render(context: Context, source: String, theme: JSONObject): String {
        MermaidPolicy.checkSource(source)
        val key = MessageDigest.getInstance("SHA-256").digest((source + theme.toString()).toByteArray()).joinToString("") { "%02x".format(it) }
        return gate.withLock {
            cache[key]?.let { return@withLock it }
            val svg = withTimeoutOrNull(10_000) { withContext(Dispatchers.Main.immediate) { renderOnce(context.applicationContext, source, theme) } }
                ?: error("Diagram rendering timed out.")
            val safe = withContext(Dispatchers.Default) { MermaidPolicy.sanitizeSvg(svg) }
            cache[key] = safe; characters += safe.length
            while (cache.size > 16 || characters > 1_280_000) {
                val oldest = cache.entries.iterator(); characters -= oldest.next().value.length; oldest.remove()
            }
            safe
        }
    }

    @Suppress("SetJavaScriptEnabled")
    private suspend fun renderOnce(context: Context, source: String, theme: JSONObject): String {
        val ready = CompletableDeferred<Unit>()
        val view = WebView(context)
        try {
            view.settings.apply {
                javaScriptEnabled = true // Only the two bundled, immutable runtime scripts are loaded.
                allowFileAccess = false; allowContentAccess = false; blockNetworkLoads = true; blockNetworkImage = true
                domStorageEnabled = false; databaseEnabled = false; javaScriptCanOpenWindowsAutomatically = false
                setSupportMultipleWindows(false); mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                cacheMode = WebSettings.LOAD_NO_CACHE
            }
            view.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?): WebResourceResponse {
                    val file = when (request?.url?.toString()) {
                        "$ORIGIN/mermaid.min.js" -> "mermaid/mermaid.min.js"
                        "$ORIGIN/bootstrap.js" -> "mermaid/bootstrap.js"
                        else -> null
                    }
                    return if (file != null) WebResourceResponse("application/javascript", "utf-8", context.assets.open(file))
                    else WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(byteArrayOf()))
                }
                override fun onPageFinished(view: WebView?, url: String?) { if (url?.startsWith(ORIGIN) == true) ready.complete(Unit) }
                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame == true) ready.completeExceptionally(IllegalStateException("Diagram renderer unavailable."))
                }
                override fun onRenderProcessGone(view: WebView?, detail: RenderProcessGoneDetail?): Boolean {
                    ready.completeExceptionally(IllegalStateException("Diagram renderer stopped.")); return true
                }
            }
            // Detached layout provides deterministic text measurement without mounting a browser in the chat.
            view.measure(View.MeasureSpec.makeMeasureSpec(1000, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(800, View.MeasureSpec.EXACTLY))
            view.layout(0, 0, 1000, 800)
            view.loadDataWithBaseURL("$ORIGIN/", DOCUMENT, "text/html", "utf-8", null)
            ready.await()
            // JSON.stringify-style quoting keeps the chart a string argument, never executable source or HTML.
            evaluate(view, "window.zyraRenderMermaid(${JSONObject.quote(source)},${theme});")
            while (true) {
                currentCoroutineContext().ensureActive()
                val value = evaluate(view, "JSON.stringify(window.__zyraMermaidResult)")
                val decoded = runCatching { JSONTokener(value).nextValue() }.getOrNull() as? String
                if (decoded != null && decoded != "null") {
                    val result = JSONObject(decoded)
                    if (result.has("error")) error("This diagram could not be rendered.")
                    return result.getString("svg")
                }
                delay(60)
            }
        } finally {
            withContext(NonCancellable + Dispatchers.Main.immediate) { view.stopLoading(); view.loadUrl("about:blank"); view.destroy() }
        }
    }
    private suspend fun evaluate(view: WebView, script: String): String = suspendCancellableCoroutine { continuation ->
        view.evaluateJavascript(script) { value -> if (continuation.isActive) continuation.resumeWith(Result.success(value)) }
    }
}

