package dev.zyra.mobile.data

/** A new conversation has no server identity until the user sends or opens a tool. */
object NewChatDraft {
    val tools = setOf("models", "photos", "camera", "files", "voice", "dictation")

    fun machine(available: List<String>, selected: String?, preferred: String?): String? =
        selected?.takeIf { it in available } ?: preferred?.takeIf { it in available } ?: available.firstOrNull()

    fun project(available: List<String>, selected: String?): String? =
        selected?.takeIf { it in available }
            ?: available.firstOrNull { it.isBlank() || it.replace('\\', '/').trimEnd('/').endsWith("/assistant/global-workspace") }
            ?: available.firstOrNull()

    /** A late attachment must never send into another chat, a dismissed page, or edited draft. */
    fun canContinue(opening: Int, current: Int, machine: String?, currentMachine: String?, page: String,
        session: String, error: String?, submitted: String, draft: String): Boolean =
        opening == current && machine != null && machine == currentMachine && page == "chat" &&
            session.isNotBlank() && error == null && submitted == draft
}
