package com.musicfy.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Enterprise Native Capacitor Plugin for Foreground Service & Audio Background Mode
 * Allows JavaScript layer to control native foreground services, wakelocks, and battery exemptions.
 */
@CapacitorPlugin(name = "MusicBackgroundService")
public class MusicBackgroundPlugin extends Plugin {

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        try {
            Context context = getContext();
            Intent intent = new Intent(context, AudioForegroundService.class);
            intent.setAction(AudioForegroundService.ACTION_START);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent);
            } else {
                context.startService(intent);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("status", "running");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to start foreground service: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        try {
            Context context = getContext();
            Intent intent = new Intent(context, AudioForegroundService.class);
            intent.setAction(AudioForegroundService.ACTION_STOP);
            context.startService(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("status", "stopped");
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to stop foreground service: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
                ret.put("ignoring", ignoring);
                call.resolve(ret);
                return;
            } catch (Exception ignored) {}
        }
        ret.put("ignoring", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            try {
                PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
                if (pm != null && !pm.isIgnoringBatteryOptimizations(getContext().getPackageName())) {
                    Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                    intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                    getActivity().startActivity(intent);
                }
            } catch (Exception ignored) {}
        }
        call.resolve(new JSObject().put("requested", true));
    }
}
