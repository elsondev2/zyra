package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ConnectionState

@Composable fun PluginMachineSheet(state: MobileState, close: () -> Unit, select: (String) -> Unit, manage: () -> Unit) {
    ZyraSheet("Plugins on", close) { PluginMachineRows(state, select, manage) }
}
@Composable fun ColumnScope.PluginMachineRows(state: MobileState, select: (String) -> Unit, manage: () -> Unit) {
    state.machines.forEach { machine ->
        ZyraSettingRow(R.drawable.ic_monitor, machine.name, connectionLabel(state.machineStatus[machine.id] ?: ConnectionState.Offline),
            click = { select(machine.id) }, trailing = { if (machine.id == state.machine?.id) AppIcon(R.drawable.ic_check, "Selected", Modifier.size(18.dp)) })
    }
    if (state.machines.isEmpty()) ZyraSettingRow(R.drawable.ic_monitor, "Connect a computer", "See the Plugins installed on your PC", click = manage)
}
