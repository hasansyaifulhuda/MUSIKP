package com.musicfy.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST_CODE = 1001;
    private MediaSessionBridge mediaBridge;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(MusicBackgroundPlugin.class);
        super.onCreate(savedInstanceState);

        // Request runtime permission for Android 13+ (Tiramisu / API 33+) to allow media notifications
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS)
                    != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(
                    this,
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST_CODE
                );
            }
        }
    }

    @Override
    public void onStart() {
        super.onStart();
        try {
            if (bridge != null && bridge.getWebView() != null) {
                WebView webView = bridge.getWebView();
                WebSettings settings = webView.getSettings();
                // Ensure ongoing and background audio does not require user gestures for autoplaying next tracks
                settings.setMediaPlaybackRequiresUserGesture(false);
                settings.setJavaScriptCanOpenWindowsAutomatically(true);

                // Elevate WebView renderer priority so Android LMK does not kill it when user runs heavy games
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
                }

                // Initialize native Android MediaSession & Status bar / Lockscreen Notification bridge
                if (mediaBridge == null) {
                    mediaBridge = new MediaSessionBridge(this, webView);
                    webView.addJavascriptInterface(mediaBridge, "AndroidMediaBridge");
                }
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onPause() {
        super.onPause();
        // Prevent Capacitor from freezing JS timers and HTML5 audio threads when minimized to home screen
        try {
            if (bridge != null && bridge.getWebView() != null) {
                WebView webView = bridge.getWebView();
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onStop() {
        super.onStop();
        // Reinforce timer continuity so queue transitions and ended events fire when screen is locked
        try {
            if (bridge != null && bridge.getWebView() != null) {
                WebView webView = bridge.getWebView();
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        try {
            if (bridge != null && bridge.getWebView() != null) {
                WebView webView = bridge.getWebView();
                webView.resumeTimers();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        if (mediaBridge != null) {
            mediaBridge.destroy();
            mediaBridge = null;
        }
        try {
            Intent sIntent = new Intent(this, AudioForegroundService.class);
            sIntent.setAction(AudioForegroundService.ACTION_STOP);
            startService(sIntent);
            stopService(sIntent);

            android.app.NotificationManager nm = (android.app.NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(AudioForegroundService.NOTIFICATION_ID);
            }
        } catch (Exception ignored) {}
        super.onDestroy();
    }
}
