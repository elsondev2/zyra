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
import dev.zyra.mobile.data.capturedEdit
import dev.zyra.mobile.data.capturedEditRows
import dev.zyra.mobile.data.CapturedEdit
import dev.zyra.mobile.data.WorkAction

@Composable fun CapturedDetailScreen(state: MobileState, vm: MobileSession) {
    val action = state.detailAction
    var source by rememberSaveable(action?.item?.id) { mutableStateOf(false) }
    if (state.detailBusy) { Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) { CircularProgressIndicator(Modifier.size(24.dp), strokeWidth = 2.dp) }; return }
    val edit = remember(action?.family, action?.item?.raw) { if (action?.family == "edit") capturedEdit(action.item.raw) else null }
    if (edit != null && action != null && !source) {
        CapturedEditContent(action, edit)
    } else if (action?.family == "read" || source) {
        Column(Modifier.fillMaxSize()) {
            if (action != null && action.target.isNotBlank()) CapturedPathRow(action.target, Modifier.padding(start = 20.dp, end = 8.dp))
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

@Composable internal fun CapturedEditContent(action: WorkAction, edit: CapturedEdit) {
    Column(Modifier.fillMaxSize()) {
        if (action.target.isNotBlank()) CapturedPathRow(action.target, Modifier.padding(start = 20.dp, end = 8.dp))
        val rows = remember(edit) { capturedEditRows(edit) }
        GitDiffContent(edit.text, action.paths.size == 1, Modifier.weight(1f), capturedRows = rows)
    }
}
