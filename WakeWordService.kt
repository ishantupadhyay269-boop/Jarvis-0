package expo.modules.jarvisnative

import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.content.pm.ServiceInfo
import android.graphics.drawable.Icon
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import java.util.Locale
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Foreground service (type: microphone) that loops Android's SpeechRecognizer and watches for the
 * wake phrase ("hello jarvis" / "hey jarvis" / just "jarvis", or a custom word from Settings).
 *
 * It is NOT a dedicated low-power hotword DSP. Expect battery cost, occasional recognizer beeps on
 * some phones, and OEM-specific behaviour (some vendors kill the service regardless).
 */
class WakeWordService : Service() {
  private val handler = Handler(Looper.getMainLooper())
  private val loop = Runnable { listen() }
  private var recognizer: SpeechRecognizer? = null
  private var tts: TextToSpeech? = null
  private var ttsReady = false
  private var lastWake = 0L
  private var preferOffline = true
  private var errorStreak = 0

  companion object {
    const val CH_SERVICE = "jarvis_service"
    const val CH_WAKE = "jarvis_wake"
    const val ACTION_STOP = "expo.modules.jarvisnative.STOP"
    const val NOTIF_ID = 1001
    val DEFAULT_WORDS = listOf("jarvis", "jarvish", "jarwis", "jarvas", "जार्विस", "जारविस", "जर्विस", "जार्विश")
  }

  private val prefs get() = getSharedPreferences("jarvis", Context.MODE_PRIVATE)

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onCreate() {
    super.onCreate()
    val nm = getSystemService(NotificationManager::class.java)
    nm.createNotificationChannel(NotificationChannel(CH_SERVICE, "JARVIS listening", NotificationManager.IMPORTANCE_LOW))
    nm.createNotificationChannel(NotificationChannel(CH_WAKE, "JARVIS wake", NotificationManager.IMPORTANCE_HIGH))
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    if (intent?.action == ACTION_STOP) {
      prefs.edit().putBoolean("wake_enabled", false).apply()
      shutdown()
      return START_NOT_STICKY
    }

    try {
      val n = buildServiceNotification()
      if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIF_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      else startForeground(NOTIF_ID, n)
    } catch (e: Exception) {
      // Android 12+ can refuse a microphone foreground service started from the background
      // (e.g. a sticky restart). Give up cleanly; the user re-enables it by opening the app.
      shutdown()
      return START_NOT_STICKY
    }

    if (checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
      prefs.edit().putBoolean("wake_enabled", false).apply()
      shutdown()
      return START_NOT_STICKY
    }

    if (!WakeBus.running) {
      WakeBus.running = true
      tts = TextToSpeech(this) { s ->
        ttsReady = s == TextToSpeech.SUCCESS
        if (ttsReady) tts?.language = Locale("en", "IN")
      }
      WakeBus.onPause = {
        handler.post {
          recognizer?.destroy(); recognizer = null // release the mic for the app's own recognizer
          schedule(800)                             // poll until JS calls resumeWake()
        }
      }
      handler.post { listen() }
    }
    return START_STICKY
  }

