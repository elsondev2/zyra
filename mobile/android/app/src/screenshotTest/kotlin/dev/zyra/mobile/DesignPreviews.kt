package dev.zyra.mobile

import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.viewinterop.AndroidView
import com.android.tools.screenshot.PreviewTest
import dev.zyra.mobile.data.*
import dev.zyra.mobile.ui.*

private val noop = ChatListActions({}, {}, {}, {}, { _, _, _ -> })
@PreviewTest @Preview(name = "Terminal sessions narrow", widthDp = 320, heightDp = 640, fontScale = 1.3f)
@Composable fun TerminalListPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { TerminalListContent(TerminalWorkspaceState(terminals = listOf(RemoteTerminal("a", "Development server", "", "running"), RemoteTerminal("b", "Review changes", "", "exited")), connected = true), {}, {}, {}) } } }
@PreviewTest @Preview(name = "Two native terminal panes", widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun TerminalPanesPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize()) {
    TextButton({}) { AppIcon(R.drawable.ic_arrow_left); Spacer(Modifier.width(8.dp)); Text("All terminals") }
    listOf("Development server" to "Server ready on port 3000", "Review changes" to "Working tree is clean").forEachIndexed { i, (title, text) ->
        TerminalPaneContent(TerminalState(selected = "$i", connected = true, finished = i == 1), title, TerminalPaneActions({}, {}, {}, {}, {}, {}), Modifier.weight(1f)) { bounds ->
            val colors = MaterialTheme.colorScheme
            AndroidView(factory = { context -> RemoteTerminalWidget(context) {}.also {
                it.theme(colors.background.toArgb(), colors.onSurface.toArgb(), colors.primary.toArgb())
                it.frame(TerminalFrame("\u001b[2J\u001b[H\u001b[32m$text\u001b[0m\r\n\r\n> ", 0, 44, 10))
            } }, modifier = bounds)
        }
        if (i == 0) HorizontalDivider()
    }
} } } }
@PreviewTest @Preview(name = "Voice strands fallback", widthDp = 320, heightDp = 250)
@Composable fun VoiceFallbackPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.Center) {
    StrandFallback(dev.zyra.mobile.voice.VoiceChoice.resolve("cove"), true, androidx.compose.runtime.remember { androidx.compose.runtime.mutableFloatStateOf(1f) }, Modifier.size(176.dp))
} } } }
private fun workPreview(running: Boolean) = ChatRailRow.Work("work:preview", listOf(
    TimelineItem("thought", "assistant", "", reasoning = "Checking the spacing and the narrow layout."),
    TimelineItem("tool:one", "tool", "bash\nAll checks passed", "tool", pending = running),
    TimelineItem("tool:two", "tool", "read\nThe updated layout", "tool")), running, !running, listOf(
    WorkAction(TimelineItem("tool:one", "tool", "bash\nAll checks passed", "tool", pending = running), "Running tests", "command", "", "npm test", "All checks passed", false, "Verify the layout"),
    WorkAction(TimelineItem("tool:two", "tool", "read\nThe updated layout", "tool"), "Reading layout.kt", "read", "app/layout.kt", "", "The updated layout", false, "Verify the layout")))
