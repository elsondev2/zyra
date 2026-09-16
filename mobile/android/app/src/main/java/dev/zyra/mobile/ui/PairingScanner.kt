package dev.zyra.mobile.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.provider.Settings
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.background
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.zxing.BarcodeFormat
import com.journeyapps.barcodescanner.BarcodeCallback
import com.journeyapps.barcodescanner.BarcodeResult
import com.journeyapps.barcodescanner.BarcodeView
import com.journeyapps.barcodescanner.DefaultDecoderFactory
import dev.zyra.mobile.R

@Composable fun PairingScanner(onResult: (String) -> Unit) {
    val context = LocalContext.current
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    var allowed by remember { mutableStateOf(ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) }
    var denied by remember { mutableStateOf(false) }
    val permission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { allowed = it; denied = !it }
    val latestResult by rememberUpdatedState(onResult)
    if (!allowed) {
        Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(16.dp)) {
            AppIcon(R.drawable.ic_camera, modifier = Modifier.size(40.dp))
            Text("Use your camera to scan", style = MaterialTheme.typography.titleMedium)
            Text("Camera access is only used for the pairing code.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            ZyraButton(onClick = { permission.launch(Manifest.permission.CAMERA) }) { Text("Allow camera") }
            if (denied) TextButton(onClick = { context.startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + context.packageName))) }) { Text("Open phone settings") }
        }
        DisposableEffect(lifecycle) {
            val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) allowed = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED }
            lifecycle.addObserver(observer); onDispose { lifecycle.removeObserver(observer) }
        }
    } else {
        val scanner = remember(context) { BarcodeView(context).apply { decoderFactory = DefaultDecoderFactory(listOf(BarcodeFormat.QR_CODE)) } }
        BoxWithConstraints(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
            val edge = minOf(maxWidth, 300.dp)
            Box(Modifier.size(edge).clip(MaterialTheme.shapes.large).background(Color.Black)) {
                AndroidView(factory = { scanner }, modifier = Modifier.fillMaxSize())
            }
        }
        DisposableEffect(scanner, lifecycle) {
            scanner.decodeSingle(object : BarcodeCallback { override fun barcodeResult(result: BarcodeResult?) { result?.text?.let { scanner.pause(); latestResult(it) } } })
            if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) scanner.resume()
            val observer = LifecycleEventObserver { _, event -> if (event == Lifecycle.Event.ON_RESUME) scanner.resume() else if (event == Lifecycle.Event.ON_PAUSE) scanner.pause() }
            lifecycle.addObserver(observer)
            onDispose { lifecycle.removeObserver(observer); scanner.stopDecoding(); scanner.pause() }
        }
    }
}
