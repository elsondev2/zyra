plugins { id("com.android.library") }
android {
    namespace = "com.caverock.androidsvg"
    compileSdk = 36
    defaultConfig { minSdk = 26 }
    compileOptions { sourceCompatibility = JavaVersion.VERSION_17; targetCompatibility = JavaVersion.VERSION_17 }
    // Native Canvas is used directly; the optional XML ImageView adapter is not used.
    sourceSets["main"].java.exclude("**/SVGImageView.java")
    testOptions { unitTests.isReturnDefaultValues = true; unitTests.all { it.maxHeapSize = "128m"; it.maxParallelForks = 1 } }
}
dependencies { testImplementation("junit:junit:4.13.2") }
