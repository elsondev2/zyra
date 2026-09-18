package dev.zyra.mobile.ui

import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.data.*
import java.io.ByteArrayInputStream

@Composable fun RenderedFile(text: String, kind: FileRender, modifier: Modifier = Modifier) {
    if (kind == FileRender.MARKDOWN) Box(modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(vertical = 12.dp)) { Markdown(text) }
    else {
        val document = remember(text) { staticPreviewDocument(text) }
        AndroidView(factory = { context -> WebView(context).apply {
            settings.javaScriptEnabled = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.blockNetworkLoads = true
            settings.domStorageEnabled = false
            settings.setSupportMultipleWindows(false)
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?) = true
                override fun shouldInterceptRequest(view: WebView?, request: WebResourceRequest?) =
                    WebResourceResponse("text/plain", "utf-8", ByteArrayInputStream(byteArrayOf()))
            }
        } }, modifier = modifier.fillMaxSize(), update = { view ->
            if (view.tag != document) { view.tag = document; view.loadDataWithBaseURL("https://preview.invalid/", document, "text/html", "utf-8", null) }
        }, onRelease = { it.stopLoading(); it.destroy() })
    }
}
