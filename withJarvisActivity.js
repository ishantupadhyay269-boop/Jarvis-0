// Expo config plugin: lets MainActivity appear over the lock screen and turn the screen on,
// so "Hello Jarvis" can bring JARVIS up while the phone is locked/off.
// This does NOT bypass the lock screen: protected content still requires the user to unlock.
const { withAndroidManifest } = require('expo/config-plugins');

module.exports = function withJarvisActivity(config) {
  return withAndroidManifest(config, (cfg) => {
    const app = cfg.modResults.manifest.application?.[0];
    const activity = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (activity) {
      activity.$['android:showWhenLocked'] = 'true';
      activity.$['android:turnScreenOn'] = 'true';
    } else {
      console.warn('[withJarvisActivity] MainActivity not found; lock-screen launch will not work.');
    }
    return cfg;
  });
};
