package dev.zyra.mobile.data

import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import okhttp3.*
import okhttp3.HttpUrl.Companion.toHttpUrlOrNull
import java.io.File
import java.io.IOException
import java.net.Proxy
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Remote image transport is intentionally separate from paired-PC clients and credentials. */
class RemoteImageDownloads(private val directory: File, private val validateImage: (File) -> Unit,
    private val client: OkHttpClient = transport, private val byteLimit: Long = MAX_BYTES, private val cacheLimit: Long = CACHE_BYTES) {
    suspend fun load(destination: String, owner: String): File = withContext(Dispatchers.IO) {
        val url = checkedUrl(destination)
        cacheGate.withLock {
            directory.mkdirs()
            val key = MessageDigest.getInstance("SHA-256").digest((owner + "\u0000" + url).toByteArray()).joinToString("") { "%02x".format(it) }
            val result = File(directory, "$key.image")
            if (result.isFile && result.length() in 1..byteLimit) {
                result.setLastModified(System.currentTimeMillis()); return@withLock result
            }
            val temporary = File.createTempFile("incoming-", ".tmp", directory)
            try {
                fetch(url, temporary)
                validateImage(temporary)
                currentCoroutineContext().ensureActive()
                check(temporary.renameTo(result)) { "Could not keep this image. Try again." }
                prune(result)
                result
            } finally { temporary.delete() }
        }
    }
    private suspend fun fetch(url: HttpUrl, file: File) = suspendCancellableCoroutine<Unit> { continuation ->
        val call = client.newCall(Request.Builder().url(url).header("Accept", "image/png,image/jpeg,image/webp,image/gif,image/bmp").build())
        val cancelled = AtomicBoolean(false)
        continuation.invokeOnCancellation { cancelled.set(true); call.cancel() }
        call.enqueue(object : Callback {
            override fun onFailure(call: Call, error: IOException) {
                if (continuation.isActive) continuation.resumeWithException(IOException("Could not load image. Try again."))
            }
            override fun onResponse(call: Call, response: Response) {
                try {
                    response.use {
                        check(continuation.isActive) { "Image load cancelled." }
                        check(response.isSuccessful) { if (response.isRedirect) "Open this image in your browser to follow its redirect." else "This image is unavailable." }
                        val body = response.body ?: error("This image is empty.")
                        val mime = body.contentType()?.let { "${it.type}/${it.subtype}" }
                        check(mime in setOf("image/png", "image/jpeg", "image/webp", "image/gif", "image/bmp")) { "This image format cannot be previewed." }
                        check(body.contentLength() <= byteLimit) { "Image exceeds the 5 MB preview limit." }
                        body.byteStream().use { input -> file.outputStream().use { output ->
                            val buffer = ByteArray(16 * 1024); var total = 0L
                            while (true) {
                                if (!continuation.isActive) throw IOException("Image load cancelled.")
                                val count = input.read(buffer); if (count < 0) break
                                total += count; check(total <= byteLimit) { "Image exceeds the 5 MB preview limit." }
                                output.write(buffer, 0, count)
                            }
                            check(total > 0) { "This image is empty." }
                        } }
                    }
                    if (continuation.isActive) continuation.resume(Unit)
                } catch (error: Exception) {
                    if (continuation.isActive) continuation.resumeWithException(if (error is IllegalStateException) error else IOException("Could not load image. Try again."))
                } finally { response.close(); if (cancelled.get()) file.delete() }
            }
        })
    }
    private fun prune(keep: File) {
        val files = directory.listFiles()?.filter { it.extension == "image" }?.sortedBy { it.lastModified() }.orEmpty()
        var total = files.sumOf { it.length() }
        for (file in files) if (file != keep && total > cacheLimit) { val bytes = file.length(); if (file.delete()) total -= bytes }
    }
    companion object {
        const val MAX_BYTES = 5L * 1024 * 1024
        const val CACHE_BYTES = 20L * 1024 * 1024
        private val cacheGate = Mutex()
        private val transport by lazy { OkHttpClient.Builder().proxy(Proxy.NO_PROXY).cookieJar(CookieJar.NO_COOKIES)
            .authenticator(Authenticator.NONE).proxyAuthenticator(Authenticator.NONE).followRedirects(false).followSslRedirects(false)
            .retryOnConnectionFailure(false).connectTimeout(8, TimeUnit.SECONDS).readTimeout(10, TimeUnit.SECONDS)
            .callTimeout(20, TimeUnit.SECONDS).build() }
        fun checkedUrl(value: String): HttpUrl {
            require(value.length <= 8192) { "Image link is too long." }
            val url = value.toHttpUrlOrNull() ?: throw IllegalArgumentException("Invalid image link.")
            require(url.username.isEmpty() && url.password.isEmpty()) { "Image links with credentials cannot be previewed." }
            return url.newBuilder().fragment(null).build()
        }
        fun checkDimensions(width: Int, height: Int) {
            check(width in 1..8192 && height in 1..8192 && width.toLong() * height <= 24_000_000) { "Image dimensions exceed the preview limit." }
        }
    }
}
