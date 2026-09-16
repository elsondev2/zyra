package dev.zyra.mobile.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R
import dev.zyra.mobile.data.*

/** A local composition surface. Selecting a computer/project never creates an empty chat. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable fun NewChatScreen(state: MobileState, vm: MobileSession) {
    var selectedMachine by rememberSaveable { mutableStateOf<String?>(null) }
    var selectedProject by rememberSaveable { mutableStateOf<String?>(null) }
    var draft by rememberSaveable { mutableStateOf("") }
    var consumedRevision by rememberSaveable { mutableIntStateOf(state.newChatDraftRevision) }
    var machinePicker by remember { mutableStateOf(false) }
    var projectPicker by remember { mutableStateOf(false) }
    val attachments by vm.attachments.state.collectAsStateWithLifecycle()
    val dictationEnabled by vm.preferences.dictation.collectAsStateWithLifecycle()
    val machineId = NewChatDraft.machine(state.machines.map { it.id }, selectedMachine, state.machineFilter ?: state.machine?.id)
    val machine = state.machines.find { it.id == machineId }
    val paths = state.machineProjects[machineId].orEmpty()
    val mark: (String) -> ProjectMark? = { state.projectArtwork["$machineId:$it"] }
    val choices = projectChoices(paths, mark)
    val project = NewChatDraft.project(choices, selectedProject)
    val connected = state.machineStatus[machineId] == ConnectionState.Connected
    val composer = state.copy(machine = machine, session = SessionView(), draft = draft, busy = project == null,
        connection = if (connected) ConnectionState.Connected else ConnectionState.Offline)
    LaunchedEffect(machineId, paths) { machineId?.let { vm.loadProjectArtworkFor(it, paths.take(96)) } }
    LaunchedEffect(state.newChatDraftRevision) {
        if (consumedRevision != state.newChatDraftRevision) { draft = ""; consumedRevision = state.newChatDraftRevision }
    }
    fun enter(action: String) {
        if (machineId != null && project != null) vm.createFromDraft(machineId, project, draft, action)
    }
    Column(Modifier.fillMaxSize()) {
        NewChatTopBar(machine?.name ?: "Computer", vm::back) { machinePicker = true }
        NewChatWelcome(project?.let { if (isPersonalChat(it)) "No project" else projectLabel(it, mark(it)) },
            project?.takeUnless(::isPersonalChat)?.let(mark), project == null || isPersonalChat(project),
            if (paths.isEmpty()) { if (connected) "No projects available on this computer" else "Your projects will appear when this computer connects" } else null,
            { projectPicker = true }, Modifier.weight(1f))
        ChatComposerContent(composer, AttachmentState(optimize = attachments.optimize),
            ComposerActions({ draft = it.take(60000) }, { enter("send") }, {}, { enter("models") }, { enter("photos") }, vm.attachments::optimize,
                voice = { enter("voice") }, dictate = { enter("dictation") }, camera = { enter("camera") }, files = { enter("files") }), dictationEnabled = dictationEnabled, allowUnboundControls = true)
    }
    if (machinePicker) ZyraSheet("Computer", { machinePicker = false }) {
        state.machines.forEach { pc -> ZyraSettingRow(R.drawable.ic_monitor, pc.name,
            connectionLabel(state.machineStatus[pc.id] ?: ConnectionState.Offline),
            click = { if (selectedMachine != pc.id) selectedProject = null; selectedMachine = pc.id; machinePicker = false },
            trailing = { ZyraSelectionMark(pc.id == machineId) }) }
    }
    if (projectPicker) NewChatProjectPicker(machine?.name.orEmpty(), choices, project, mark, { projectPicker = false }) {
        selectedProject = it; projectPicker = false
    }
}

@Composable private fun NewChatProjectPicker(machine: String, projects: List<String>, selected: String?, artwork: (String) -> ProjectMark?, close: () -> Unit, select: (String) -> Unit) {
    var query by rememberSaveable { mutableStateOf("") }
    ZyraSheet("Project", close) {
        if (projects.size > 6) ZyraSearchField(query, { query = it }, "Find a project", Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
        val visible = projects.filter { query.isBlank() || projectLabel(it, artwork(it)).contains(query, true) }
        if (visible.isEmpty()) Text(if (query.isBlank()) "No projects available on $machine" else "No matching projects", Modifier.padding(20.dp), style = MaterialTheme.typography.bodyMedium)
        visible.forEach { project ->
            Row(Modifier.fillMaxWidth().clip(MaterialTheme.shapes.medium).clickable { select(project) }.padding(horizontal = 22.dp, vertical = 14.dp),
                verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (isPersonalChat(project)) AppIcon(R.drawable.ic_message_square, modifier = Modifier.size(20.dp)) else ProjectArtwork(artwork(project))
                Text(if (isPersonalChat(project)) "No project" else projectLabel(project, artwork(project)), Modifier.weight(1f), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                ZyraSelectionMark(selected == project)
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable fun NewChatTopBar(machine: String, back: () -> Unit, chooseMachine: () -> Unit) {
    TopAppBar(title = { Text("New chat", style = MaterialTheme.typography.titleLarge, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        navigationIcon = { IconButton(back) { AppIcon(R.drawable.ic_arrow_left, "Back") } },
        actions = {
            Surface(onClick = chooseMachine, shape = RoundedCornerShape(14.dp), color = MaterialTheme.colorScheme.surfaceContainer,
                modifier = Modifier.padding(end = 12.dp).widthIn(max = 170.dp)) {
                Row(Modifier.heightIn(min = 44.dp).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(7.dp)) {
                    AppIcon(R.drawable.ic_monitor, modifier = Modifier.size(17.dp))
                    Text(machine, Modifier.weight(1f, fill = false), style = MaterialTheme.typography.labelMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    AppIcon(R.drawable.ic_chevron_down, "Change computer", Modifier.size(12.dp))
                }
            }
        }, colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background))
}

@Composable fun NewChatWelcome(project: String?, artwork: ProjectMark?, personal: Boolean, notice: String?, chooseProject: () -> Unit, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth().padding(horizontal = 28.dp), verticalArrangement = Arrangement.Center, horizontalAlignment = Alignment.CenterHorizontally) {
        Text("What should we work on?", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(18.dp))
        Surface(onClick = chooseProject, shape = RoundedCornerShape(20.dp), border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant), color = MaterialTheme.colorScheme.surfaceContainer) {
            Row(Modifier.heightIn(min = 44.dp).padding(horizontal = 14.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                if (!personal) ProjectArtwork(artwork) else AppIcon(R.drawable.ic_message_square, modifier = Modifier.size(18.dp))
                Text(project ?: "Choose project", Modifier.weight(1f, fill = false), style = MaterialTheme.typography.labelLarge, maxLines = 1, overflow = TextOverflow.Ellipsis)
                AppIcon(R.drawable.ic_chevron_down, "Change project", Modifier.size(13.dp))
            }
        }
        if (notice != null) Text(notice, Modifier.padding(top = 14.dp), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}