import * as LocalAuthentication from 'expo-local-authentication';

export const AuthenticationManager = {
  async available(): Promise<boolean> {
    return (await LocalAuthentication.hasHardwareAsync()) && (await LocalAuthentication.isEnrolledAsync());
  },
  /** Uses Android BiometricPrompt with device-credential fallback. We never see a PIN/password. */
  async authenticate(): Promise<boolean> {
    if (!(await AuthenticationManager.available())) return false;
    const r = await LocalAuthentication.authenticateAsync({
      promptMessage: 'JARVIS: please authenticate',
      disableDeviceFallback: false,
    });
    return r.success;
  },
};
