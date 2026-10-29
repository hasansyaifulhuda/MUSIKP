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
import android.media.MediaMetadata;
import android.media.session.MediaSession;
import android.media.session.PlaybackState;
import android.os.Build;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Enterprise Native Android MediaSession & Status Bar / Lockscreen Notification Controller
 * Bridges HTML5 Audio playback to native Android MediaSessionCompat and MediaStyle notifications.
 */
public class MediaSessionBridge {
    private static final String CHANNEL_ID = "musicfy_playback_channel";
    private static final int NOTIFICATION_ID = 2026;

    private static final String ACTION_PREV = "com.musicfy.app.ACTION_PREV";
    private static final String ACTION_PLAY = "com.musicfy.app.ACTION_PLAY";
    private static final String ACTION_PAUSE = "com.musicfy.app.ACTION_PAUSE";
    private static final String ACTION_NEXT = "com.musicfy.app.ACTION_NEXT";

    private final Activity activity;
    private final WebView webView;
    private final NotificationManager notificationManager;
    private MediaSession mediaSession;
    private BroadcastReceiver receiver;

    private String currentTitle = "MusicFY";
    private String currentArtist = "Musik";
    private String currentAlbum = "";
    private String currentArtworkUrl = "";
    private Bitmap currentArtwork = null;
    private boolean isPlaying = false;
    private long currentPositionMs = 0;
    private long currentDurationMs = 0;

    public MediaSessionBridge(Activity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.notificationManager = (NotificationManager) activity.getSystemService(Context.NOTIFICATION_SERVICE);
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
                .putLong(MediaMetadata.METADATA_KEY_DURATION, currentDurationMs);

            if (currentArtwork != null) {
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, currentArtwork);
                metaBuilder.putBitmap(MediaMetadata.METADATA_KEY_ART, currentArtwork);
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
                   .setOnlyAlertOnce(true);

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

            if (notificationManager != null) {
                notificationManager.notify(NOTIFICATION_ID, builder.build());
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void loadArtwork(String urlStr) {
        new Thread(() -> {
            try {
                URL url = new URL(urlStr);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setDoInput(true);
                conn.setConnectTimeout(5000);
                conn.setReadTimeout(5000);
                conn.connect();
                InputStream in = conn.getInputStream();
                Bitmap bmp = BitmapFactory.decodeStream(in);
                if (bmp != null) {
                    currentArtwork = bmp;
                    activity.runOnUiThread(this::showNotification);
                }
            } catch (Exception ignored) {}
        }).start();
    }

    @JavascriptInterface
    public void updateMetadata(String title, String artist, String album, String artworkUrl, long durationMs) {
        this.currentTitle = (title != null && !title.isEmpty()) ? title : "MusicFY";
        this.currentArtist = (artist != null && !artist.isEmpty()) ? artist : "Musik";
        this.currentAlbum = (album != null) ? album : "";
        this.currentDurationMs = durationMs;

        if (artworkUrl != null && !artworkUrl.isEmpty() && !artworkUrl.equals(currentArtworkUrl)) {
            this.currentArtworkUrl = artworkUrl;
            loadArtwork(artworkUrl);
        }

        activity.runOnUiThread(this::showNotification);
    }

    @JavascriptInterface
    public void updatePlaybackState(String state, long positionMs, long durationMs) {
        this.isPlaying = "playing".equalsIgnoreCase(state);
        this.currentPositionMs = positionMs;
        if (durationMs > 0) {
            this.currentDurationMs = durationMs;
        }

        activity.runOnUiThread(this::showNotification);
    }

    @JavascriptInterface
    public void destroySession() {
        activity.runOnUiThread(() -> {
            try {
                if (mediaSession != null) {
                    mediaSession.setActive(false);
                }
                if (notificationManager != null) {
                    notificationManager.cancel(NOTIFICATION_ID);
                }
            } catch (Exception ignored) {}
        });
    }

    public void destroy() {
        try {
            if (receiver != null) {
                activity.unregisterReceiver(receiver);
                receiver = null;
            }
            if (mediaSession != null) {
                mediaSession.setActive(false);
                mediaSession.release();
                mediaSession = null;
            }
            if (notificationManager != null) {
                notificationManager.cancel(NOTIFICATION_ID);
            }
        } catch (Exception ignored) {}
    }
}
