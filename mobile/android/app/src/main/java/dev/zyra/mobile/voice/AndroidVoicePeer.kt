package dev.zyra.mobile.voice

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceInfo
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import livekit.org.webrtc.*
import livekit.org.webrtc.audio.JavaAudioDeviceModule
import java.nio.ByteBuffer
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

/** Audio-only native WebRTC. No camera, provider key, TURN credential or media
 * recording is stored on disk. The controller calls all public methods on Main. */
class AndroidVoicePeer(context: Context, private val listener: VoicePeerListener) : VoicePeer {
    private val app = context.applicationContext
    private val audio = app.getSystemService(AudioManager::class.java)
    private val routing = AndroidVoiceRouting(audio, listener::outputs)
    private val previousMode = audio.mode
    @Suppress("DEPRECATION") private val previousSpeaker = audio.isSpeakerphoneOn
    private val focus = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        .setOnAudioFocusChangeListener { change -> if (change == AudioManager.AUDIOFOCUS_LOSS || change == AudioManager.AUDIOFOCUS_LOSS_TRANSIENT) listener.failed("Voice stopped because another app needs the microphone or audio.") }
        .build()
    private var ownsFocus = false
    private var module: JavaAudioDeviceModule? = null
    private var factory: PeerConnectionFactory? = null
    private var source: AudioSource? = null
    private var track: AudioTrack? = null
    private var peer: PeerConnection? = null
    private var channel: DataChannel? = null
    private val gathered = CompletableDeferred<Unit>()
    @Volatile private var closed = false

