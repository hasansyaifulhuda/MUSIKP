package com.musicfy.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;

/**
 * Enterprise Android Foreground Service for Audio Playback (MusicFY)
 * Guarantees that Android OS does not suspend or kill the app process
 * when minimized to the home screen, locked, or during heavy game execution.
 */
public class AudioForegroundService extends Service {
    public static final String ACTION_START = "com.musicfy.app.service.START";
    public static final String ACTION_STOP = "com.musicfy.app.service.STOP";
    public static final int NOTIFICATION_ID = 2026;
    private static final String CHANNEL_ID = "musicfy_playback_channel";

    private static volatile AudioForegroundService instance = null;
    private PowerManager.WakeLock serviceWakeLock = null;

    public static AudioForegroundService getInstance() {
        return instance;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        acquireServiceWakeLock();
    }

    private void acquireServiceWakeLock() {
        try {
            if (serviceWakeLock == null) {
                PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
                if (pm != null) {
                    serviceWakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "MusicFY::ServiceWakeLock");
                    serviceWakeLock.setReferenceCounted(false);
                }
            }
            if (serviceWakeLock != null && !serviceWakeLock.isHeld()) {
                serviceWakeLock.acquire(12 * 60 * 60 * 1000L);
            }
        } catch (Exception ignored) {}
    }

    private void releaseServiceWakeLock() {
        try {
            if (serviceWakeLock != null && serviceWakeLock.isHeld()) {
                serviceWakeLock.release();
            }
        } catch (Exception ignored) {}
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForegroundCompat(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        acquireServiceWakeLock();

        // Android 8.0+ requires immediate startForeground call within 5 seconds of startForegroundService
        Notification notif = MediaSessionBridge.getLastNotification();
        if (notif == null) {
            notif = buildDefaultNotification();
        }
        updateNotification(notif, true);

        return START_STICKY;
    }

    private Notification buildDefaultNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Pemutar Musik MusicFY",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Notifikasi dan kontrol musik latar belakang");
            channel.setShowBadge(false);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            nm.createNotificationChannel(channel);
        }

        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pTap = PendingIntent.getActivity(this, 0, tapIntent, flags);

        Notification.Builder builder;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            builder = new Notification.Builder(this, CHANNEL_ID);
        } else {
            builder = new Notification.Builder(this);
        }

        builder.setContentTitle("MusicFY")
               .setContentText("Memutar musik di latar belakang")
               .setSmallIcon(R.mipmap.ic_launcher)
               .setContentIntent(pTap)
               .setVisibility(Notification.VISIBILITY_PUBLIC)
               .setOngoing(true)
               .setAutoCancel(false);

        Notification n = builder.build();
        n.flags |= Notification.FLAG_ONGOING_EVENT | Notification.FLAG_NO_CLEAR;
        return n;
    }

    /**
     * Attaches or detaches the notification from foreground status depending on playback state.
     */
    public void updateNotification(Notification notification, boolean isPlaying) {
        if (notification == null) return;
        try {
            if (isPlaying) {
                acquireServiceWakeLock();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK);
                } else {
                    startForeground(NOTIFICATION_ID, notification);
                }
            } else {
                // When paused, detach from active foreground to make notification dismissible if wanted
                stopForegroundCompat(false);
                releaseServiceWakeLock();
            }
        } catch (Exception e) {
            e.printStackTrace();
        }
    }

    private void stopForegroundCompat(boolean removeNotification) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
                stopForeground(removeNotification ? STOP_FOREGROUND_REMOVE : STOP_FOREGROUND_DETACH);
            } else {
                stopForeground(removeNotification);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onDestroy() {
        releaseServiceWakeLock();
        instance = null;
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
