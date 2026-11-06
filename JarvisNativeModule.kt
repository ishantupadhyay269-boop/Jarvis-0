package expo.modules.jarvisnative

import android.Manifest
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.media.AudioManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class JarvisNativeModule : Module() {
  private val ctx: Context get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()
  private val prefs get() = ctx.getSharedPreferences("jarvis", Context.MODE_PRIVATE)
  private val admin get() = ComponentName(ctx, JarvisAdminReceiver::class.java)

  private fun launchSettings(i: Intent) { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(i) }

  /** Known vendor "autostart / background" screens. Names change between ROM versions, so each is best-effort. */
  private val oemAutostart = listOf(
    "com.miui.securitycenter" to "com.miui.permcenter.autostart.AutoStartManagementActivity",
    "com.coloros.safecenter" to "com.coloros.safecenter.permission.startup.StartupAppListActivity",
    "com.oppo.safe" to "com.oppo.safe.permission.startup.StartupAppListActivity",
    "com.vivo.permissionmanager" to "com.vivo.permissionmanager.activity.BgStartUpManagerActivity",
    "com.iqoo.secure" to "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity",
    "com.huawei.systemmanager" to "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity",
    "com.samsung.android.lool" to "com.samsung.android.sm.ui.battery.BatteryActivity",
    "com.oneplus.security" to "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity",
  )

  override fun definition() = ModuleDefinition {
    Name("JarvisNative")
    Events("onWake")

    OnCreate { WakeBus.listener = { p -> sendEvent("onWake", mapOf("phrase" to p)) } }
    OnDestroy { WakeBus.listener = null }

    // ---- wake word service ----
    Function("startWakeService") {
      if (ctx.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
        false
      } else {
        prefs.edit().putBoolean("wake_enabled", true).apply()
        ctx.startForegroundService(Intent(ctx, WakeWordService::class.java))
        true
      }
    }
    Function("stopWakeService") {
      prefs.edit().putBoolean("wake_enabled", false).apply()
      ctx.stopService(Intent(ctx, WakeWordService::class.java))
      WakeBus.running = false
      true
    }
    Function("isWakeServiceRunning") { WakeBus.running }
    /** What the user last asked for (also cleared if they tap "Stop listening" in the notification). */
    Function("isWakeEnabled") { prefs.getBoolean("wake_enabled", false) }
    /** Comma-separated custom wake words; empty string = built-in "jarvis" variants. */
    Function("setWakeWords") { csv: String -> prefs.edit().putString("wake_words", csv.lowercase()).apply(); true }
    Function("pauseWake") { WakeBus.paused.set(true); WakeBus.onPause?.invoke(); true }
    Function("resumeWake") { WakeBus.paused.set(false); true }
    /** True only if the service heard the wake word in the last 60 s (stale triggers are ignored). */
    Function("consumePendingWake") {
      val ts = prefs.getLong("pending_wake_ts", 0L)
      if (ts != 0L) prefs.edit().putLong("pending_wake_ts", 0L).apply()
      ts != 0L && System.currentTimeMillis() - ts < 60_000L
    }

    // ---- permissions / settings helpers ----
    Function("canDrawOverlays") { Settings.canDrawOverlays(ctx) }
    Function("requestOverlayPermission") {
      launchSettings(Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))); true
    }
    Function("isIgnoringBatteryOptimizations") {
      (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)
    }
    Function("requestIgnoreBatteryOptimizations") {
      launchSettings(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))); true
    }
    Function("manufacturer") { Build.MANUFACTURER ?: "" }
    /** Opens the vendor autostart screen if one exists; otherwise this app's system info page. Returns true if a vendor screen opened. */
    Function("openAutostartSettings") {
      var opened = false
      for ((pkg, cls) in oemAutostart) {
        try {
          launchSettings(Intent().setComponent(ComponentName(pkg, cls)))
          opened = true
          break
        } catch (_: Exception) {}
      }
      if (!opened) launchSettings(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${ctx.packageName}")))
      opened
    }

    // ---- device admin / lock ----
    Function("isAdminActive") {
      (ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager).isAdminActive(admin)
    }
    Function("requestAdmin") {
      launchSettings(Intent(DevicePolicyManager.ACTION_ADD_DEVICE_ADMIN).apply {
        putExtra(DevicePolicyManager.EXTRA_DEVICE_ADMIN, admin)
        putExtra(DevicePolicyManager.EXTRA_ADD_EXPLANATION, "Lets JARVIS lock your screen when you ask. It cannot unlock or read your PIN.")
      }); true
    }
    Function("lockNow") {
      val dpm = ctx.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
      if (!dpm.isAdminActive(admin)) false else { dpm.lockNow(); true }
    }

    // ---- device control ----
    Function("launchAppByName") { name: String ->
      val pm = ctx.packageManager
      val q = name.trim().lowercase()
      val main = Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_LAUNCHER)
      val matches = pm.queryIntentActivities(main, 0)
      val hit = matches.firstOrNull { it.loadLabel(pm).toString().lowercase() == q }
        ?: matches.firstOrNull { it.loadLabel(pm).toString().lowercase().contains(q) }
      if (hit == null) null else {
        val i = pm.getLaunchIntentForPackage(hit.activityInfo.packageName)
        if (i == null) null else { i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK); ctx.startActivity(i); hit.loadLabel(pm).toString() }
      }
    }
    Function("setFlashlight") { on: Boolean ->
      val cm = ctx.getSystemService(Context.CAMERA_SERVICE) as CameraManager
      val id = cm.cameraIdList.firstOrNull { cm.getCameraCharacteristics(it).get(CameraCharacteristics.FLASH_INFO_AVAILABLE) == true }
      if (id == null) false else { cm.setTorchMode(id, on); true }
    }
    Function("getVolume") {
      val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      (am.getStreamVolume(AudioManager.STREAM_MUSIC) * 100) / am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    }
    Function("setVolume") { percent: Int ->
      val am = ctx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
      val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      am.setStreamVolume(AudioManager.STREAM_MUSIC, (percent.coerceIn(0, 100) * max) / 100, AudioManager.FLAG_SHOW_UI); true
    }
  }
}
