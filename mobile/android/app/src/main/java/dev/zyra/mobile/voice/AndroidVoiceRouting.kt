package dev.zyra.mobile.voice

import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper

/** AudioManager owns routing (including connected Bluetooth/USB headsets).
 * Selection is reported from the actual communication device, not the request. */
class AndroidVoiceRouting(private val audio: AudioManager, private val changed: (VoiceAudioOutputs) -> Unit) : AutoCloseable {
    private val main = Handler(Looper.getMainLooper())
    private var closed = false
    private var registered = false
    private var pending: Int? = null
    private var lastSelected: Int? = null
    private var error: String? = null
    private val timeout = Runnable { pending = null; error = "Android could not switch audio. Choose an output to try again."; publish() }
    private val devices = object : AudioDeviceCallback() {
        override fun onAudioDevicesAdded(added: Array<out AudioDeviceInfo>) = publish()
        override fun onAudioDevicesRemoved(removed: Array<out AudioDeviceInfo>) = publish()
    }
    private var communication: AudioManager.OnCommunicationDeviceChangedListener? = null
    fun start() {
        audio.registerAudioDeviceCallback(devices, main)
        registered = true
        if (Build.VERSION.SDK_INT >= 31) {
            communication = AudioManager.OnCommunicationDeviceChangedListener { publish() }.also {
                audio.addOnCommunicationDeviceChangedListener({ task -> main.post(task) }, it)
            }
            val available = audio.availableCommunicationDevices
            val headsetTypes = setOf(AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES, AudioDeviceInfo.TYPE_USB_HEADSET, AudioDeviceInfo.TYPE_BLUETOOTH_SCO, AudioDeviceInfo.TYPE_BLE_HEADSET, AudioDeviceInfo.TYPE_HEARING_AID)
            val headset = audio.communicationDevice?.takeIf { it.type in headsetTypes } ?: available.firstOrNull { it.type in headsetTypes }
            val preferred = headset ?: available.firstOrNull { it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER }
            if (preferred != null) select(preferred.id)
        } else speaker(true)
        publish()
    }
    @Suppress("DEPRECATION") private fun publish() {
        if (closed) return
        if (Build.VERSION.SDK_INT >= 31) {
            val selected = audio.communicationDevice?.id
            val available = audio.availableCommunicationDevices
            if (selected != lastSelected) { lastSelected = selected; error = null }
            if (pending != null && pending == selected) { pending = null; main.removeCallbacks(timeout) }
            if (pending != null && available.none { it.id == pending }) { pending = null; main.removeCallbacks(timeout); error = "That output disconnected. Choose another output." }
            changed(VoiceAudioOutputs(available.map { device ->
            VoiceAudioOutput(device.id, when (device.type) {
                AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "Speaker"
                AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "Phone"
                AudioDeviceInfo.TYPE_WIRED_HEADSET, AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Wired headphones"
                else -> device.productName.toString().ifBlank { "Connected audio" }
            }, when (device.type) { AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> VoiceOutputKind.Speaker; AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> VoiceOutputKind.Phone; else -> VoiceOutputKind.Headphones })
            }, selected, pending, error))
        }
        else changed(VoiceAudioOutputs(listOf(VoiceAudioOutput(-1, "Speaker", VoiceOutputKind.Speaker), VoiceAudioOutput(-2, "System audio")), if (audio.isSpeakerphoneOn) -1 else -2))
    }
    @Suppress("DEPRECATION") fun select(id: Int): Boolean {
        if (closed) return false
        if (Build.VERSION.SDK_INT >= 31) {
            val device = audio.availableCommunicationDevices.firstOrNull { it.id == id } ?: return false
            if (!audio.setCommunicationDevice(device)) return false
            error = null; pending = id; main.removeCallbacks(timeout); main.postDelayed(timeout, 30000); publish(); return true
        }
        if (id !in setOf(-1, -2)) return false
        audio.isSpeakerphoneOn = id == -1; publish(); return true
    }
    fun speaker(enabled: Boolean): Boolean = if (Build.VERSION.SDK_INT >= 31) {
        val type = if (enabled) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        audio.availableCommunicationDevices.firstOrNull { it.type == type }?.let { select(it.id) } == true
    } else select(if (enabled) -1 else -2)
    override fun close() {
        if (closed) return
        closed = true; if (registered) audio.unregisterAudioDeviceCallback(devices)
        main.removeCallbacks(timeout)
        if (Build.VERSION.SDK_INT >= 31) communication?.let { audio.removeOnCommunicationDeviceChangedListener(it) }
        communication = null
    }
}
