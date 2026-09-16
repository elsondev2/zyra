plugins { id("com.android.library") }
android {
    namespace = "com.termux.view"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    sourceSets["main"].java.exclude("**/JNI.java")
    testOptions { unitTests.isReturnDefaultValues = true; unitTests.all { it.maxHeapSize = "256m"; it.maxParallelForks = 1 } }
}
dependencies { implementation("androidx.annotation:annotation:1.9.1"); testImplementation("junit:junit:4.13.2") }