@PreviewTest @Preview(name = "Work completed", widthDp = 360, heightDp = 580)
@Composable fun WorkCompletedPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
    TimelineMessage(TimelineItem("user", "user", "Make the layout fit the phone.")) {}
    TimelineWorkSummary(workPreview(false), {})
    TimelineMessage(TimelineItem("answer", "assistant", "The layout now fits the phone.\n\n- Controls stay within reach.\n- Long messages wrap cleanly.\n- Your existing drafts stay saved.")) {}
} } } }
@PreviewTest @Preview(name = "Work active narrow", widthDp = 320, heightDp = 580, fontScale = 1.3f)
@Composable fun WorkActivePreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) { TimelineWorkSummary(workPreview(true), {}) } } } }
@PreviewTest @Preview(name = "Work Paper Light", widthDp = 320, heightDp = 580, fontScale = 1.15f)
@Composable fun WorkLightPreview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp)) { TimelineWorkSummary(workPreview(true), {}) } } } }
@PreviewTest @Preview(name = "Composer empty", widthDp = 320, heightDp = 180)
@Composable fun ComposerEmptyPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    ChatComposerContent(MobileState(connection = ConnectionState.Connected), AttachmentState(), ComposerActions({}, {}, {}, {}, {}, {}))
} } } }
@PreviewTest @Preview(name = "Action output and failure", widthDp = 320, heightDp = 620, fontScale = 1.15f)
@Composable fun ActionOutputPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
    TimelineActionContent(workPreview(false).actions.first(), false, true, {}, {})
    TimelineActionContent(workPreview(false).actions.last().copy(failed = true, output = "This file could not be read. Check that it still exists."), false, true, {}, {})
} } } }
private val pluginNoop = PluginActions({}, {}, {}, {}, {}, {}, {}, {})
private val storeNoop = PluginStoreActions({}, {}, {}, {}, {}, {}, {}, {}, {})
private val detailNoop = PluginDetailsActions({}, {}, {}, {}, {})
private fun pluginDetailPreview(): PluginDetails {
    val release = PluginReleaseInfo("v2", "2.0", "digest", "2026-09-14T08:00:00Z", "Tools to bring design decisions into your development work.", 8, 100000, false,
        listOf("Design to code" to "Build an interface using the project’s existing components."), listOf("filesystem.read"), listOf("skills" to "supported"))
    val plugin = InstalledPluginInfo("design", "figma", "Figma", "active", "2.0", "v2", "official")
    return PluginDetails(4, true, plugin, release, listOf(SavedPluginVersion("v2", "2.0", "2026-09-14T08:00:00Z", true), SavedPluginVersion("v1", "1.0", "2026-09-10T08:00:00Z", false)))
}
@PreviewTest @Preview(name = "Plugin details narrow", widthDp = 320, heightDp = 800, fontScale = 1.15f)
@Composable fun PluginDetailsPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { PluginDetailsContent(PluginDetailsState("design", pluginDetailPreview()), true, "Workstation", detailNoop) } } }
@PreviewTest @Preview(name = "Plugin disable review", widthDp = 320, heightDp = 620, fontScale = 1.3f)
@Composable fun PluginDisablePreview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    val detail=pluginDetailPreview();val review=PluginChangeReview("state",detail,"disabled");val state=PluginDetailsState("design",detail,review=review)
    ZyraSheetContent(pluginChangeTitle(review),{},footer={PluginChangeFooter(state,true,detailNoop)}) { PluginChangeContent(review) }
} } } }
@PreviewTest @Preview(name = "Plugin rollback review", widthDp = 320, heightDp = 740, fontScale = 1.15f)
@Composable fun PluginRollbackPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    val original=pluginDetailPreview();val detail=original.copy(plugin=original.plugin.copy(state="disabled"),release=original.release.copy(id="v1",version="1.0"))
    val review=PluginChangeReview("rollback",detail);val state=PluginDetailsState("design",detail,review=review)
    ZyraSheetContent(pluginChangeTitle(review),{},footer={PluginChangeFooter(state,true,detailNoop)}) { PluginChangeContent(review) }
} } } }
private fun storePreview() = PluginStoreState(loaded = true, catalog = PluginStoreCatalog(manageMachine = true, entries = listOf(
    StorePlugin("figma", "Figma", "Bring designs into your work", "Connect your design work with the conversation. Review the available skills before adding them to your PC.", "2.0", "Figma", "Design", "MIT", "", true, true, listOf("Skills")),
    StorePlugin("github", "GitHub", "Plan and review changes", "", "1.0", "GitHub", "Development", "MIT", "", true, true, listOf("Skills"), "1.0", "disabled"))))
