package dev.zyra.mobile.ui

import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.Pairing
import kotlinx.coroutines.delay

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun SetupSheet(state: MobileState, incoming: String, consumed: () -> Unit, pair: (String) -> Unit, cancel: () -> Unit, finished: () -> Unit) {
    val adding = rememberSaveable { state.machines.isNotEmpty() }
    var step by rememberSaveable { mutableStateOf(if (adding) "connect" else "welcome") }
    var link by remember { mutableStateOf("") }
    var localError by remember { mutableStateOf<String?>(null) }
    var manual by rememberSaveable { mutableStateOf(false) }
    var submitted by rememberSaveable { mutableStateOf(false) }
    val initialRevision = rememberSaveable { state.pairingRevision }
    val preview = remember(link) { runCatching { Pairing.parse(link) }.getOrNull() }
    val pairingNow by rememberUpdatedState(state.pairingBusy)
    LaunchedEffect(link) {
        if (preview != null) { delay((preview.expiresAt - System.currentTimeMillis()).coerceAtLeast(0)); if (!pairingNow) { link = ""; step = "connect"; localError = "This code expired. Create a new code on your PC, then scan again." } }
    }
    val complete = submitted && state.pairingRevision > initialRevision && !state.pairingBusy
    val duration = if (LocalReduceMotion.current) 0 else 220
    val sheet = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { it != SheetValue.Hidden || complete || (adding && !pairingNow) })
    fun accept(value: String) {
        runCatching { Pairing.parse(value) }.onSuccess { link = value; step = "confirm"; localError = null }
            .onFailure { localError = it.message; step = "connect" }
    }
    LaunchedEffect(incoming) { if (incoming.isNotBlank()) { accept(incoming); consumed() } }
    LaunchedEffect(complete) { if (complete) { step = "done"; link = ""; localError = null } }
    fun goBack() { if (!state.pairingBusy) { if (complete) finished() else if (adding && step in listOf("connect", "welcome")) cancel() else step = when (step) { "scan", "confirm" -> "connect"; else -> "welcome" } } }
    BackHandler { goBack() }
    ModalBottomSheet(onDismissRequest = { if (complete) finished() else if (adding && !state.pairingBusy) cancel() }, sheetState = sheet, sheetMaxWidth = 640.dp, sheetGesturesEnabled = false,
        dragHandle = null, containerColor = MaterialTheme.colorScheme.background,
        properties = ModalBottomSheetProperties(shouldDismissOnBackPress = false)) {
        Column(Modifier.fillMaxHeight(0.98f).imePadding()) {
            Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (step != "welcome" && step != "done") IconButton(onClick = { goBack(); localError = null }, enabled = !state.pairingBusy) { AppIcon(R.drawable.ic_arrow_left, "Previous step") }
                Text("Zyra", style = MaterialTheme.typography.titleLarge, modifier = Modifier.weight(1f))
                Text(when (step) { "welcome" -> "Welcome"; "done" -> "Ready"; else -> "Connect your PC" }, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                if (adding && !complete) IconButton(onClick = cancel, enabled = !state.pairingBusy) { AppIcon(R.drawable.ic_x, "Cancel adding computer") }
            }
            AnimatedContent(targetState = step, transitionSpec = { fadeIn(tween(duration)) togetherWith fadeOut(tween(duration / 2)) }, label = "Setup step", modifier = Modifier.weight(1f)) { visible ->
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 24.dp, vertical = 24.dp), verticalArrangement = Arrangement.spacedBy(20.dp)) {
                    when (visible) {
                        "welcome" -> {
                            Spacer(Modifier.height(24.dp))
                            Text("Pick up where\nyou left off.", style = MaterialTheme.typography.headlineLarge)
                            Text("Bring your PC’s chats, agents and workspace with you.", style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(Modifier.height(16.dp))
                            SetupBenefit(R.drawable.ic_message_square, "Your conversations", "Continue the same chats on your phone.")
                            SetupBenefit(R.drawable.ic_monitor, "Your computer does the work", "Review changes, approve actions and use its terminal.")
                            SetupBenefit(R.drawable.ic_shield_check, "A direct connection", "Pair on the same Wi-Fi. No account or cloud setup.")
                        }
                        "connect" -> {
                            Text("Connect your PC", style = MaterialTheme.typography.headlineMedium)
                            Text("Keep your phone and computer on the same Wi-Fi.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            SetupBenefit(R.drawable.ic_settings, "Open Zyra on your computer", "Settings → Connections → Pair phone")
                            SetupBenefit(R.drawable.ic_qr_code, "Scan its pairing code", "Your workspace is set up automatically.")
                            if (manual) ZyraTextField(link, { link = it; localError = null }, label = { Text("Pairing link") }, placeholder = { Text("Paste the link from Zyra on your PC") }, maxLines = 4, modifier = Modifier.fillMaxWidth())
                            TextButton(onClick = { manual = !manual }) { AppIcon(R.drawable.ic_link); Spacer(Modifier.width(8.dp)); Text(if (manual) "Use the camera instead" else "Use a pairing link instead") }
                        }
                        "scan" -> {
                            Text("Scan the code", style = MaterialTheme.typography.headlineMedium)
                            Text("Point your camera at the QR code in Zyra on your PC.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                            PairingScanner { accept(it) }
                            TextButton(onClick = { manual = true; step = "connect" }) { Text("Paste a link instead") }
                        }
                        "confirm" -> {
                            Text("Is this your computer?", style = MaterialTheme.typography.headlineMedium)
                            AppIcon(R.drawable.ic_monitor, modifier = Modifier.size(48.dp))
                            Text(preview?.name ?: "Pairing code expired", style = MaterialTheme.typography.titleLarge)
                            Text(preview?.url.orEmpty(), color = MaterialTheme.colorScheme.onSurfaceVariant)
                            Text("This phone can access shared chats, approve actions and run commands on this PC.", style = MaterialTheme.typography.bodyMedium)
                            TextButton(onClick = { step = "scan"; link = ""; localError = null }) { Text("Scan a different code") }
                        }
                        "done" -> {
                            Spacer(Modifier.height(32.dp))
                            AppIcon(R.drawable.ic_check, modifier = Modifier.size(48.dp))
                            Text("Your PC is paired.", style = MaterialTheme.typography.headlineLarge)
                            Text(state.machine?.name.orEmpty(), style = MaterialTheme.typography.titleMedium)
                            Text("Open your chats to continue. Keep Zyra running on your computer.", color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                    (localError ?: state.pairingError)?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
                }
            }
            Column(Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                ZyraButton(onClick = {
                    when (step) {
                        "welcome" -> step = "connect"
                        "connect" -> if (manual) accept(link) else step = "scan"
                        "confirm" -> { submitted = true; pair(link) }
                        "done" -> finished()
                        "scan" -> { manual = true; step = "connect" }
                    }
                }, enabled = !state.pairingBusy && (step != "confirm" || preview != null) && (step != "connect" || !manual || link.isNotBlank()), modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp)) {
                    if (state.pairingBusy) { CircularProgressIndicator(Modifier.size(18.dp), strokeWidth = 2.dp, color = MaterialTheme.colorScheme.onPrimary); Spacer(Modifier.width(10.dp)) }
                    Text(if (state.pairingBusy) "Connecting…" else when (step) { "welcome" -> "Connect your PC"; "connect" -> if (manual) "Continue" else "Scan QR code"; "confirm" -> "Connect to this PC"; "done" -> "Open my chats"; else -> "Use a pairing link" })
                }
                if (step == "welcome") Text("Already paired? Your computer reconnects automatically.", modifier = Modifier.fillMaxWidth(), textAlign = TextAlign.Center, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
@Composable private fun SetupBenefit(icon: Int, title: String, description: String) {
    Row(horizontalArrangement = Arrangement.spacedBy(16.dp), modifier = Modifier.padding(vertical = 6.dp)) {
        AppIcon(icon, modifier = Modifier.padding(top = 2.dp))
        Column(verticalArrangement = Arrangement.spacedBy(5.dp)) { Text(title, style = MaterialTheme.typography.titleMedium); Text(description, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}
