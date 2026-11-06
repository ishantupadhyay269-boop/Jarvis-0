import { Linking } from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import * as Battery from 'expo-battery';
import * as Network from 'expo-network';
import { Native } from '../native/JarvisNative';

const SETTINGS: Record<string, string> = {
  wifi: 'android.settings.WIFI_SETTINGS',
  bluetooth: 'android.settings.BLUETOOTH_SETTINGS',
  display: 'android.settings.DISPLAY_SETTINGS',
  sound: 'android.settings.SOUND_SETTINGS',
  battery: 'android.intent.action.POWER_USAGE_SUMMARY',
  location: 'android.settings.LOCATION_SOURCE_SETTINGS',
  apps: 'android.settings.APPLICATION_SETTINGS',
  accessibility: 'android.settings.ACCESSIBILITY_SETTINGS',
  security: 'android.settings.SECURITY_SETTINGS',
  main: 'android.settings.SETTINGS',
};

export const AndroidDeviceController = {
  openApp: (name: string) => Native.launchAppByName(name), // returns label or null
  async openYouTube(query?: string) {
    if (query) return Linking.openURL(`https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`);
    if (!Native.launchAppByName('YouTube')) await Linking.openURL('https://m.youtube.com');
  },
  openCamera: () => IntentLauncher.startActivityAsync('android.media.action.STILL_IMAGE_CAMERA'),
  openSettings: (page = 'main') => IntentLauncher.startActivityAsync(SETTINGS[page] ?? SETTINGS.main),
  settingsPages: () => Object.keys(SETTINGS),
  dial: (n: string) => Linking.openURL(`tel:${n.replace(/\s+/g, '')}`), // opens dialer; user presses call
  sms: (n: string, body = '') => Linking.openURL(`sms:${n.replace(/\s+/g, '')}?body=${encodeURIComponent(body)}`),
  search: (q: string) => Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(q)}`),
  flashlight: (on: boolean) => Native.setFlashlight(on),
  volume: { get: () => Native.getVolume(), set: (p: number) => Native.setVolume(p) },
  setAlarm: (hour: number, minute: number, label = 'JARVIS') =>
    IntentLauncher.startActivityAsync('android.intent.action.SET_ALARM', {
      extra: { 'android.intent.extra.alarm.HOUR': hour, 'android.intent.extra.alarm.MINUTES': minute, 'android.intent.extra.alarm.MESSAGE': label },
    }),
  setTimer: (seconds: number, label = 'JARVIS') =>
    IntentLauncher.startActivityAsync('android.intent.action.SET_TIMER', {
      extra: { 'android.intent.extra.alarm.LENGTH': seconds, 'android.intent.extra.alarm.MESSAGE': label },
    }),
  async battery() {
    const [level, state] = await Promise.all([Battery.getBatteryLevelAsync(), Battery.getBatteryStateAsync()]);
    return { percent: Math.round(level * 100), charging: state === Battery.BatteryState.CHARGING || state === Battery.BatteryState.FULL };
  },
  async network() {
    const s = await Network.getNetworkStateAsync();
    return { online: !!s.isInternetReachable, type: s.type };
  },
  adminActive: () => Native.isAdminActive(),
  requestAdmin: () => Native.requestAdmin(),
  lockPhone: () => Native.lockNow(),
};