@PreviewTest @Preview(name = "Plugin Store narrow", widthDp = 320, heightDp = 740, fontScale = 1.15f)
@Composable fun PluginStorePreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { PluginStoreContent(storePreview(), true, storeNoop) } } }
@PreviewTest @Preview(name = "Plugin download narrow", widthDp = 320, heightDp = 740, fontScale = 1.3f)
@Composable fun PluginDownloadPreview() { val state = storePreview(); ZyraTheme(Appearance(mode = "dark")) { Surface {
    PluginProductContent(state.copy(selected = state.catalog.entries.first(), download = PluginDownload("d", "downloading", "downloading", 50000, 100000, 4, 8)), true, storeNoop)
} } }
@PreviewTest @Preview(name = "Plugin install review", widthDp = 320, heightDp = 800, fontScale = 1.15f)
@Composable fun PluginInstallPreview() { val state = storePreview(); ZyraTheme(Appearance(mode = "light")) { Surface {
    PluginProductContent(state.copy(selected = state.catalog.entries.first(), download = PluginDownload("d", "ready", review = PluginInstallReview("review", "2099-01-01T12:00:00Z", "Figma", "2.0", "digest", "", 8, 100000, false, listOf("filesystem.read"), 1, listOf("Design to code" to "Implement a design using the project's existing components."), listOf("skills" to "supported"), 0))), true, storeNoop)
} } }
private fun pluginPreviewState(): PluginsState {
    val current = ChatPlugin("design", "Interface design", "1.1", "r1", "active")
    val next = current.copy(version = "1.2", releaseId = "r2")
    val catalog = PluginCatalog(revision = 4, defaultsRevision = 2, defaultIds = setOf("design"), defaults = listOf(next), current = listOf(current),
        plugins = listOf(AvailablePlugin("design", "Interface design", "Thoughtful interfaces, clear hierarchy and useful details.", "1.2", "active", true, 3, listOf("skills" to "supported")),
            AvailablePlugin("research", "Research companion", "Find and compare primary sources.", "2.0", "active", true, 2, emptyList())), manageDefaults = true, total = 2)
    return PluginsState(loaded = true, catalog = catalog, selection = catalog.defaultIds, editRevision = 2, reviewCatalog = catalog)
}
@PreviewTest @Preview(name = "Plugins narrow", widthDp = 320, heightDp = 800, fontScale = 1.15f)
@Composable fun PluginsNarrow() { ZyraTheme(Appearance(mode = "dark")) { Surface { PluginsContent(pluginPreviewState(), true, "Workstation", pluginNoop) } } }
@PreviewTest @Preview(name = "Plugin defaults narrow", widthDp = 320, heightDp = 660, fontScale = 1.3f)
@Composable fun PluginDefaultsPreview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    val state = pluginPreviewState().copy(editing = true)
    ZyraSheetContent("New chat defaults", {}, footer = { PluginDefaultsFooter(state, true, pluginNoop) }) { PluginDefaultsContent(state, true, pluginNoop) }
} } } }
@PreviewTest @Preview(name = "Plugin review narrow", widthDp = 320, heightDp = 640, fontScale = 1.3f)
@Composable fun PluginReviewPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    ZyraSheetContent("Update this chat", {}, footer = { ZyraButton({}, Modifier.fillMaxWidth()) { Text("Use these versions") } }) { PluginReviewContent(pluginPreviewState().copy(reviewing = true)) }
} } } }
@PreviewTest @Preview(name = "Chat preferences", widthDp = 320, heightDp = 620, fontScale = 1.15f)
@Composable fun ChatPreferencesPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column {
    val state = ChatPreferencesState(loaded = true, profile = "friendly", memoryMode = "disabled", profiles = listOf(
        SpeakingStyle("concise", "Concise speaking style"), SpeakingStyle("friendly", "Friendly speaking style")))
    ChatPersonalization(state, true, "friendly", {}, {}, {})
    HorizontalDivider(Modifier.padding(vertical = 16.dp))
    SpeakingStyles(state, true, {})
} } } }
private fun chats() = MobileState(initialized = true, machine = Machine("pc", "phone", "Workstation", "https://192.0.2.1", "", ""),
    machines = listOf(Machine("pc", "phone", "Workstation", "https://192.0.2.1", "", "")),
    connection = ConnectionState.Connected, page = "chats", chats = listOf(
        Chat("one", "An idea worth exploring", "", "detached", null, false, "pc", model = "openai-codex/gpt-6-astra"),
        Chat("two", "Review the navigation changes", "/projects/zyra", "running", null, false, "pc", model = "openai-codex/gpt-6-astra", tuiOpen = true),
        Chat("three", "A quieter command palette", "/projects/zyra", "detached", "approval", false, "pc", model = "openai-codex/gpt-5.6-sol"),
        Chat("four", "Make the weekly report easier to read", "/projects/reports", "detached", null, false, "pc")))

