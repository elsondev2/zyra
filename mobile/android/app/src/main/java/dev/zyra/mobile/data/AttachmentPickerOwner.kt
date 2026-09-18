package dev.zyra.mobile.data

/** Identifies the exact chat surface that requested an external Android picker. */
data class AttachmentPickerOwner(val navigation: Int, val detailRevision: Int, val machine: String, val session: String) {
    fun accepts(navigation: Int, detailRevision: Int, machine: String?, session: String, page: String, busy: Boolean): Boolean =
        !busy && page == "chat" && this.navigation == navigation && this.detailRevision == detailRevision &&
            this.machine == machine && this.session == session
}