    private fun initialize() {
        check(!closed)
        check(audio.requestAudioFocus(focus) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED) { "Another app is using audio. Try Voice when it finishes." }
        ownsFocus = true
        audio.mode = AudioManager.MODE_IN_COMMUNICATION
        routing.start()
        synchronized(AndroidVoicePeer::class.java) {
            if (!initialized) {
                PeerConnectionFactory.initialize(PeerConnectionFactory.InitializationOptions.builder(app).createInitializationOptions())
                initialized = true
            }
        }
        val device = JavaAudioDeviceModule.builder(app)
            .setSamplesReadyCallback { samples -> if (!closed) listener.samples(samples.data, samples.audioFormat, samples.sampleRate, samples.channelCount) }
            .setPlaybackSamplesReadyCallback { samples -> if (!closed) listener.playbackSamples(samples.data, samples.audioFormat, samples.sampleRate, samples.channelCount) }
            .setAudioTrackErrorCallback(object : JavaAudioDeviceModule.AudioTrackErrorCallback {
                override fun onWebRtcAudioTrackInitError(message: String) = listener.failed("Could not open audio playback. Check the selected output and try again.")
                override fun onWebRtcAudioTrackStartError(code: JavaAudioDeviceModule.AudioTrackStartErrorCode, message: String) = listener.failed("Could not start Voice playback. Try again.")
                override fun onWebRtcAudioTrackError(message: String) = listener.failed("Voice audio playback was interrupted.")
            })
            .setAudioRecordErrorCallback(object : JavaAudioDeviceModule.AudioRecordErrorCallback {
                override fun onWebRtcAudioRecordInitError(message: String) = listener.failed("Could not open the microphone. Check microphone access and try again.")
                override fun onWebRtcAudioRecordStartError(code: JavaAudioDeviceModule.AudioRecordStartErrorCode, message: String) = listener.failed("Could not start the microphone. Close other recording apps and try again.")
                override fun onWebRtcAudioRecordError(message: String) = listener.failed("The microphone stopped working. Try Voice again.")
            }).createAudioDeviceModule()
        module = device
        val engine = PeerConnectionFactory.builder().setAudioDeviceModule(device).createPeerConnectionFactory()
        factory = engine
        val constraints = MediaConstraints()
        source = engine.createAudioSource(constraints)
        track = engine.createAudioTrack("zyra-microphone", source)
        val config = PeerConnection.RTCConfiguration(emptyList()).apply { sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN }
        peer = engine.createPeerConnection(config, object : PeerConnection.Observer {
            override fun onSignalingChange(state: PeerConnection.SignalingState) {}
            override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {
                if (closed) return
                when (state) {
                    PeerConnection.IceConnectionState.CONNECTED, PeerConnection.IceConnectionState.COMPLETED -> listener.connected(true)
                    PeerConnection.IceConnectionState.DISCONNECTED -> listener.connected(false)
                    PeerConnection.IceConnectionState.FAILED -> listener.failed("Voice could not reach the audio service. Check this phone's internet connection.")
                    else -> Unit
                }
            }
            override fun onIceConnectionReceivingChange(receiving: Boolean) {}
            override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) { if (state == PeerConnection.IceGatheringState.COMPLETE) gathered.complete(Unit) }
            override fun onIceCandidate(candidate: IceCandidate) {}
            override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
            override fun onAddStream(stream: MediaStream) {}
            override fun onRemoveStream(stream: MediaStream) {}
            override fun onDataChannel(dataChannel: DataChannel) { if (!closed) listener.failed("Voice opened an unexpected event channel.") }
            override fun onRenegotiationNeeded() {}
            override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {
                if (!closed && receiver.track()?.kind() == "audio") listener.outputReady()
            }
        }) ?: error("Could not create the Voice connection.")
        check(peer!!.addTrack(track, listOf("zyra-voice")) != null) { "Could not connect the microphone." }
        channel = peer!!.createDataChannel("oai-events", DataChannel.Init())
        channel!!.registerObserver(object : DataChannel.Observer {
            override fun onBufferedAmountChange(previousAmount: Long) {}
            override fun onStateChange() {
                if (closed) return
                when (channel?.state()) {
                    DataChannel.State.OPEN -> listener.channel(true)
                    DataChannel.State.CLOSED -> listener.channel(false)
                    else -> Unit
                }
            }
            override fun onMessage(buffer: DataChannel.Buffer) {
                if (closed || buffer.binary) return
                if (buffer.data.remaining() > 128 * 1024) { listener.failed("Voice returned an oversized event."); return }
                val bytes = ByteArray(buffer.data.remaining()); buffer.data.get(bytes)
                listener.message(bytes.toString(Charsets.UTF_8))
            }
        })
    }

    override suspend fun offer(): String {
        try {
            initialize()
            val offer = suspendCancellableCoroutine<SessionDescription> { continuation ->
                peer!!.createOffer(object : DescriptionObserver() {
                    override fun onCreateSuccess(description: SessionDescription) { if (continuation.isActive) continuation.resume(description) }
                    override fun onCreateFailure(error: String) { if (continuation.isActive) continuation.resumeWithException(IllegalStateException("Could not create the Voice offer: $error")) }
                }, MediaConstraints())
            }
            setDescription(offer, true)
            withTimeoutOrNull(2500) { gathered.await() }
            check(!closed)
            return peer!!.localDescription.description
        } catch (error: Throwable) { close(); throw error }
    }
    override suspend fun answer(sdp: String) { check(!closed); setDescription(SessionDescription(SessionDescription.Type.ANSWER, sdp), false) }
    private suspend fun setDescription(description: SessionDescription, local: Boolean) = suspendCancellableCoroutine<Unit> { continuation ->
        val observer = object : DescriptionObserver() {
            override fun onSetSuccess() { if (continuation.isActive) continuation.resume(Unit) }
            override fun onSetFailure(error: String) { if (continuation.isActive) continuation.resumeWithException(IllegalStateException("Could not connect Voice: $error")) }
        }
        if (local) peer!!.setLocalDescription(observer, description) else peer!!.setRemoteDescription(observer, description)
    }
    override fun send(message: String): Boolean = !closed && channel?.state() == DataChannel.State.OPEN &&
        (channel?.bufferedAmount() ?: Long.MAX_VALUE) < 64 * 1024 && channel?.send(DataChannel.Buffer(ByteBuffer.wrap(message.toByteArray(Charsets.UTF_8)), false)) == true
    override fun mute(muted: Boolean) { if (!closed) track?.setEnabled(!muted) }
    override fun speaker(enabled: Boolean): Boolean = !closed && routing.speaker(enabled)
    override fun output(id: Int): Boolean = !closed && routing.select(id)
    @Suppress("DEPRECATION") override fun close() {
        if (closed) return
        closed = true
        routing.close()
        track?.setEnabled(false)
        channel?.unregisterObserver(); channel?.close(); channel?.dispose(); channel = null
        peer?.close(); peer?.dispose(); peer = null
        track?.dispose(); track = null; source?.dispose(); source = null
        factory?.dispose(); factory = null; module?.release(); module = null
        if (ownsFocus) {
            if (Build.VERSION.SDK_INT >= 31) audio.clearCommunicationDevice() else audio.isSpeakerphoneOn = previousSpeaker
            audio.mode = previousMode; audio.abandonAudioFocusRequest(focus); ownsFocus = false
        }
    }
    private open class DescriptionObserver : SdpObserver {
        override fun onCreateSuccess(description: SessionDescription) {}
        override fun onSetSuccess() {}
        override fun onCreateFailure(error: String) {}
        override fun onSetFailure(error: String) {}
    }
    companion object { private var initialized = false }
}