@PreviewTest @Preview(name = "Chats dark", widthDp = 390, heightDp = 720)
@Composable fun ChatsDark() { val appearance = Appearance(mode = "dark"); ZyraTheme(appearance) { Surface { ChatsContent(chats(), appearance, noop) } } }
@PreviewTest @Preview(name = "Chats narrow light", widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun ChatsNarrowLight() { val appearance = Appearance(mode = "light"); ZyraTheme(appearance) { Surface { ChatsContent(chats(), appearance, noop) } } }
@PreviewTest @Preview(name = "Conversation", widthDp = 390, heightDp = 780)
@Composable fun Conversation() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
    TimelineMessage(TimelineItem("u", "user", "Can you make this feel like the desktop, while keeping it comfortable on my phone?")) {}
    TimelineTool(TimelineItem("t", "tool", "Read design tokens\nChecked the desktop surfaces, spacing and typography.", "tool")) {}
    TimelineMessage(TimelineItem("a", "assistant", "The chat now uses the same visual hierarchy.\n\n- Your messages stay together in a quiet bubble.\n- Replies have room to breathe.\n- Tools stay compact until you need the detail.\n\n```kotlin\nval appearance = Appearance(mode = \"system\")\n```", reasoning = "Reviewed the existing desktop components.")) {}
} } } }
@PreviewTest @Preview(name = "Appearance light", widthDp = 390, heightDp = 800)
@Composable fun AppearanceLight() { val value = Appearance(mode = "light"); ZyraTheme(value) { Surface { AppearanceScreen(value, {}) } } }
@PreviewTest @Preview(name = "Controls dark", widthDp = 320, heightDp = 500, fontScale = 1.3f)
@Composable fun ControlsDark() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
    ZyraSearchField("", {}, "Search conversations", Modifier.fillMaxWidth())
    ZyraSegments(listOf("all" to "All machines", "pc" to "Workstation"), "all", {})
    ZyraSettingRow(title = "Reduce motion", trailing = { ZyraSwitch(true, {}) })
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { AppIcon(R.drawable.ic_terminal); AppIcon(R.drawable.ic_square_pen); AppIcon(R.drawable.ic_folder_open); AppIcon(R.drawable.ic_sliders_horizontal) }
    ZyraButton(onClick = {}, shape = MaterialTheme.shapes.medium) { Text("Continue") }
} } } }
@PreviewTest @Preview(name = "About dark", widthDp = 390, heightDp = 640)
@Composable fun AboutDark() { ZyraTheme(Appearance(mode = "dark")) { Surface { AboutScreen {} } } }

@PreviewTest @Preview(name = "Inputs narrow", widthDp = 320, heightDp = 580, fontScale = 1.3f)
@Composable fun InputsNarrow() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
    ZyraTextField("", {}, label = { Text("Your answer") }, placeholder = { Text("Write a response") }, modifier = Modifier.fillMaxWidth())
    ZyraSettingRow(title = "Use the existing project", trailing = { ZyraSelectionMark(true) })
    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) { ZyraPill(true, {}, { Text("Working changes") }); ZyraPill(false, {}, { Text("Staged") }) }
    TimelineMessage(TimelineItem("short", "user", "Looks good.")) {}
    Markdown("```powershell\nWrite-Output 'A long line stays scrollable without hiding the copy button'\n```")
} } } }

@PreviewTest @Preview(name = "Machines sheet", widthDp = 390, heightDp = 740)
@Composable fun MachinesSheetPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface(Modifier.fillMaxSize()) { Box(Modifier.fillMaxSize(), contentAlignment = androidx.compose.ui.Alignment.BottomCenter) { Surface(shape = MaterialTheme.shapes.extraLarge) { ZyraSheetContent("Machines", {}, footer = { MachinePickerFooter({}, {}) }) { MachinePickerRows(chats(), {}) } } } } } }

@PreviewTest @Preview(name = "Composer narrow", widthDp = 320, heightDp = 420, fontScale = 1.3f)
@Composable fun ComposerNarrow() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    ChatComposerContent(chats().copy(draft = "Can you adjust the spacing here?", session = SessionView("chat", running = true, config = ChatConfiguration(model = "provider/a-long-model-name"))), AttachmentState(), ComposerActions({}, {}, {}, {}, {}, {}))
} } } }

