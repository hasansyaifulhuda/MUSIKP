package com.musicfy.app;

import android.app.Activity;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Base64;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Enterprise Native Android MediaSession, Audio Focus & Status Bar / Lockscreen Notification Controller
 * Bridges HTML5 Audio playback to native Android MediaSession, Audio Focus, Wakelock, and MediaStyle notifications.
 */
public class MediaSessionBridge {
    private static final String CHANNEL_ID = "musicfy_playback_channel";
    private static final int NOTIFICATION_ID = 2026;

    private static final String ACTION_PREV = "com.musicfy.app.ACTION_PREV";
    private static final String ACTION_PLAY = "com.musicfy.app.ACTION_PLAY";
    private static final String ACTION_PAUSE = "com.musicfy.app.ACTION_PAUSE";
    private static final String ACTION_NEXT = "com.musicfy.app.ACTION_NEXT";

    private static volatile Notification lastNotification = null;
    private static volatile MediaSessionBridge instance = null;

    public static Notification getLastNotification() {
        return lastNotification;
    }

    public static MediaSessionBridge getInstance() {
        return instance;
    }

    private final Activity activity;
    private final WebView webView;
    private final NotificationManager notificationManager;
    private MediaSession mediaSession;
    private BroadcastReceiver receiver;

    // Hardware locks & Audio Focus managers
    private PowerManager.WakeLock wakeLock = null;
    private WifiManager.WifiLock wifiLock = null;
    private AudioManager audioManager = null;
    private AudioFocusRequest audioFocusRequest = null;
    private boolean hasAudioFocus = false;

    private String currentTitle = "MusicFY";
    private String currentArtist = "Musik";
    private String currentAlbum = "";
    private String currentArtworkUrl = "";
    private Bitmap currentArtwork = null;
    private int currentColor = 0xFF1DB954; // Spotify green default
    private boolean isPlaying = false;
    private long currentPositionMs = 0;
    private long currentDurationMs = 0;

    public MediaSessionBridge(Activity activity, WebView webView) {
        instance = this;
        this.activity = activity;
        this.webView = webView;
        this.notificationManager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
        this.audioManager = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
    }

