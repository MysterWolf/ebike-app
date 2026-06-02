package com.ebikeapp

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.*
import java.util.Calendar

class NotificationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName() = "NotificationModule"

    @ReactMethod
    fun schedulePreflightNotification(hour: Int, minute: Int) {
        val am  = reactContext.getSystemService(AlarmManager::class.java)
        val cal = Calendar.getInstance().apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (timeInMillis <= System.currentTimeMillis()) add(Calendar.DAY_OF_YEAR, 1)
        }
        val pi = PreflightReceiver.buildPendingIntent(reactContext, hour, minute)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        }
    }

    @ReactMethod
    fun cancelPreflightNotification() {
        val am = reactContext.getSystemService(AlarmManager::class.java)
        am.cancel(PreflightReceiver.buildPendingIntent(reactContext, 0, 0))
    }

    @ReactMethod
    fun isScheduled(promise: Promise) {
        val pi = PendingIntent.getBroadcast(
            reactContext, PreflightReceiver.REQUEST_CODE,
            Intent(reactContext, PreflightReceiver::class.java),
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        promise.resolve(pi != null)
    }

    @ReactMethod
    fun getLaunchTab(promise: Promise) {
        promise.resolve(currentActivity?.intent?.getStringExtra("tab"))
    }
}
