package expo.modules.jarvisnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Android 14+ forbids starting a microphone foreground service from BOOT_COMPLETED, so we cannot
 * silently resume listening after a reboot. Instead we post a notification; one tap reopens JARVIS,
 * which restarts the wake service from the foreground (allowed).
 */
class BootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    if (intent?.action != Intent.ACTION_BOOT_COMPLETED) return
    val prefs = context.getSharedPreferences("jarvis", Context.MODE_PRIVATE)
    if (!prefs.getBoolean("wake_enabled", false)) return
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName) ?: return
    val pi = PendingIntent.getActivity(context, 2, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val nm = context.getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(WakeWordService.CH_WAKE, "JARVIS wake", NotificationManager.IMPORTANCE_HIGH))
    val n = Notification.Builder(context, WakeWordService.CH_WAKE)
      .setContentTitle("JARVIS is paused after restart")
      .setContentText("Tap to resume listening for \"Hello Jarvis\".")
      .setSmallIcon(R.drawable.ic_jarvis)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .build()
    nm.notify(1003, n)
  }
}