@PreviewTest @Preview(name = "Voice narrow", widthDp = 320, heightDp = 520, fontScale = 1.3f)
@Composable fun VoiceNarrow() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    VoiceControls(dev.zyra.mobile.voice.VoiceState(phase = "active", muted = true), {}, {}, {}, {})
    ChatComposerContent(chats().copy(draft = "Keep that heading, please.", session = SessionView("chat", config = ChatConfiguration(model = "provider/a-long-model-name"))), AttachmentState(), ComposerActions({}, {}, {}, {}, {}, {}), voice = dev.zyra.mobile.voice.VoiceState(phase = "active"))
} } } }

@PreviewTest @Preview(name = "Voice transcript", widthDp = 320, heightDp = 680, fontScale = 1.15f)
@Composable fun VoiceTranscriptPreview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(18.dp)) {
    TimelineMessage(TimelineItem("saved", "user", "Keep the same design language as the desktop.")) {}
    VoiceTranscriptMessage(dev.zyra.mobile.voice.VoiceTranscript("speaking", "assistant", "I'll keep the message bubbles, type and spacing consistent, and adjust the layout for your phone."))
    VoiceTranscriptMessage(dev.zyra.mobile.voice.VoiceTranscript("saving", "user", "Yes, that is what I meant.", complete = true))
} } } }

@PreviewTest @Preview(name = "Voice settings narrow", widthDp = 320, heightDp = 800, fontScale = 1.15f)
@Composable fun VoiceSettingsPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { VoiceSettingsContent("cove", dev.zyra.mobile.voice.VoicePreviewState(), "Why the ocean glows at night", "On certain nights, a breaking wave can sparkle electric blue.", {}, {}) } } }

@PreviewTest @Preview(name = "Voice recovery narrow", widthDp = 320, heightDp = 680, fontScale = 1.3f)
@Composable fun VoiceRecoveryPreview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(20.dp), verticalArrangement = Arrangement.spacedBy(24.dp)) {
    VoiceTranscriptMessage(dev.zyra.mobile.voice.VoiceTranscript("capturing", "user", "Voice message", delivery = "listening", placeholder = true))
    VoiceTranscriptMessage(dev.zyra.mobile.voice.VoiceTranscript("recovering", "user", "Keep the same design language", delivery = "recovering"))
    VoiceTranscriptMessage(dev.zyra.mobile.voice.VoiceTranscript("unavailable", "user", "Voice message", complete = true, delivery = "unavailable", placeholder = true))
} } } }

@PreviewTest @Preview(name = "Voice outputs narrow", widthDp = 320, heightDp = 640, fontScale = 1.3f)
@Composable fun VoiceOutputsPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface(Modifier.fillMaxSize()) { Column(Modifier.fillMaxSize(), verticalArrangement = Arrangement.Bottom) {
    ZyraSheetContent("Audio output", {}) { VoiceOutputRows(dev.zyra.mobile.voice.VoiceAudioOutputs(listOf(dev.zyra.mobile.voice.VoiceAudioOutput(1, "Speaker", dev.zyra.mobile.voice.VoiceOutputKind.Speaker), dev.zyra.mobile.voice.VoiceAudioOutput(2, "Phone", dev.zyra.mobile.voice.VoiceOutputKind.Phone), dev.zyra.mobile.voice.VoiceAudioOutput(3, "My Bluetooth headphones")), 3), {}) }
} } } }

private val gitNoop=WorkspaceGitActions({}, {}, {}, {}, {})
@PreviewTest @Preview(name="Git changes narrow",widthDp=320,heightDp=740,fontScale=1.15f)
@Composable fun GitChangesPreview() {ZyraTheme(Appearance(mode="dark")) {Surface {WorkspaceGitContent(WorkspaceState(git=true,branch="feature/mobile",gitWorkingCount=3,gitStagedCount=2,gitTotal=4,gitMatchCount=3,
    changes=listOf(GitChange("app/src/main/MobileConnection.kt"," ","M"),GitChange("docs/setup-guide.md","?","?"),GitChange("app/OldConnection.kt"," ","D"))),true,gitNoop,Modifier.padding(horizontal=16.dp))}}}