    private synchronized void acquireLocks() {
        try {
            // 1. CPU Partial WakeLock (prevents Android kernel CPU sleep)
            if (wakeLock == null) {
                PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MusicFY::PlaybackWakeLock");
                    wakeLock.setReferenceCounted(false);
                }
            }
            if (wakeLock != null && !wakeLock.isHeld()) {
                wakeLock.acquire(12 * 60 * 60 * 1000L); // 12 hours max safety timeout
            }

            // 2. High-Performance WifiLock (prevents Wi-Fi chip throttling during heavy gaming)
            if (wifiLock == null) {
                WifiManager wm = (WifiManager) activity.getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if (wm != null) {
                    int mode = (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q)
                        ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY
                        : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
                    wifiLock = wm.createWifiLock(mode, "MusicFY::PlaybackWifiLock");
                    wifiLock.setReferenceCounted(false);
                }
            }
            if (wifiLock != null && !wifiLock.isHeld()) {
                wifiLock.acquire();
            }
        } catch (Exception ignored) {}
    }

    private synchronized void releaseLocks() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
            if (wifiLock != null && wifiLock.isHeld()) {
                wifiLock.release();
            }
        } catch (Exception ignored) {}
    }

    private final AudioManager.OnAudioFocusChangeListener focusChangeListener = new AudioManager.OnAudioFocusChangeListener() {
        @Override
        public void onAudioFocusChange(int focusChange) {
            switch (focusChange) {
                case AudioManager.AUDIOFOCUS_LOSS:
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:
                    // Another app or incoming phone call took audio focus
                    dispatchAction("pause");
                    break;
                case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK:
                    // Game sound effects or navigation alert: Duck volume smoothly without crashing
                    dispatchAction("duckVolume", 0.4);
                    break;
                case AudioManager.AUDIOFOCUS_GAIN:
                    // Regained audio focus after interruption
                    dispatchAction("restoreVolume");
                    dispatchAction("play");
                    break;
            }
        }
    };

    @JavascriptInterface
    public synchronized boolean requestAudioFocus() {
        if (hasAudioFocus) return true;
        try {
            if (audioManager == null) {
                audioManager = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
            }
            if (audioManager == null) return false;

            int result;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                AudioAttributes playbackAttributes = new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build();

                audioFocusRequest = new AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setAudioAttributes(playbackAttributes)
                    .setAcceptsDelayedFocusGain(true)
                    .setOnAudioFocusChangeListener(focusChangeListener)
                    .build();

                result = audioManager.requestAudioFocus(audioFocusRequest);
            } else {
                result = audioManager.requestAudioFocus(
                    focusChangeListener,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN
                );
            }

            hasAudioFocus = (result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
            return hasAudioFocus;
        } catch (Exception ignored) {
            return false;
        }
    }

    @JavascriptInterface
    public synchronized void abandonAudioFocus() {
        if (!hasAudioFocus) return;
        try {
            if (audioManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && audioFocusRequest != null) {
                    audioManager.abandonAudioFocusRequest(audioFocusRequest);
                } else if (focusChangeListener != null) {
                    audioManager.abandonAudioFocus(focusChangeListener);
                }
            }
            hasAudioFocus = false;
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void requestIgnoreBatteryOptimizations() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) activity.getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(activity.getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + activity.getPackageName()));
                    activity.startActivity(intent);
                }
            } catch (Exception ignored) {}
        }
    }

    private int parseColor(String hex) {
        if (hex == null || hex.trim().isEmpty()) return 0xFF1DB954;
        try {
            String clean = hex.trim();
            if (!clean.startsWith("#")) clean = "#" + clean;
            return Color.parseColor(clean);
        } catch (Exception e) {
            return 0xFF1DB954;
        }
    }

    private synchronized void initSession() {
        if (mediaSession != null) return;

        createNotificationChannel();

        mediaSession = new MediaSession(activity, "MusicFY_MediaSession");
        mediaSession.setCallback(new MediaSession.Callback() {
            @Override
            public void onPlay() {
                dispatchAction("play");
            }

            @Override
            public void onPause() {
                dispatchAction("pause");
            }

            @Override
            public void onSkipToNext() {
                dispatchAction("next");
            }

            @Override
            public void onSkipToPrevious() {
                dispatchAction("prev");
            }

            @Override
            public void onSeekTo(long pos) {
                dispatchAction("seekTo", pos / 1000.0);
            }

            @Override
            public void onStop() {
                dispatchAction("stop");
            }
        });

        mediaSession.setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS | MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS);
        mediaSession.setActive(true);

        registerReceiver();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Pemutar Musik MusicFY",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notifikasi dan kontrol musik di status bar dan lockscreen");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            if (notificationManager != null) {
                notificationManager.createNotificationChannel(channel);
            }
        }
    }

    private void registerReceiver() {
        if (receiver != null) return;

        receiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                if (intent == null || intent.getAction() == null) return;
                String action = intent.getAction();
                if (ACTION_PREV.equals(action)) {
                    dispatchAction("prev");
                } else if (ACTION_PLAY.equals(action)) {
                    dispatchAction("play");
                } else if (ACTION_PAUSE.equals(action)) {
                    dispatchAction("pause");
                } else if (ACTION_NEXT.equals(action)) {
                    dispatchAction("next");
                }
            }
        };

        IntentFilter filter = new IntentFilter();
        filter.addAction(ACTION_PREV);
        filter.addAction(ACTION_PLAY);
        filter.addAction(ACTION_PAUSE);
        filter.addAction(ACTION_NEXT);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                activity.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
            } else {
                activity.registerReceiver(receiver, filter);
            }
        } catch (Exception ignored) {}
    }

    private void dispatchAction(String action, Object... args) {
        activity.runOnUiThread(() -> {
            try {
                if (webView != null) {
                    String script;
                    if (args.length > 0) {
                        script = "if (window.__handleAndroidMediaAction) { window.__handleAndroidMediaAction('" + action + "', " + args[0] + "); }";
                    } else {
                        script = "if (window.__handleAndroidMediaAction) { window.__handleAndroidMediaAction('" + action + "'); }";
                    }
                    webView.evaluateJavascript(script, null);
                }
            } catch (Exception ignored) {}
        });
    }

    private synchronized void showNotification() {
        if (mediaSession == null) {
            initSession();
        }

        try {
            long actions = PlaybackState.ACTION_PLAY |
                           PlaybackState.ACTION_PAUSE |
                           PlaybackState.ACTION_SKIP_TO_NEXT |
                           PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                           PlaybackState.ACTION_SEEK_TO |
                           PlaybackState.ACTION_STOP;

            PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
                .setActions(actions)
                .setState(
                    isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    currentPositionMs,
                    1.0f
                );

            mediaSession.setPlaybackState(stateBuilder.build());

            MediaMetadata.Builder metaBuilder = new MediaMetadata.Builder()
                .putString(MediaMetadata.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadata.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadata.METADATA_KEY_ALBUM, currentAlbum)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_TITLE, currentTitle)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE, currentArtist)
                .putString(MediaMetadata.METADATA_KEY_DISPLAY_DESCRIPTION, currentAlbum)
                .putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs);

            if (currentArtwork != null) {
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, currentArtwork);
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, currentArtwork);
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, currentArtwork);
            }

            mediaSession.setMetadata(metaBuilder.build());

            int flags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                flags |= PendingIntent.FLAG_IMMUTABLE;
            }

            Intent tapIntent = new Intent(activity, MainActivity.class);
            tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pTap = PendingIntent.getActivity(activity, 0, tapIntent, flags);

            Intent prevIntent = new Intent(ACTION_PREV).setPackage(activity.getPackageName());
            PendingIntent pPrev = PendingIntent.getBroadcast(activity, 1, prevIntent, flags);

            Intent playPauseIntent = new Intent(isPlaying ? ACTION_PAUSE : ACTION_PLAY).setPackage(activity.getPackageName());
            PendingIntent pPlayPause = PendingIntent.getBroadcast(activity, 2, playPauseIntent, flags);

            Intent nextIntent = new Intent(ACTION_NEXT).setPackage(activity.getPackageName());
            PendingIntent pNext = PendingIntent.getBroadcast(activity, 3, nextIntent, flags);

            Notification.Builder builder;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                builder = new Notification.Builder(activity, CHANNEL_ID);
            } else {
                builder = new Notification.Builder(activity);
            }

            Notification.MediaStyle mediaStyle = new Notification.MediaStyle();
            mediaStyle.setMediaSession(mediaSession.getSessionToken());
            mediaStyle.setShowActionsInCompactView(0, 1, 2);

            builder.setStyle(mediaStyle)
                   .setContentTitle(currentTitle)
                   .setContentText(currentArtist)
                   .setSubText(currentAlbum)
                   .setSmallIcon(R.mipmap.ic_launcher)
                   .setContentIntent(pTap)
                   .setVisibility(Notification.VISIBILITY_PUBLIC)
                   .setOngoing(isPlaying)
                   .setAutoCancel(!isPlaying)
                   .setOnlyAlertOnce(true)
                   .setColorized(true)
                   .setColor(currentColor);

            if (currentArtwork != null) {
                builder.setLargeIcon(currentArtwork);
            }

            // Action 0: Previous
            builder.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_previous,
                "Sebelumnya",
                pPrev
            ).build());

            // Action 1: Play/Pause
            builder.addAction(new Notification.Action.Builder(
                isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                isPlaying ? "Jeda" : "Putar",
                pPlayPause
            ).build());

            // Action 2: Next
            builder.addAction(new Notification.Action.Builder(
                android.R.drawable.ic_media_next,
                "Berikutnya",
                pNext
            ).build());

            Notification notification = builder.build();
            // Flag as persistent and non-clearable while audio is actively playing
            if (isPlaying) {
                notification.flags |= Notification.FLAG_ONGOING_EVENT | Notification.FLAG_NO_CLEAR;
            }
            lastNotification = notification;

            // Coordinate with Foreground Service, Audio Focus & WakeLock to prevent Android process suspension
            if (isPlaying) {
                requestAudioFocus();
                acquireLocks();

                AudioForegroundService fService = AudioForegroundService.getInstance();
                if (fService != null) {
                    fService.updateNotification(notification, true);
                } else {
                    Intent sIntent = new Intent(activity, AudioForegroundService.class);
                    sIntent.setAction(AudioForegroundService.ACTION_START);
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        activity.startForegroundService(sIntent);
                    } else {
                        activity.startService(sIntent);
                    }
                }
            } else {
                releaseLocks();
                AudioForegroundService fService = AudioForegroundService.getInstance();
                if (fService != null) {
                    fService.updateNotification(notification, false);
                }
            }

            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, notification);
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void setFallbackArtwork() {
        try {
            if (currentArtwork == null) {
                Bitmap appIcon = BitmapFactory.decodeResource(activity.getResources(), R.mipmap.ic_launcher);
                if (appIcon != null) {
                    currentArtwork = appIcon;
                    activity.runOnUiThread(this::showNotification);
                }
            }
        } catch (Exception ignored) {}
    }

    private void loadArtwork(String urlStr) {
        if (urlStr == null || urlStr.trim().isEmpty()) {
            setFallbackArtwork();
            return;
        }

        // 1. Data URI / Base64 Handler
        if (urlStr.startsWith("data:image")) {
            try {
                int comma = urlStr.indexOf(",");
                if (comma != -1) {
                    byte[] data = Base64.decode(urlStr.substring(comma + 1), Base64.DEFAULT);
                    Bitmap bmp = BitmapFactory.decodeByteArray(data, 0, data.length);
                    if (bmp != null) {
                        currentArtwork = bmp;
                        activity.runOnUiThread(this::showNotification);
                        return;
                    }
                }
            } catch (Exception ignored) {}
        }

        // 2. HTTP/HTTPS Loader with redirects and User-Agent
        new Thread(() -> {
            HttpURLConnection conn = null;
            InputStream in = null;
            try {
                URL url = new URL(urlStr);
                conn = (HttpURLConnection) url.openConnection();
                conn.setInstanceFollowRedirects(true);
                conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10; Mobile)");
                conn.setConnectTimeout(8000);
                conn.setReadTimeout(8000);
                conn.connect();

                int code = conn.getResponseCode();
                if (code == HttpURLConnection.HTTP_MOVED_PERM || code == HttpURLConnection.HTTP_MOVED_TEMP) {
                    String redirectUrl = conn.getHeaderField("Location");
                    if (redirectUrl != null) {
                        conn.disconnect();
                        url = new URL(redirectUrl);
                        conn = (HttpURLConnection) url.openConnection();
                        conn.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10; Mobile)");
                        conn.setConnectTimeout(8000);
                        conn.setReadTimeout(8000);
                        conn.connect();
                    }
                }

                in = conn.getInputStream();
                Bitmap bmp = BitmapFactory.decodeStream(in);
                if (bmp != null) {
                    currentArtwork = bmp;
                    activity.runOnUiThread(this::showNotification);
                    return;
                }
            } catch (Exception ignored) {
            } finally {
                if (in != null) try { in.close(); } catch (Exception ignored) {}
                if (conn != null) try { conn.disconnect(); } catch (Exception ignored) {}
            }

            // Fallback: If network failed or offline, load app icon so notification is never blank
            setFallbackArtwork();
        }).start();
    }

    @JavascriptInterface
    public void updateMetadata(String title, String artist, String album, String artworkUrl, long durationMs) {
        updateMetadataWithColor(title, artist, album, artworkUrl, durationMs, null);
    }

    @JavascriptInterface
    public void updateMetadataWithColor(String title, String artist, String album, String artworkUrl, long durationMs, String colorHex) {
        this.currentTitle = (title != null && !title.isEmpty()) ? title : "MusicFY";
        this.currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Musik";
        this.currentAlbum = (album != null) ? album : "";
        this.currentDurationMs = durationMs;
        if (colorHex != null && !colorHex.isEmpty()) {
            this.currentColor = parseColor(colorHex);
        }

        if (artworkUrl != null && !artworkUrl.isEmpty() && !artworkUrl.equals(currentArtworkUrl)) {
            this.currentArtworkUrl = artworkUrl;
            loadArtwork(artworkUrl);
        } else if (currentArtwork == null) {
            setFallbackArtwork();
        }

        activity.runOnUiThread(this::showNotification);
    }

    @JavascriptInterface
    public void updatePlaybackState(String state, long positionMs, long durationMs) {
        boolean newPlaying = "playing".equalsIgnoreCase(state);
        boolean playStateChanged = (this.isPlaying != newPlaying);
        this.isPlaying = newPlaying;
        this.currentPositionMs = positionMs;
        if (durationMs > 0) {
            this.currentDurationMs = durationMs;
        }

        activity.runOnUiThread(() -> {
            updateMediaSessionPositionOnly();
            if (playStateChanged) {
                showNotification();
            }
        });
    }

    private void updateMediaSessionPositionOnly() {
        if (mediaSession == null) return;
        try {
            long actions = PlaybackState.ACTION_PLAY |
                           PlaybackState.ACTION_PAUSE |
                           PlaybackState.ACTION_SKIP_TO_NEXT |
                           PlaybackState.ACTION_SKIP_TO_PREVIOUS |
                           PlaybackState.ACTION_SEEK_TO |
                           PlaybackState.ACTION_STOP;

            PlaybackState.Builder stateBuilder = new PlaybackState.Builder()
                .setActions(actions)
                .setState(
                    isPlaying ? PlaybackState.STATE_PLAYING : PlaybackState.STATE_PAUSED,
                    currentPositionMs,
                    isPlaying ? 1.0f : 0.0f
                );

            mediaSession.setPlaybackState(stateBuilder.build());
        } catch (Exception ignored) {}
    }

    @JavascriptInterface
    public void destroySession() {
        activity.runOnUiThread(() -> {
            try {
                abandonAudioFocus();
                releaseLocks();
                if (mediaSession != null) {
                    try {
                        mediaSession.setPlaybackState(new PlaybackState.Builder()
                            .setState(PlaybackState.STATE_NONE, 0, 0f)
                            .build());
                    } catch (Exception ignored) {}
                    mediaSession.setActive(false);
                }
                Intent sIntent = new Intent(activity, AudioForegroundService.class);
                sIntent.setAction(AudioForegroundService.ACTION_STOP);
                activity.startService(sIntent);
                activity.stopService(sIntent);

                if (notificationManager != null) {
                    notificationManager.cancel(NOTIFICATION_ID);
                }
                lastNotification = null;
            } catch (Exception ignored) {}
            if (instance == this) {
                instance = null;
            }
        });
    }

    public void destroy() {
        try {
            abandonAudioFocus();
            releaseLocks();
            if (receiver != null) {
                try {
                    activity.unregisterReceiver(receiver);
                } catch (Exception ignored) {}
                receiver = null;
            }
            if (mediaSession != null) {
                try {
                    mediaSession.setPlaybackState(new PlaybackState.Builder()
                        .setState(PlaybackState.STATE_NONE, 0, 0f)
                        .build());
                } catch (Exception ignored) {}
                mediaSession.setActive(false);
                mediaSession.release();
                mediaSession = null;
            }
            Intent sIntent = new Intent(activity, AudioForegroundService.class);
            sIntent.setAction(AudioForegroundService.ACTION_STOP);
            try {
                activity.startService(sIntent);
                activity.stopService(sIntent);
            } catch (Exception ignored) {}

            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID);
            }
            lastNotification = null;
        } catch (Exception ignored) {}
        if (instance == this) {
            instance = null;
        }
    }
}
