package dev.zyra.mobile.ui

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

data class PluginDetailsActions(val refresh: () -> Unit, val state: (Boolean) -> Unit, val version: (String) -> Unit, val confirm: () -> Unit, val cancel: () -> Unit)
@Composable fun PluginDetailsScreen(controller: PluginDetailsController, connected: Boolean, machine: String) {
    val state by controller.state.collectAsStateWithLifecycle()
    val actions=PluginDetailsActions(controller::refresh,controller::reviewState,controller::reviewVersion,controller::confirm,controller::cancelReview)
    PluginDetailsContent(state,connected,machine,actions)
    state.review?.let { review -> ZyraSheet(pluginChangeTitle(review),actions.cancel,footer={PluginChangeFooter(state,connected,actions)}) { PluginChangeContent(review,state.error) } }
}
@Composable fun PluginDetailsContent(state: PluginDetailsState, connected: Boolean, machine: String, actions: PluginDetailsActions) {
    val detail=state.detail
    var allSkills by remember(detail?.plugin?.id) { mutableStateOf(false) }
    val ready=connected && !state.busy && !state.saving && !state.needsRefresh
    LazyColumn(Modifier.fillMaxSize(),contentPadding=PaddingValues(20.dp),verticalArrangement=Arrangement.spacedBy(18.dp)) {
        item { Row(verticalAlignment=Alignment.CenterVertically,horizontalArrangement=Arrangement.spacedBy(12.dp)) {
            PluginStoreIcon(detail?.plugin?.name.orEmpty(),Modifier.size(52.dp))
            Column(Modifier.weight(1f),verticalArrangement=Arrangement.spacedBy(4.dp)) {
                Text(detail?.plugin?.title ?: "Plugin details",style=MaterialTheme.typography.headlineSmall)
                Text("On $machine",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            }
            IconButton(actions.refresh,enabled=connected && !state.busy && !state.saving) {
                if(state.busy) CircularProgressIndicator(Modifier.size(20.dp),strokeWidth=2.dp)
                else AppIcon(R.drawable.ic_refresh_cw,"Refresh Plugin",Modifier.size(20.dp))
            }
        } }
        state.error?.let { error -> item { Text(error,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall) } }
        state.notice?.let { notice -> item { Text(notice,color=MaterialTheme.colorScheme.primary,style=MaterialTheme.typography.bodySmall) } }
        if(!connected) item { Text("Reconnect to this PC to manage the Plugin.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant) }
        if(detail!=null) {
            item { Text(detail.release.description,style=MaterialTheme.typography.bodyLarge) }
            item { Surface(shape=MaterialTheme.shapes.large,color=MaterialTheme.colorScheme.surfaceContainer) {
                ZyraSettingRow(title="Enabled on this PC",subtitle=if(detail.manageMachine) "${detail.plugin.version} · ${detail.plugin.state.replaceFirstChar { it.uppercase() }}" else "This phone can view this Plugin. Changes require access to all projects.",
                    trailing={ZyraSwitch(detail.plugin.state=="active",actions.state,enabled=ready && detail.manageMachine)})
            } }
            item { Text("Skills",style=MaterialTheme.typography.titleMedium) }
            if(detail.release.skills.isEmpty()) item { Text("This version has no chat skills.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant) }
            items(if(allSkills) detail.release.skills else detail.release.skills.take(3)) { (name,description) ->
                Column(verticalArrangement=Arrangement.spacedBy(4.dp)) {
                    Text(name,style=MaterialTheme.typography.titleSmall)
                    if(description.isNotBlank()) Text(description,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
                }
            }
            if(detail.release.skills.size>3) item { TextButton({allSkills=!allSkills}) { Text(if(allSkills) "Show fewer skills" else "Show all ${detail.release.skills.size} skills") } }
            if(detail.release.capabilities.isNotEmpty()) item { Column(verticalArrangement=Arrangement.spacedBy(8.dp)) {
                Text("Declared capabilities",style=MaterialTheme.typography.titleMedium)
                Text(detail.release.capabilities.joinToString("\n"),style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            } }
            item { HorizontalDivider(color=MaterialTheme.colorScheme.outlineVariant) }
            item { Column(verticalArrangement=Arrangement.spacedBy(6.dp)) {
                Text("Saved versions",style=MaterialTheme.typography.titleMedium)
                Text("Restoring a version changes what new chats use. Existing chats keep their saved versions.",style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            } }
            items(detail.releases,key={it.id}) { release ->
                Surface(shape=MaterialTheme.shapes.medium,color=MaterialTheme.colorScheme.surfaceContainer) {
                    ZyraSettingRow(R.drawable.ic_archive,release.version,pluginDate(release.installedAt),click=if(ready && !release.current) ({actions.version(release.id)}) else null,
                        trailing={if(release.current) Text("Current",style=MaterialTheme.typography.labelSmall,color=MaterialTheme.colorScheme.primary) else AppIcon(R.drawable.ic_chevron_right,modifier=Modifier.size(16.dp))})
                }
            }
        }
    }
}
fun pluginChangeTitle(review: PluginChangeReview) = if(!review.detail.manageMachine) "Saved version" else if(review.action=="rollback") "Restore saved version" else if(review.targetState=="active") "Enable Plugin" else "Disable Plugin"
@Composable fun PluginChangeContent(review: PluginChangeReview, error: String? = null) {
    val detail=review.detail
    Column(Modifier.padding(horizontal=20.dp),verticalArrangement=Arrangement.spacedBy(16.dp)) {
        Text(detail.plugin.title,style=MaterialTheme.typography.titleMedium)
        Text(when {
            !detail.manageMachine -> "Version ${detail.release.version} is saved on this PC. Restoring it requires access to all projects."
            review.action=="rollback" -> "Restore ${detail.release.version} in place of ${detail.plugin.version} on this PC. Existing chats keep their saved versions.${if(detail.plugin.state=="disabled") " This Plugin will remain disabled." else ""}"
            review.targetState=="disabled" -> "This makes the Plugin unavailable to chats on this PC and removes it from new-chat defaults. Enabling it again will not restore those default selections."
            else -> "Existing chats can use their saved versions again. Add the Plugin to new-chat defaults separately."
        },style=MaterialTheme.typography.bodyMedium)
        error?.let { Text(it,color=MaterialTheme.colorScheme.error,style=MaterialTheme.typography.bodySmall) }
        if(review.action=="rollback") {
            if(detail.release.description.isNotBlank()) Text(detail.release.description,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            Text("${detail.release.skills.size} ${if(detail.release.skills.size==1) "skill" else "skills"} in this version",style=MaterialTheme.typography.labelLarge)
            detail.release.skills.forEach { (name,description) -> Column(verticalArrangement=Arrangement.spacedBy(3.dp)) {
                Text(name,style=MaterialTheme.typography.titleSmall)
                if(description.isNotBlank()) Text(description,style=MaterialTheme.typography.bodySmall,color=MaterialTheme.colorScheme.onSurfaceVariant)
            } }
            if(detail.release.capabilities.isNotEmpty()) {
                Text("Declared capabilities",style=MaterialTheme.typography.labelLarge)
                Text(detail.release.capabilities.joinToString("\n"),style=MaterialTheme.typography.bodySmall)
            }
            if(detail.release.executableFiles) Text("This package includes executable files.",style=MaterialTheme.typography.bodySmall)
        }
    }
}
@Composable fun PluginChangeFooter(state: PluginDetailsState, connected: Boolean, actions: PluginDetailsActions) {
    val review=state.review?:return
    when {
        !review.detail.manageMachine -> ZyraOutlinedButton(actions.cancel,Modifier.fillMaxWidth()) { Text("Done") }
        state.needsRefresh -> ZyraOutlinedButton(actions.refresh,Modifier.fillMaxWidth(),connected && !state.busy && !state.saving) { Text("Refresh and review again") }
        else -> ZyraButton(actions.confirm,Modifier.fillMaxWidth(),connected && !state.busy && !state.saving) { Text(if(state.saving) "Applying…" else if(review.action=="rollback") "Restore ${review.detail.release.version}" else if(review.targetState=="active") "Enable on PC" else "Disable on PC") }
    }
}
private fun pluginDate(value: String): String? = runCatching { DateTimeFormatter.ofPattern("d MMM yyyy").withZone(ZoneId.systemDefault()).format(Instant.parse(value)) }.getOrNull()
