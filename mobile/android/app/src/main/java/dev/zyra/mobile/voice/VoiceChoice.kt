package dev.zyra.mobile.voice

// Generated from Desktop instructor-voice-visuals by sync-desktop-design.mjs.
data class VoiceChoice(val id: String, val primary: Long, val secondary: Long, val highlight: Long, val frequency: Float, val phase: Float) {
    val name get() = id.replaceFirstChar { it.uppercase() }
    companion object {
        val all = listOf(
            VoiceChoice("arbor", 0xff35d39a, 0xff167a66, 0xffb9ffe6, 1.7f, 0.35f),
            VoiceChoice("breeze", 0xff55c7ff, 0xff3977e8, 0xffd8f5ff, 2.2f, 1.15f),
            VoiceChoice("cove", 0xff6c8cff, 0xff37d5d0, 0xffe4e9ff, 1.45f, 2.1f),
            VoiceChoice("ember", 0xffff795c, 0xffd63a67, 0xffffe0d6, 2.55f, 0.8f),
            VoiceChoice("juniper", 0xffb776ff, 0xff6f52e5, 0xfff0ddff, 1.9f, 2.75f),
            VoiceChoice("maple", 0xffffad45, 0xffd45f45, 0xffffe8bd, 1.6f, 1.65f),
            VoiceChoice("sol", 0xfff4d64e, 0xfff48736, 0xfffff7ba, 2.35f, 0.1f),
            VoiceChoice("spruce", 0xff5bd477, 0xff1f8f79, 0xffd7ffdf, 1.35f, 3.35f),
            VoiceChoice("vale", 0xff8c8dff, 0xffb65bd8, 0xffebe4ff, 2.05f, 2.35f))
        fun resolve(id: String?) = all.firstOrNull { it.id == id } ?: all.first { it.id == "cove" }
    }
}
