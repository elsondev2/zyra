package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.text.selection.SelectionContainer
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp

@Composable fun CapturedDetailScreen(state: MobileState, vm: MobileSession) {
    val action = state.detailAction
    var source by rememberSaveable(action?.item?.id) { mutableStateOf(false) }
    if (state.detailBusy) { Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }; return }
    if (action?.family == "read" || source) {
        Column(Modifier.fillMaxSize()) {
            if (action != null && action.target.isNotBlank()) Text(action.target, Modifier.padding(horizontal = 20.dp, vertical = 8.dp), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            if (source) TextButton({ source = false }) { Text("Show formatted") }
            FileCodePreview(state.detail.orEmpty(), action?.paths?.firstOrNull() ?: "output.txt", Modifier.weight(1f))
        }
    } else Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(20.dp), verticalArrangement = Arrangement.spacedBy(14.dp)) {
        if (action == null) SelectionContainer { Text(state.detail.orEmpty(), fontFamily = FontFamily.Monospace, style = MaterialTheme.typography.bodySmall) }
        else {
            WorkActionEvidence(action, full = true)
            if (action.family == "skill") TextButton({ source = true }) { Text("View captured source") }
        }
        MediaImages(state.detailMedia, vm)
    }
}
