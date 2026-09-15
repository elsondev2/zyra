package dev.zyra.mobile.lifecycle

/** Main-thread ownership shared by the UI and an explicitly started service.
 * The store never keeps an idle session alive after its final owner leaves. */
class SessionStore<T : AutoCloseable>(private val create: () -> T) {
    private var current: T? = null
    private var owners = 0
    fun acquire(): Lease<T> {
        val value = current ?: create().also { current = it }
        owners++
        return Lease(value) {
            check(current === value && owners > 0)
            if (--owners == 0) { current = null; value.close() }
        }
    }
    class Lease<T>(val value: T, private val release: () -> Unit) : AutoCloseable {
        private var closed = false
        override fun close() { if (!closed) { closed = true; release() } }
    }
}