@PreviewTest @Preview(name="Git diff narrow",widthDp=320,heightDp=740,fontScale=1.15f)
@Composable fun GitDiffPreview() {ZyraTheme(Appearance(mode="light")) {Surface {WorkspaceGitContent(WorkspaceState(git=true,branch="feature/mobile",gitWorkingCount=3,gitStagedCount=2,diffPath="app/src/main/MobileConnection.kt",
    diff="diff --git a/MobileConnection.kt b/MobileConnection.kt\n--- a/MobileConnection.kt\n+++ b/MobileConnection.kt\n@@ -18,4 +18,5 @@\n fun connect() {\n-    fetchAllChats()\n+    restoreCachedChats()\n+    refreshVisibleChanges()\n }\n",diffTruncated=true),true,gitNoop,Modifier.padding(horizontal=16.dp))}}}

@PreviewTest @Preview(name = "New chat projects narrow", widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun NewChatProjectsPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { ZyraSheetContent("New chat", {}) {
    ZyraSettingRow(dev.zyra.mobile.R.drawable.ic_monitor, "Studio PC")
    HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 8.dp))
    NewChatProjectRows(listOf("C:/App/assistant/global-workspace", "C:/Work/zyra", "C:/Work/website", "C:/Work/long-project-title-for-a-small-phone"), true, { null }, {})
} } } }

@PreviewTest @Preview(name = "Model picker narrow", widthDp = 320, heightDp = 640, fontScale = 1.3f)
@Composable fun ModelPickerPreview() { ZyraTheme(Appearance(mode = "light")) { Surface { ZyraSheetContent("Model", {}) {
    ModelPickerContent(ModelPickerState(visible = true, models = listOf(
        AvailableModel("openai/alpha", "Alpha", "", listOf("low", "medium", "high"), 100000),
        AvailableModel("openai/alpha-fast", "Alpha Fast", "", emptyList(), 100000))), "openai/alpha", "medium", {}, { _, _ -> }, {})
} } } }

@PreviewTest @Preview(name = "Machine plugins narrow", widthDp = 320, heightDp = 800, fontScale = 1.15f)
@Composable fun MachinePluginsPreview() {
    val old = pluginPreviewState()
    val current = old.copy(catalog = old.catalog.copy(hasChat = false, current = emptyList(), defaultsKind = "global", manageMachine = true))
    ZyraTheme(Appearance(mode = "light")) { Surface { PluginsContent(current, true, "Studio PC", pluginNoop.copy(machine = {}, scope = {})) } }
}

@PreviewTest @Preview(name = "Plugin computer picker", widthDp = 320, heightDp = 460, fontScale = 1.3f)
@Composable fun PluginMachinesPreview() {
    val pcs = listOf(Machine("studio", "", "Studio PC", "", "", ""), Machine("laptop", "", "Personal laptop", "", "", ""))
    ZyraTheme(Appearance(mode = "dark")) { Surface { ZyraSheetContent("Plugins on", {}) {
        PluginMachineRows(MobileState(machines = pcs, machine = pcs.first(), machineStatus = mapOf("studio" to ConnectionState.Connected)), {}, {})
    } } }
}

@PreviewTest @Preview(name = "Chat settings compact", widthDp = 320, heightDp = 620, fontScale = 1.3f)
@Composable fun ChatSettingsPreview() { ZyraTheme(Appearance(mode = "light")) { Surface { ZyraSheetContent("Chat settings", {}) {
    ChatSettingsContent(ChatConfiguration(model = "openai/alpha", runtimeMode = "auto-review"), ChatPreferencesState(loaded = true, profile = "friendly", memoryMode = "enabled"), true, {}, {}, {}, {}, { _, _ -> })
} } } }

@PreviewTest @Preview(name = "Chat settings advanced", widthDp = 320, heightDp = 800, fontScale = 1.15f)
@Composable fun ChatSettingsAdvancedPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { ZyraSheetContent("Chat settings", {}) {
    ChatSettingsContent(ChatConfiguration(model = "openai/alpha", runtimeMode = "approval-required", webSearch = true), ChatPreferencesState(loaded = true, profile = "friendly", memoryMode = "enabled"), true, {}, {}, {}, {}, { _, _ -> }, initiallyAdvanced = true)
} } } }

