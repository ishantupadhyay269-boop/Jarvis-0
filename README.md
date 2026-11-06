# JARVIS: Android AI voice assistant
App by Ishant Upadhyay

React Native + Expo (development build), TypeScript, plus a local Kotlin Expo module.

## Honest status
- **Verified here:** TypeScript passes a syntax/type check on the project's own code, the command router was run against ~20 sample
  utterances (English + Hindi), and the icon assets were generated.
- **NOT verified:** the Kotlin native module and the Gradle build were **never compiled**, and nothing has run on a phone yet
  (no Android SDK or network in the environment this was written in). Expect to fix a few build/runtime errors on the first build.
  Do not trust any feature until you tick it off in the test checklist below.

## Setup
1. Install Node 20+ and an EAS account: `npm i -g eas-cli`. (JDK 17 + Android Studio only if you build locally.)
2. `npm install`, then `npx expo install --fix` (aligns every package to Expo SDK 54).
3. `npx tsc --noEmit` to typecheck.
4. AI key, pick ONE:
   - **Recommended:** leave it blank and type it in Settings on the phone (stored with expo-secure-store).
   - Or `.env` (copy `.env.example`). `EXPO_PUBLIC_*` values are compiled into the APK and can be extracted. Note `.env` is git-ignored, so
     EAS cloud builds will NOT see it; set the variables in the `env` block of the profile in `eas.json` or with `eas env:create`.
   - Free option: Groq (OpenAI-compatible, default) or a Gemini key. Check each provider's current free-tier terms.

## Build the APK
```
eas login
eas build:configure
npm run build:apk          # = eas build -p android --profile preview  -> gives a download link to a .apk
```
Local alternative: `npm run apk:local` (needs Android Studio SDK + JDK 17; release signing needs a keystore, EAS manages one for you).
Install: open the link on the phone, or `adb install jarvis.apk`, and allow "install unknown apps".
This app uses native code, so it will **not** run in Expo Go.

## "Hello Jarvis" in the background: first-run steps
1. Settings → **Listen in background** → allow microphone + notifications. A persistent notification appears (with a Stop button).
2. Tap **1. Allow draw over other apps** (Android 10+ needs this so a background service can open the app).
3. Tap **2. Disable battery optimization**, then **3. Autostart settings**. On Xiaomi/Oppo/Vivo/Samsung/OnePlus/Huawei also lock JARVIS in Recents.
4. Close the app, lock the phone, say "Hello Jarvis" (or "Hey Jarvis"). Expected: spoken "Yes Sir.", screen turns on, JARVIS opens and listens.
   Over a lock screen it only shows itself; anything protected still needs you to unlock. JARVIS cannot bypass the lock screen.

### How it works
`WakeWordService.kt` is a foreground service (type microphone) looping Android's `SpeechRecognizer` and matching "jarvis"
(English and Hindi spellings, or your custom word). On a match it says "Yes Sir.", wakes the screen, starts the activity
(`showWhenLocked`/`turnScreenOn` via `plugins/withJarvisActivity.js`), and the JS side starts listening for your command.
A heads-up notification is the fallback if the overlay permission is missing.

### Limits (be aware)
- Not a dedicated hotword DSP: noticeable battery use, possible recognizer beeps on some phones, accuracy depends on Google's speech service.
  For better accuracy/battery, swap in Picovoice Porcupine (limited free tier) behind `WakeWordEngine.ts`.
- Only one app can hold the microphone: JARVIS pauses the service while the app itself is listening.
- Android 14+ blocks starting a microphone service from boot. After a restart JARVIS posts a notification; tap it once.
- Some manufacturers kill background services regardless of settings. Screen-off wake therefore varies per phone.
- Not implemented: `VoiceInteractionService` (default-assistant slot / power-button long-press).

## What commands can and can't do
Works through official Android APIs: open apps, YouTube (search/play), camera, settings pages, dialer (you press call), SMS composer
(you press send), web search, flashlight, volume, alarms/reminders/timers (opens the Clock app prefilled; you confirm), battery, network,
time/date, lock screen (needs Device Admin), biometric authentication.
Cannot: unlock the lock screen, read your PIN, call/send SMS silently, search contacts (no contacts permission requested).
"Unlock my phone" only runs the system biometric/device-credential prompt, then tells you to unlock Android yourself.
Anything else is sent to the AI model (English, Hindi, Hinglish; follow-ups use the last 12 messages).

## Permissions
RECORD_AUDIO (speech), POST_NOTIFICATIONS + FOREGROUND_SERVICE(_MICROPHONE) (background listening notification),
SYSTEM_ALERT_WINDOW (open the app from the background), USE_FULL_SCREEN_INTENT (tap-to-open fallback), REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
USE_BIOMETRIC, MODIFY_AUDIO_SETTINGS (volume), SET_ALARM (Clock app intents), WAKE_LOCK (turn screen on), RECEIVE_BOOT_COMPLETED (post the
"resume listening" notification). Device Admin (force-lock only) is requested only when you use Phone Lock.

## Test checklist
- [ ] App builds, launches, orb animates.
- [ ] Mic button: English recognised, then Hindi (Settings → Language).
- [ ] Typed question gets an AI answer and is spoken.
- [ ] "open camera", "open youtube", "flashlight on", "battery", "set alarm for 7 am", "set timer for 2 minutes".
- [ ] "authenticate me and open youtube" → biometric prompt → YouTube opens.
- [ ] "lock my phone" → device-admin prompt → screen locks.
- [ ] Background wake: app in Recents, then app swiped away, then screen locked/off.
- [ ] Stop listening from the notification → Settings switch turns off when you reopen the app.

## Known risks on first build
- `@react-native-voice/voice` 3.x is old; `newArchEnabled` is set to `false` in app.json for it. If it fails to compile, the fallback is a
  small native `SpeechRecognizer` wrapper in the Kotlin module (the service already contains the pattern).
- Package versions are `*` until you run `npx expo install --fix`.
- Conversation history is in app-private storage (not separately encrypted) and excluded from Android backups.

## Layout
`src/modules/`: VoiceEngine, WakeWordEngine, AIEngine, SpeechEngine, AndroidDeviceController, AuthenticationManager, CommandProcessor,
ConversationManager, SettingsManager. `src/ui/`: MainUI, Orb, SettingsScreen, useJarvis.
`modules/jarvis-native/`: Kotlin Expo module (wake service, boot receiver, device admin, flashlight, volume, app launcher).
`plugins/withJarvisActivity.js`: lets the activity show over the lock screen.
