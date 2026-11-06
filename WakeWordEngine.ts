import { PermissionsAndroid, Platform } from 'react-native';
import { Native, nativeAvailable } from '../native/JarvisNative';
import { SettingsManager } from './SettingsManager';

const wordsCsv = (w: string) => {
  const v = w.trim().toLowerCase();
  return !v || v === 'jarvis' ? '' : v; // '' = built-in jarvis variants (English + Hindi spellings)
};

export const WakeWordEngine = {
  available: nativeAvailable,
  async ensurePermissions(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (Platform.Version >= 33) await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
    return mic === PermissionsAndroid.RESULTS.GRANTED;
  },
  setWord: (w: string) => Native.setWakeWords(wordsCsv(w)),
  async start(): Promise<boolean> {
    if (!nativeAvailable) return false;
    if (!(await WakeWordEngine.ensurePermissions())) return false;
    Native.setWakeWords(wordsCsv(SettingsManager.get().wakeWord));
    return Native.startWakeService();
  },
  stop: () => Native.stopWakeService(),
  isRunning: () => Native.isWakeServiceRunning(),
  /** Native flag: false if the user pressed "Stop listening" in the notification. */
  isEnabled: () => Native.isWakeEnabled(),
  /** Call while the app itself is using the mic. */
  pause: () => Native.pauseWake(),
  resume: () => Native.resumeWake(),
  consumePending: () => Native.consumePendingWake(),
  onWake: (cb: () => void) => Native.onWake(cb),
  openAutostart: () => Native.openAutostartSettings(),
  health: () => ({
    overlay: Native.canDrawOverlays(),
    batteryExempt: Native.isIgnoringBatteryOptimizations(),
    running: Native.isWakeServiceRunning(),
    maker: Native.manufacturer(),
  }),
};