@PreviewTest @Preview(name = "Files narrow desktop icons", widthDp = 320, heightDp = 640, fontScale = 1.3f)
@Composable fun FilesNarrowPreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
    WorkspaceHeader(null, false, true, {}, select = {})
    WorkspaceBreadcrumbs("src/components", true, {})
    WorkspaceDirectoryContent(WorkspaceState(path = "src/components", entries = listOf(
        WorkspaceEntry(".zyra", ".zyra", true, true), WorkspaceEntry("components", "components", true, true), WorkspaceEntry("App.tsx", "App.tsx", false, true),
        WorkspaceEntry("package.json", "package.json", false, true), WorkspaceEntry("README.md", "README.md", false, true), WorkspaceEntry("index.d.ts", "index.d.ts", false, true),
        WorkspaceEntry("Dockerfile", "Dockerfile", false, true), WorkspaceEntry("styles.css", "styles.css", false, true))), true, {}, {}, Modifier.weight(1f))
} } } }
@PreviewTest @Preview(name = "File code Paper Light", widthDp = 320, heightDp = 640, fontScale = 1.15f)
@Composable fun FileCodePreviewLight() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
    Text("App.tsx", style = MaterialTheme.typography.titleLarge, modifier = Modifier.padding(vertical = 12.dp))
    WorkspaceBreadcrumbs("src/components", true, {})
    val code = "// A small welcome screen\nexport function Welcome() {\n  const title = \"Hello, Zyra\";\n  return <h1>{title}</h1>;\n}\n"
    WorkspaceFileContent(WorkspaceState(file = WorkspaceFile("src/components/App.tsx", code, code, "hash", false, false, false, 143, "tag")), true, {}, {}, {}, {}, Modifier.weight(1f))
} } } }

@PreviewTest @Preview(name = "Desktop inbox card large type", widthDp = 320, heightDp = 420, fontScale = 1.3f)
@Composable fun InboxCardLargePreview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxSize().padding(12.dp)) {
    ChatInboxCard(Chat("one", "Make the project easier to navigate on a phone", "/projects/zyra", "running", null, false, "pc", model = "openai-codex/gpt-6-astra", tuiOpen = true), "Studio PC", ProjectMark(slug = "electron", color = "#47848F"), true, {}, {}, {})
    ChatInboxCard(Chat("two", "Review the updated settings", "/projects/client-work", "ready", "user-input", false, "other", model = "anthropic/claude-opus"), "Travel laptop", ProjectMark(slug = "react", color = "#61DAFB"), false, {}, {}, {})
} } } }

