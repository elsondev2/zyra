package dev.zyra.mobile.voice

enum class VoiceOutputKind { Speaker, Phone, Headphones }
data class VoiceAudioOutput(val id: Int, val name: String, val kind: VoiceOutputKind = VoiceOutputKind.Headphones) {
    val speaker get() = kind == VoiceOutputKind.Speaker
}
data class VoiceAudioOutputs(val available: List<VoiceAudioOutput> = emptyList(), val selected: Int? = null, val pending: Int? = null, val error: String? = null)