  private fun buildServiceNotification(): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val open = launch?.let { PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT) }
    val stop = PendingIntent.getService(
      this, 9, Intent(this, WakeWordService::class.java).setAction(ACTION_STOP),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
    )
    return Notification.Builder(this, CH_SERVICE)
      .setContentTitle("JARVIS is listening for \"Hello Jarvis\"")
      .setContentText("Microphone active. Tap to open, or stop listening.")
      .setSmallIcon(R.drawable.ic_jarvis)
      .setOngoing(true)
      .apply { if (open != null) setContentIntent(open) }
      .addAction(Notification.Action.Builder(Icon.createWithResource(this, R.drawable.ic_jarvis), "Stop listening", stop).build())
      .build()
  }

  private fun shutdown() {
    WakeBus.running = false
    handler.removeCallbacksAndMessages(null)
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  private fun schedule(delayMs: Long) {
    if (!WakeBus.running) return
    handler.removeCallbacks(loop)
    handler.postDelayed(loop, delayMs)
  }

  private fun wakeWords(): List<String> {
    val custom = prefs.getString("wake_words", "")?.split(",")?.map { it.trim().lowercase(Locale.ROOT) }?.filter { it.isNotEmpty() }
    return if (custom.isNullOrEmpty()) DEFAULT_WORDS else custom
  }

  private fun listen() {
    if (!WakeBus.running) return
    if (WakeBus.paused.get()) { schedule(800); return }
    if (!SpeechRecognizer.isRecognitionAvailable(this)) {
      prefs.edit().putBoolean("wake_enabled", false).apply()
      shutdown(); return
    }
    recognizer?.destroy()
    recognizer = SpeechRecognizer.createSpeechRecognizer(this).also { r ->
      r.setRecognitionListener(object : RecognitionListener {
        override fun onResults(b: Bundle?) { errorStreak = 0; if (!check(b)) schedule(250) }
        override fun onPartialResults(b: Bundle?) { check(b) }
        override fun onError(e: Int) {
          when (e) {
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> {
              prefs.edit().putBoolean("wake_enabled", false).apply(); shutdown()
            }
            12, 13 -> { preferOffline = false; schedule(500) } // offline language pack missing: use online
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY, SpeechRecognizer.ERROR_CLIENT -> schedule(1500)
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> { errorStreak = 0; schedule(250) }
            else -> { errorStreak++; schedule(minOf(300L shl minOf(errorStreak, 4), 5000L)) } // network/server errors: back off
          }
        }
        override fun onReadyForSpeech(p: Bundle?) {}
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(v: Float) {}
        override fun onBufferReceived(b: ByteArray?) {}
        override fun onEndOfSpeech() {}
        override fun onEvent(t: Int, p: Bundle?) {}
      })
      val i = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "en-IN")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, preferOffline)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
      }
      try { r.startListening(i) } catch (_: Exception) { schedule(1500) }
    }
  }

  /** Returns true if the wake phrase was found and handled. */
  private fun check(b: Bundle?): Boolean {
    val list = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: return false
    val words = wakeWords()
    val hit = list.any { s -> val l = s.lowercase(Locale.ROOT); words.any { l.contains(it) } }
    if (!hit) return false
    val now = SystemClock.elapsedRealtime()
    if (now - lastWake < 4000) return true
    lastWake = now
    recognizer?.cancel()
    schedule(8000) // leave room for TTS + app launch; JS pauses the loop while it listens
    onWake()
    return true
  }

  private fun onWake() {
    prefs.edit().putLong("pending_wake_ts", System.currentTimeMillis()).apply()
    wakeScreen()
    val launched = AtomicBoolean(false)
    val go = {
      if (launched.compareAndSet(false, true)) {
        handler.post {
          bringAppToFront()
          WakeBus.listener?.invoke("hello jarvis")
        }
      }
      Unit
    }
    if (ttsReady) {
      tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
        override fun onStart(id: String?) {}
        override fun onDone(id: String?) { go() }
        @Deprecated("Deprecated in Java") override fun onError(id: String?) { go() }
      })
      tts?.speak("Yes Sir.", TextToSpeech.QUEUE_FLUSH, null, "wake")
      handler.postDelayed({ go() }, 3500) // safety net if TTS never reports completion
    } else go()
  }

  /** Turn the screen on if it is off, so the user sees JARVIS respond (like "Hey Siri"). */
  @Suppress("DEPRECATION")
  private fun wakeScreen() {
    try {
      val pm = getSystemService(PowerManager::class.java)
      if (!pm.isInteractive) {
        pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP, "jarvis:wake").acquire(10_000L)
      }
    } catch (_: Exception) {}
  }

  private fun bringAppToFront() {
    val launch = packageManager.getLaunchIntentForPackage(packageName)?.apply {
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT or Intent.FLAG_ACTIVITY_SINGLE_TOP)
    } ?: return
    // Android 10+ blocks background activity starts unless the app holds "draw over other apps".
    if (Build.VERSION.SDK_INT < 29 || Settings.canDrawOverlays(this)) {
      try { startActivity(launch) } catch (_: Exception) {}
    }
    // Fallback the user can tap: heads-up / full-screen notification.
    val pi = PendingIntent.getActivity(this, 1, launch, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    val n = Notification.Builder(this, CH_WAKE)
      .setContentTitle("JARVIS")
      .setContentText("Yes Sir. Tap to continue.")
      .setSmallIcon(R.drawable.ic_jarvis)
      .setAutoCancel(true)
      .setContentIntent(pi)
      .setFullScreenIntent(pi, true)
      .build()
    getSystemService(NotificationManager::class.java).notify(1002, n)
  }

  override fun onDestroy() {
    WakeBus.running = false
    WakeBus.onPause = null
    handler.removeCallbacksAndMessages(null)
    recognizer?.destroy(); recognizer = null
    tts?.shutdown(); tts = null
    super.onDestroy()
  }
}