@PreviewTest @Preview(name = "Desktop project marks light", widthDp = 360, heightDp = 720)
@Composable fun ProjectMarksLight() { ProjectMarksPreview(false) }
@PreviewTest @Preview(name = "Desktop project marks dark", widthDp = 360, heightDp = 720)
@Composable fun ProjectMarksDark() { ProjectMarksPreview(true) }
@Composable private fun ProjectMarksPreview(dark: Boolean) {
    val assets = androidx.compose.ui.platform.LocalContext.current.assets
    val brands = org.json.JSONObject(assets.open("project-brands.json").bufferedReader().use { it.readText() })
    val marks = brands.keys().asSequence().map { key -> val brand = brands.getJSONObject(key); key to ProjectMark(slug = brand.getString("slug"), color = brand.getString("color")) }.toList()
    ZyraTheme(Appearance(mode = if (dark) "dark" else "light")) { Surface { Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text("Desktop project icons", style = MaterialTheme.typography.titleMedium)
        marks.chunked(5).forEach { row -> Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            row.forEach { (name, mark) -> Column(Modifier.width(58.dp), horizontalAlignment = androidx.compose.ui.Alignment.CenterHorizontally) {
                ProjectArtwork(mark)
                Text(name, style = MaterialTheme.typography.labelSmall, maxLines = 1, overflow = androidx.compose.ui.text.style.TextOverflow.Ellipsis)
            } }
        } }
        val custom = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="paint"><stop offset="0" stop-color="#fa704c"/><stop offset="1" stop-color="#b451bd"/></linearGradient></defs><rect x="1" y="1" width="22" height="22" rx="7" fill="url(#paint)"/><path d="M7 7h10l-10 10h10" stroke="white" stroke-width="2" fill="none"/></svg>"""
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            ProjectArtwork(ProjectMark(java.util.Base64.getEncoder().encodeToString(custom.toByteArray()), "image/svg+xml"))
            Text("Custom SVG logo", style = MaterialTheme.typography.labelMedium)
        }
    } } }
}

@PreviewTest @Preview(name = "Dictation controls narrow", widthDp = 320, heightDp = 240, fontScale = 1.3f)
@Composable fun DictationRecordingPreview() { ZyraTheme(Appearance(mode="light")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement=Arrangement.Bottom) {
    ChatComposerContent(MobileState(connection=ConnectionState.Connected,draft="Keep this thought.",session=SessionView("one")),AttachmentState(),ComposerActions({}, {}, {}, {}, {}, {}), dictationEnabled=true,
        dictation=dev.zyra.mobile.dictation.DictationState(phase="recording",durationMs=6500,levels=listOf(.1f,.2f,.5f,.7f,.3f,.4f,.8f,.5f,.1f,.3f,.4f,.6f,.2f)))
} } } }
@PreviewTest @Preview(name = "Dictation transfer narrow", widthDp = 320, heightDp = 210)
@Composable fun DictationTransferPreview() { ZyraTheme(Appearance(mode="dark")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement=Arrangement.Bottom) {
    ChatComposerContent(MobileState(connection=ConnectionState.Connected,session=SessionView("one")),AttachmentState(),ComposerActions({}, {}, {}, {}, {}, {}), dictationEnabled=true,
        dictation=dev.zyra.mobile.dictation.DictationState(phase="uploading",progress=.65f))
} } } }
@PreviewTest @Preview(name = "Dictation recovery narrow", widthDp = 320, heightDp = 310, fontScale = 1.3f)
@Composable fun DictationErrorPreview() { ZyraTheme(Appearance(mode="light")) { Surface { Column(Modifier.fillMaxSize(), verticalArrangement=Arrangement.Bottom) {
    ChatComposerContent(MobileState(connection=ConnectionState.Connected,draft="The existing draft stays here.",session=SessionView("one")),AttachmentState(),ComposerActions({}, {}, {}, {}, {}, {}), dictationEnabled=true,
        dictation=dev.zyra.mobile.dictation.DictationState(phase="error",error="The computer could not finish transcription. Your recording is available to retry.",retry=true))
} } } }

@PreviewTest @Preview(name = "Desktop action families narrow", widthDp = 320, heightDp = 780, fontScale = 1.2f)
@Composable fun DesktopActionFamiliesPreview() { ZyraTheme(Appearance(mode = "light")) { Surface { Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(3.dp)) {
    Text("The checks are complete.", style = MaterialTheme.typography.bodyMedium)
    TimelineWorkSummary(ChatRailRow.Work("done", emptyList(), false, true, emptyList(), 1000, 17000), {})
    listOf("bash" to """{"command":"npm test"}""", "read" to """{"path":"app.ts"}""", "write" to """{"paths":["app.ts","theme.ts"]}""",
        "web_search" to """{"query":"Android navigation"}""", "web_fetch" to """{"url":"https://developer.android.com"}""",
        "read" to """{"path":"/skills/design-notes/SKILL.md"}""", "agent" to """{"action":"run","name":"Accessibility reviewer"}""",
        "workflow" to """{"action":"run","name":"Release checks"}""", "browser_navigate" to """{"url":"https://example.com"}""",
        "computer_list_windows" to "{}", "tool_search" to "{}").forEachIndexed { index, (name, args) ->
        val raw=org.json.JSONObject().put("toolName",name).put("args",org.json.JSONObject(args))
        TimelineActionContent(WorkActions.project(TimelineItem("action:"+index,"tool",name,"tool",raw.toString())),false,false,{}, {})
    }
} } } }
@PreviewTest @Preview(name = "Captured action evidence narrow", widthDp = 320, heightDp = 670, fontScale = 1.2f)
@Composable fun CapturedActionEvidencePreview() { ZyraTheme(Appearance(mode = "dark")) { Surface { Column(Modifier.fillMaxWidth().padding(20.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
    val raw="""{"toolName":"web_search","args":{"query":"Android navigation"},"result":{"details":{"results":[{"title":"Navigation with Compose","url":"https://developer.android.com/develop/ui/compose/navigation","snippet":"Build predictable navigation and retain state across destinations."}]}}}"""
    TimelineActionContent(WorkActions.project(TimelineItem("web","tool","web_search","tool",raw)),false,true,{}, {})
    val read="""{"toolName":"read","args":{"path":"theme.ts"}}"""
    TimelineActionContent(WorkActions.project(TimelineItem("read","tool","read\nconst radius = 16;\nexport const theme = { radius };","tool",read)),false,true,{}, {})
} } } }
