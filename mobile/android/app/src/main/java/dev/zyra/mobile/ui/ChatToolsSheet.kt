package dev.zyra.mobile.ui

import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import androidx.lifecycle.compose.collectAsStateWithLifecycle

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun ChatToolsSheet(vm: MobileSession, state: MobileState, close: () -> Unit, settings: () -> Unit) {
    ZyraSheet("Chat tools", close) {
            ToolRow(R.drawable.ic_terminal, "Terminal") { close(); vm.openTerminal() }
            ToolRow(R.drawable.ic_git_branch, "Files & changes") { close(); vm.openWorkspace() }
            ZyraSettingRow(title = "Model & thinking", click = { close(); vm.loadModels() }, leading = { ThinkingGaugeIcon(state.session.config.thinking) })
            ToolRow(R.drawable.ic_sliders_horizontal, "Chat settings") { close(); settings() }
            HorizontalDivider(Modifier.padding(horizontal = 24.dp, vertical = 8.dp))
            ToolRow(R.drawable.ic_workflow, "Agents & workflows") { close(); vm.openFleet("agents") }

    }
}
@Composable private fun ToolRow(icon: Int, title: String, click: () -> Unit) { ZyraSettingRow(icon, title, click = click) }

