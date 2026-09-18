# Kotlin/Compose and OkHttp include their own consumer rules.
-keepattributes Signature,InnerClasses,EnclosingMethod
# Native JNI callbacks refer to these exact shadowed WebRTC class/member names.
-keep class livekit.org.webrtc.** { *; }
