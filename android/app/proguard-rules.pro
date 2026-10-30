# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Preserve JavascriptInterface annotations and methods for WebView bridge
-keepattributes JavascriptInterface
-keepattributes *Annotation*
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Preserve Capacitor plugins and bridges
-keep public class com.musicfy.app.** { *; }
-keep public class com.getcapacitor.** { *; }

# Preserve AndroidX Media3 classes and callbacks
-keep class androidx.media3.** { *; }
-keep interface androidx.media3.** { *; }
-dontwarn androidx.media3.**

# Preserve line numbers for stack traces
-keepattributes SourceFile,LineNumberTable

