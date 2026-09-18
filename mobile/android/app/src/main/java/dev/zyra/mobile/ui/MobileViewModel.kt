package dev.zyra.mobile.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import dev.zyra.mobile.ZyraApplication

/** Activity owner only. Call/session state has no reference to this ViewModel. */
class MobileViewModel(app: Application) : AndroidViewModel(app) {
    private val lease = (app as ZyraApplication).sessions.acquire()
    val session = lease.value
    override fun onCleared() { lease.close(); super.onCleared() }
}