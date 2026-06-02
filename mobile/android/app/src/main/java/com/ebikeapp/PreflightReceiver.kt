package com.ebikeapp

import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.database.sqlite.SQLiteDatabase
import android.os.Build
import androidx.core.app.NotificationCompat
import java.util.Calendar

class PreflightReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val hour   = intent.getIntExtra(EXTRA_HOUR, 6)
        val minute = intent.getIntExtra(EXTRA_MIN, 30)
        showNotification(context)
        setResetPending(context)
        scheduleNext(context, hour, minute)
    }

    private fun showNotification(context: Context) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) == null) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_ID, "Preflight Check", NotificationManager.IMPORTANCE_DEFAULT)
                    .apply { description = "Daily pre-ride safety reminder" }
            )
        }
        val tapPi = PendingIntent.getActivity(
            context, 0,
            Intent(context, MainActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
                putExtra("tab", "ops")
            },
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        nm.notify(NOTIF_ID,
            NotificationCompat.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info)
                .setContentTitle("Mission Control — Preflight Check")
                .setContentText("Time to check your bike before you ride.")
                .setContentIntent(tapPi)
                .setAutoCancel(true)
                .build()
        )
    }

    private fun setResetPending(context: Context) {
        try {
            val db = SQLiteDatabase.openDatabase(
                context.getDatabasePath("ebike.db").absolutePath,
                null, SQLiteDatabase.OPEN_READWRITE
            )
            db.execSQL("CREATE TABLE IF NOT EXISTS app_flags (key TEXT PRIMARY KEY, value TEXT)")
            db.execSQL("INSERT OR REPLACE INTO app_flags (key, value) VALUES ('preflightResetPending', '1')")
            db.close()
        } catch (_: Exception) {}
    }

    private fun scheduleNext(context: Context, hour: Int, minute: Int) {
        val am  = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val cal = Calendar.getInstance().apply {
            add(Calendar.DAY_OF_YEAR, 1)
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
        }
        val pi = buildPendingIntent(context, hour, minute)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am.canScheduleExactAlarms()) {
            am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        } else {
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, cal.timeInMillis, pi)
        }
    }

    companion object {
        const val CHANNEL_ID   = "preflight_check"
        const val NOTIF_ID     = 1001
        const val EXTRA_HOUR   = "preflight_hour"
        const val EXTRA_MIN    = "preflight_minute"
        const val REQUEST_CODE = 42

        fun buildPendingIntent(context: Context, hour: Int, minute: Int): PendingIntent =
            PendingIntent.getBroadcast(
                context, REQUEST_CODE,
                Intent(context, PreflightReceiver::class.java).apply {
                    putExtra(EXTRA_HOUR, hour)
                    putExtra(EXTRA_MIN, minute)
                },
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
    }
}
