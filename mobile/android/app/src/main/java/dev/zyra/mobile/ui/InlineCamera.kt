package dev.zyra.mobile.ui

import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.BackHandler
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.view.CameraController
import androidx.camera.view.LifecycleCameraController
import androidx.camera.view.PreviewView
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import java.io.File

/** A single camera lives only while the composer owns this panel. No microphone or analysis stream. */
@Composable fun InlineCamera(onCancel: () -> Unit, onCaptured: (File) -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current
    val cancel by rememberUpdatedState(onCancel)
    val captured by rememberUpdatedState(onCaptured)
    var granted by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by remember { mutableStateOf(false) }
    var failure by remember { mutableStateOf<String?>(null) }
    var ready by remember { mutableStateOf(false) }
    var busy by remember { mutableStateOf(false) }
    var front by remember { mutableStateOf(false) }
    var flash by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted = it; denied = !it }
    LaunchedEffect(Unit) { if (!granted) permission.launch(Manifest.permission.CAMERA) }
    val controller = remember { LifecycleCameraController(context).apply { setEnabledUseCases(CameraController.IMAGE_CAPTURE); imageCaptureMode = ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY; imageCaptureTargetSize = CameraController.OutputSize(android.util.Size(2048, 1536)) } }
    val executor = remember(context) { ContextCompat.getMainExecutor(context) }
    var active by remember { mutableStateOf(true) }
    var closed by remember { mutableStateOf(false) }
    val closeCamera: () -> Unit = { closed = true; active = false; controller.unbind(); cancel() }
    DisposableEffect(controller, lifecycle, granted) {
        active = !closed
        if (granted && !closed) {
            runCatching { controller.bindToLifecycle(lifecycle) }.onFailure { failure = "Camera unavailable. Close and try again." }
            controller.initializationFuture.addListener({ if (active) runCatching { controller.initializationFuture.get(); ready = true }.onFailure { failure = "Camera unavailable. Close and try again." } }, executor)
        }
        val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_STOP) { closed = true; active = false; controller.unbind(); cancel() } }
        lifecycle.lifecycle.addObserver(observer)
        onDispose { active = false; ready = false; controller.unbind(); lifecycle.lifecycle.removeObserver(observer) }
    }
    val takePicture: () -> Unit = capture@ {
        if (!active || closed || !ready || busy) return@capture
        busy = true; failure = null
        val file = try {
            val directory = File(context.cacheDir, "camera-captures").apply { mkdirs() }
            directory.listFiles()?.filter { it.isFile && it.name.startsWith("photo-") && it.extension == "jpg" && it.lastModified() < System.currentTimeMillis() - 86_400_000L }?.forEach { it.delete() }
            File.createTempFile("photo-", ".jpg", directory)
        } catch (_: Exception) { busy = false; failure = "Make space on your phone and try again."; return@capture }
        try { controller.takePicture(ImageCapture.OutputFileOptions.Builder(file).build(), executor, object : ImageCapture.OnImageSavedCallback {
            override fun onImageSaved(result: ImageCapture.OutputFileResults) { busy = false; if (active && !closed) { closed = true; active = false; controller.unbind(); captured(file) } else file.delete() }
            override fun onError(exception: ImageCaptureException) { file.delete(); if (active) { busy = false; failure = "Could not take this picture. Close and try again." } }
        }) } catch (_: Exception) { file.delete(); busy = false; failure = "Could not take this picture. Close and try again." }
    }
    val activity = androidx.activity.compose.LocalActivity.current
    BackHandler(onBack = closeCamera)
    CameraPanel(ready, busy, granted, denied, failure, front, flash, onCancel = closeCamera, onCapture = takePicture,
        onPermission = {
            if (denied && activity?.shouldShowRequestPermissionRationale(Manifest.permission.CAMERA) == false) {
                context.startActivity(android.content.Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS, android.net.Uri.parse("package:" + context.packageName)))
            } else permission.launch(Manifest.permission.CAMERA)
        }, onFlip = {
            val selector = if (front) CameraSelector.DEFAULT_BACK_CAMERA else CameraSelector.DEFAULT_FRONT_CAMERA
            runCatching { if (controller.hasCamera(selector)) { controller.cameraSelector = selector; front = !front } }.onFailure { failure = "This camera is unavailable." }
        }, onFlash = { flash = !flash; controller.imageCaptureFlashMode = if (flash) ImageCapture.FLASH_MODE_AUTO else ImageCapture.FLASH_MODE_OFF }) {
        if (granted && failure == null) AndroidView(factory = { PreviewView(it).apply {
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
            this.controller = controller
        } }, modifier = Modifier.fillMaxSize())
    }
}
