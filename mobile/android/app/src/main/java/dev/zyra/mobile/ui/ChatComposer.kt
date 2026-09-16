@file:OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)

package dev.zyra.mobile.ui

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.SizeTransform
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.togetherWith
import androidx.compose.animation.core.tween
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.zyra.mobile.R
import dev.zyra.mobile.data.ConnectionState

@Composable fun ChatComposer(state: MobileState, vm: MobileSession) {
    val attachments by vm.attachments.state.collectAsStateWithLifecycle()
    val voice by vm.voice.state.collectAsStateWithLifecycle()
    val dictation by vm.dictation.state.collectAsStateWithLifecycle()
    val optimizePhotos by vm.preferences.optimizePhotos.collectAsStateWithLifecycle()
    LaunchedEffect(optimizePhotos) { vm.attachments.optimize(optimizePhotos) }
    var camera by remember(state.machine?.id, state.session.id) { mutableStateOf(false) }
    var cameraGeneration by remember { mutableIntStateOf(0) }
    val dictationEnabled by vm.preferences.dictation.collectAsStateWithLifecycle()
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    var outputs by remember { mutableStateOf(false) }
    LaunchedEffect(voice.inCall) { if (!voice.inCall) outputs = false }
    var permissionOwner by remember { mutableStateOf<Pair<String?, String>?>(null) }
    var permissionDictation by remember { mutableStateOf(false) }
    val microphone = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        val current = vm.state.value
        if (permissionOwner == (current.machine?.id to current.session.id) && current.page == "chat") {
            if (granted[android.Manifest.permission.RECORD_AUDIO] == true) { if (permissionDictation) vm.startDictation() else vm.startVoice() } else { if (permissionDictation) vm.dictation.denied() else vm.voice.denied() }
        }
        permissionOwner = null
    }
    fun requestMicrophone(dictating: Boolean) {
        if (permissionOwner != null) return
        keyboard?.hide()
        permissionOwner = state.machine?.id to state.session.id; permissionDictation = dictating
        microphone.launch(if (!dictating && android.os.Build.VERSION.SDK_INT >= 33) arrayOf(android.Manifest.permission.RECORD_AUDIO, android.Manifest.permission.POST_NOTIFICATIONS) else arrayOf(android.Manifest.permission.RECORD_AUDIO))
    }
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.PickMultipleVisualMedia(12)) { vm.completeAttachmentPicker(it) }
    val files = rememberLauncherForActivityResult(ActivityResultContracts.OpenMultipleDocuments()) { vm.completeAttachmentPicker(it) }
    fun openCamera() { if (vm.beginAttachmentPicker()) { keyboard?.hide(); cameraGeneration++; camera = true } }
    fun openFiles() {
        if (!vm.beginAttachmentPicker()) return
        keyboard?.hide()
        try { files.launch(arrayOf("text/*", "application/json", "application/xml", "application/javascript", "application/octet-stream")) }
        catch (error: Exception) { vm.failAttachmentPicker(error) }
    }
    DisposableEffect(camera) { val ownedCamera = camera; onDispose { if (ownedCamera) vm.completeAttachmentPicker(emptyList()) } }
    fun openPhotos() {
        if (!vm.beginAttachmentPicker()) return
        keyboard?.hide()
        try { picker.launch(androidx.activity.result.PickVisualMediaRequest(ActivityResultContracts.PickVisualMedia.ImageOnly)) }
        catch (error: Exception) { vm.failAttachmentPicker(error) }
    }
    LaunchedEffect(state.newChatAction, state.session.id, state.busy) {
        if (state.newChatAction != null && state.session.id.isNotBlank() && !state.busy) {
            val action = state.newChatAction
            vm.consumeNewChatAction()
            when (action) {
                "models" -> vm.loadModels()
                "photos" -> openPhotos()
                "camera" -> openCamera()
                "files" -> openFiles()
                "voice" -> requestMicrophone(false)
                "dictation" -> requestMicrophone(true)
            }
        }
    }
    if (outputs && voice.inCall) VoiceOutputSheet(voice.outputs, vm.voice::output) { outputs = false }
    val question = state.session.items.lastOrNull { it.kind == "user_input_requested" && it.pending }
    ChatComposerContent(state, attachments, ComposerActions(vm::setDraft, vm::send, vm::stop, vm::loadModels, ::openPhotos, vm.attachments::optimize,
        voice = { requestMicrophone(false) }, dictate = { requestMicrophone(true) }, camera = ::openCamera, files = ::openFiles), voice = voice, dictation = dictation, dictationEnabled = dictationEnabled,
        questionVisible = question != null, questionContent = { question?.let { pending ->
            key(state.machine?.id, state.session.id, pending.id) {
            QuestionComposer(pending, state.connection == ConnectionState.Connected, pending.id in state.responding, vm::answer,
                voiceControls = if (voice.inCall) ({ Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                    Text("Voice connected", Modifier.weight(1f), style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    IconButton(onClick = vm.voice::mute) { AppIcon(if (voice.muted) R.drawable.ic_mic_off else R.drawable.ic_mic, "Toggle microphone", Modifier.size(18.dp)) }
                    IconButton(onClick = { vm.voice.stop() }) { AppIcon(R.drawable.ic_square, "End Voice", Modifier.size(18.dp)) }
                } }) else null)
            }
        } },
        cameraVisible = camera, cameraContent = { key(cameraGeneration) { InlineCamera(onCancel = { camera = false; vm.completeAttachmentPicker(emptyList()) }, onCaptured = { file -> vm.completeCameraAttachment(file); camera = false }) } },
        dictationActions = DictationActions(vm.dictation::finish, vm.dictation::retry, vm.dictation::cancel), voiceContent = {
            VoiceControlContent(voice, vm.voice::mute, { outputs = true }, { vm.voice.stop() }, vm.voice::dismissError,
                dev.zyra.mobile.voice.VoiceChoice.resolve(voice.voice), vm.voice.activity)
        }) { AttachmentStrip(vm.attachments, controls = false) }
}
data class ComposerActions(val draft: (String) -> Unit, val send: (String) -> Unit, val stop: () -> Unit, val models: () -> Unit, val photos: () -> Unit, val optimize: (Boolean) -> Unit, val voice: () -> Unit = {}, val dictate: () -> Unit = {}, val camera: () -> Unit = {}, val files: () -> Unit = {})
@Composable fun ChatComposerContent(state: MobileState, attachments: AttachmentState, actions: ComposerActions, voice: dev.zyra.mobile.voice.VoiceState = dev.zyra.mobile.voice.VoiceState(), dictation: dev.zyra.mobile.dictation.DictationState = dev.zyra.mobile.dictation.DictationState(), dictationEnabled: Boolean = false, dictationActions: DictationActions = DictationActions(), voiceContent: (@Composable () -> Unit)? = null, allowUnboundControls: Boolean = false, cameraVisible: Boolean = false, cameraContent: (@Composable () -> Unit)? = null, questionVisible: Boolean = false, questionContent: (@Composable () -> Unit)? = null, attachmentContent: @Composable () -> Unit = {}) {
    var menu by remember { mutableStateOf(false) }
    var mode by remember { mutableStateOf("steer") }
    val connected = state.connection == ConnectionState.Connected
    val reduced = LocalReduceMotion.current
    var inputFocused by remember { mutableStateOf(false) }
    val inputFocus = remember { FocusRequester() }
    val keyboard = androidx.compose.ui.platform.LocalSoftwareKeyboardController.current
    val textMode = !questionVisible && !cameraVisible && !voice.inCall && voice.error == null && !dictation.active
    val keyboardTarget = WindowInsets.imeAnimationTarget.getBottom(androidx.compose.ui.platform.LocalDensity.current)
    // Closing the IME changes presentation, not focus ownership. A deferred clearFocus
    // can otherwise cancel a fresh tap or another field that gained focus meanwhile.
    val hardwareKeyboard = androidx.compose.ui.platform.LocalConfiguration.current.keyboard != android.content.res.Configuration.KEYBOARD_NOKEYS
    val expandedInput = inputFocused && (keyboardTarget > 0 || hardwareKeyboard)
    Column(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp)) {
        Surface(modifier = if (textMode) Modifier.focusComposerOnUnusedTap { inputFocus.requestFocus(); keyboard?.show() } else Modifier, shape = RoundedCornerShape(28.dp), color = MaterialTheme.colorScheme.surfaceContainer, border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)) {
            Column {
                if (!questionVisible) Box(Modifier.padding(horizontal = 10.dp)) { attachmentContent() }
                AnimatedContent(targetState = when { questionVisible -> "question"; cameraVisible -> "camera"; voice.inCall || voice.error != null -> "voice"; dictation.active -> "dictation"; else -> "text" },
                    transitionSpec = { (fadeIn(tween(if (reduced) 0 else 180)) togetherWith fadeOut(tween(if (reduced) 0 else 100)))
                        .using(SizeTransform(sizeAnimationSpec = { _, _ -> tween(if (reduced) 0 else 220) })) }, label = "Composer mode") { inputMode ->
                when (inputMode) {
                    "question" -> questionContent?.invoke()
                    "camera" -> cameraContent?.invoke()
                    "voice" -> if (voiceContent != null) voiceContent() else VoiceControlContent(voice, {}, {}, {}, {})
                    "dictation" -> DictationBar(dictation, dictationActions, connected && !state.busy)
                    else -> {
                ComposerInputLayout(expandedInput, leading = {
                    Box {
                        IconButton(onClick = { menu = true }, enabled = !voice.inCall && !dictation.active, modifier = Modifier.size(44.dp)) { AppIcon(R.drawable.ic_plus, "Add attachment") }
                        DropdownMenu(menu, { menu = false }, shape = MaterialTheme.shapes.medium, containerColor = MaterialTheme.colorScheme.surfaceContainer, tonalElevation = 0.dp) {
                            DropdownMenuItem(text = { Text("Add photos") }, leadingIcon = { AppIcon(R.drawable.ic_image) }, enabled = !attachments.preparing && attachments.items.size < 12, onClick = { menu = false; actions.photos() })
                            DropdownMenuItem(text = { Text("Take picture") }, leadingIcon = { AppIcon(R.drawable.ic_camera) }, enabled = !attachments.preparing && attachments.items.size < 12, onClick = { menu = false; actions.camera() })
                            DropdownMenuItem(text = { Text("Add files") }, leadingIcon = { AppIcon(R.drawable.ic_paperclip) }, enabled = !attachments.preparing && attachments.items.size < 12, onClick = { menu = false; actions.files() })
                            if (state.session.running) {
                                DropdownMenuItem(text = { Text("Queue next message") }, trailingIcon = { ZyraSwitch(mode == "follow_up", null) }, onClick = { mode = if (mode == "follow_up") "steer" else "follow_up" })
                                DropdownMenuItem(text = { Text("Stop response") }, leadingIcon = { AppIcon(R.drawable.ic_square) }, onClick = { menu = false; actions.stop() })
                            }
                        }
                    }
                    }, input = { BasicTextField(value = state.draft, onValueChange = actions.draft, minLines = 1, maxLines = if (expandedInput) 5 else 2,
                        textStyle = MaterialTheme.typography.bodyMedium.copy(color = MaterialTheme.colorScheme.onSurface), cursorBrush = SolidColor(MaterialTheme.colorScheme.primary),
                        modifier = Modifier.focusRequester(inputFocus).onFocusChanged { inputFocused = it.isFocused }.heightIn(min = 44.dp).padding(vertical = 11.dp, horizontal = 2.dp),
                        decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (state.draft.isEmpty()) Text(if (!connected) "Write a draft…" else if (state.session.running && mode == "follow_up") "Queue a message…" else "Message…", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant); inner() } })
                    }, trailing = { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    IconButton(onClick = actions.models, enabled = connected && !state.busy && !dictation.active && (state.session.id.isNotBlank() || allowUnboundControls), modifier = Modifier.size(44.dp)) { ThinkingGaugeIcon(state.session.config.thinking, Modifier.size(22.dp)) }
                    if (dictationEnabled && !voice.inCall) IconButton(actions.dictate, enabled = connected && !state.busy && !dictation.active, modifier = Modifier.size(44.dp)) { AppIcon(R.drawable.ic_mic, "Dictate a message", Modifier.size(22.dp)) }
                    val hasMessage = state.draft.isNotBlank() || attachments.items.isNotEmpty()
                    // The filled circle is 22dp wider than the line icons. Reserve half
                    // that difference so the visible gaps match, while targets stay 44dp.
                    Box(Modifier.padding(start = 11.dp)) { FilledIconButton(onClick = {
                        if (hasMessage) actions.send(if (state.session.running) mode else "prompt")
                        else if (state.session.running && !voice.inCall) actions.stop() else actions.voice()
                    }, enabled = connected && !state.busy && !dictation.active && !voice.sending &&
                        if (hasMessage) (!voice.inCall || voice.phase == "active") && attachments.readyToSend
                        else !voice.inCall,
                        shape = androidx.compose.foundation.shape.CircleShape, modifier = Modifier.size(44.dp)) {
                        AppIcon(if (hasMessage) R.drawable.ic_arrow_up else if (state.session.running && !voice.inCall) R.drawable.ic_square else R.drawable.ic_audio_lines,
                            if (hasMessage) "Send message" else if (state.session.running && !voice.inCall) "Stop response" else "Start Voice")
                    } }
                } })
                    }
                }
                }
            }
        }

    }
}



