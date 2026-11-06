import { requireOptionalNativeModule } from 'expo-modules-core';

// Only available in a development build / APK (not Expo Go).
const N: any = requireOptionalNativeModule('JarvisNative');

export const nativeAvailable = !!N;
export const Native = {
  startWakeService: (): boolean => N?.startWakeService() ?? false,
  stopWakeService: (): boolean => N?.stopWakeService() ?? false,
  isWakeServiceRunning: (): boolean => N?.isWakeServiceRunning() ?? false,
  isWakeEnabled: (): boolean => N?.isWakeEnabled() ?? false,
  setWakeWords: (csv: string) => N?.setWakeWords(csv),
  manufacturer: (): string => N?.manufacturer() ?? '',
  openAutostartSettings: (): boolean => N?.openAutostartSettings() ?? false,
  pauseWake: () => N?.pauseWake(),
  resumeWake: () => N?.resumeWake(),
  consumePendingWake: (): boolean => N?.consumePendingWake() ?? false,
  canDrawOverlays: (): boolean => N?.canDrawOverlays() ?? false,
  requestOverlayPermission: () => N?.requestOverlayPermission(),
  isIgnoringBatteryOptimizations: (): boolean => N?.isIgnoringBatteryOptimizations() ?? false,
  requestIgnoreBatteryOptimizations: () => N?.requestIgnoreBatteryOptimizations(),
  isAdminActive: (): boolean => N?.isAdminActive() ?? false,
  requestAdmin: () => N?.requestAdmin(),
  lockNow: (): boolean => N?.lockNow() ?? false,
  launchAppByName: (name: string): string | null => N?.launchAppByName(name) ?? null,
  setFlashlight: (on: boolean): boolean => N?.setFlashlight(on) ?? false,
  getVolume: (): number => N?.getVolume() ?? 0,
  setVolume: (p: number) => N?.setVolume(p),
  onWake: (cb: () => void) => {
    const sub = N?.addListener?.('onWake', cb);
    return () => sub?.remove?.();
  },
};
