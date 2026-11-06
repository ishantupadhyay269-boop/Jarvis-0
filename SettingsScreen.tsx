import React, { useEffect, useState } from 'react';
import { Alert, AppState, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Settings } from '../types';
import { Theme } from './theme';
import { WakeWordEngine } from '../modules/WakeWordEngine';
import { SpeechEngine } from '../modules/SpeechEngine';
import { AndroidDeviceController as D } from '../modules/AndroidDeviceController';
import { Native } from '../native/JarvisNative';

type Props = { visible: boolean; onClose: () => void; theme: Theme; settings: Settings; apply: (p: Partial<Settings>) => void; clear: () => void };

// Defined at module level on purpose: components declared inside another component get a new
// identity every render, which remounts TextInputs and drops the keyboard on each keystroke.
const Row = ({ t, label, children }: any) => (
  <View style={st.row}><Text style={[st.label, { color: t.text }]}>{label}</Text>{children}</View>
);
const Chip = ({ t, on, label, onPress }: any) => (
  <Pressable onPress={onPress} style={[st.chip, { borderColor: t.accent, backgroundColor: on ? t.accent : 'transparent' }]}>
    <Text style={{ color: on ? '#fff' : t.text }}>{label}</Text>
  </Pressable>
);
const Btn = ({ t, label, onPress }: any) => (
  <Pressable onPress={onPress} style={[st.btn, { borderColor: t.accent }]}><Text style={{ color: t.accent, textAlign: 'center' }}>{label}</Text></Pressable>
);
/** Keeps a local draft and commits to settings only when editing ends. */
const Field = ({ t, value, onCommit, ...rest }: any) => {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <TextInput {...rest} value={v} onChangeText={setV} onEndEditing={() => v !== value && onCommit(v)} onBlur={() => v !== value && onCommit(v)}
      placeholderTextColor={t.sub} autoCapitalize="none" autoCorrect={false}
      style={[st.input, { color: t.text, borderColor: t.sub }]} />
  );
};

export default function SettingsScreen({ visible, onClose, theme: t, settings: s, apply, clear }: Props) {
  const [voices, setVoices] = useState<{ identifier: string; name: string }[]>([]);
  const [health, setHealth] = useState(WakeWordEngine.health());
  const [, force] = useState(0);
  const refresh = () => { setHealth(WakeWordEngine.health()); force(n => n + 1); };

  useEffect(() => {
    if (!visible) return;
    SpeechEngine.voices().then(setVoices as any);
    refresh();
    // permissions are granted on other screens; re-read status when the user comes back
    const sub = AppState.addEventListener('change', x => { if (x === 'active') refresh(); });
    return () => sub.remove();
  }, [visible]);

  const toggleWake = async (v: boolean) => {
    if (!v) { WakeWordEngine.stop(); apply({ wakeEnabled: false }); setTimeout(refresh, 300); return; }
    Alert.alert('Background listening',
      'JARVIS will keep the microphone on in a foreground service (a notification stays visible) so it can hear "Hello Jarvis" even when the app is closed or the screen is off. This uses battery. Audio is processed by Android\'s speech service; JARVIS does not record or store it.',
      [{ text: 'Cancel', style: 'cancel' }, { text: 'Enable', onPress: async () => {
        const ok = await WakeWordEngine.start();
        if (!ok) Alert.alert('Could not start', 'Microphone permission is needed, and this feature only works in the installed APK or a development build (not Expo Go).');
        apply({ wakeEnabled: ok }); setTimeout(refresh, 500);
      } }]);
  };

  const autostart = () => {
    const vendor = WakeWordEngine.openAutostart();
    if (!vendor) Alert.alert('Open the app info page', 'No vendor autostart screen was found for this phone, so the app info page opened. Look for Battery / "Background activity" / "Autostart" and allow it.');
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ padding: 20, paddingTop: 56, paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
        <Text style={[st.h, { color: t.accent }]}>Settings</Text>

        <Text style={[st.sec, { color: t.sub }]}>VOICE</Text>
        <Row t={t} label="Language">
          <View style={st.chips}>{(['auto', 'en', 'hi'] as const).map(l => <Chip t={t} key={l} on={s.language === l} label={l === 'auto' ? 'Auto' : l === 'en' ? 'English' : 'हिन्दी'} onPress={() => apply({ language: l })} />)}</View>
        </Row>
        <Row t={t} label={`Speech speed ${s.speechRate.toFixed(1)}x`}>
          <View style={st.chips}>
            <Chip t={t} label="−" onPress={() => apply({ speechRate: Math.max(0.5, +(s.speechRate - 0.1).toFixed(1)) })} />
            <Chip t={t} label="+" onPress={() => apply({ speechRate: Math.min(2, +(s.speechRate + 0.1).toFixed(1)) })} />
          </View>
        </Row>
        <Row t={t} label={`Voice: ${voices.find(v => v.identifier === s.voice)?.name ?? 'System default'}`}>
          <Chip t={t} label="Next voice" onPress={() => {
            if (!voices.length) return;
            const i = voices.findIndex(v => v.identifier === s.voice);
            apply({ voice: voices[(i + 1) % voices.length].identifier });
          }} />
        </Row>
        <Row t={t} label="Continuous conversation"><Switch value={s.continuous} onValueChange={v => apply({ continuous: v })} /></Row>

        <Text style={[st.sec, { color: t.sub }]}>"HELLO JARVIS" BACKGROUND LISTENING</Text>
        <Row t={t} label="Listen in background"><Switch value={s.wakeEnabled} onValueChange={toggleWake} /></Row>
        <Text style={[st.note, { color: t.sub }]}>
          Service: {health.running ? 'running' : 'stopped'} · Draw over apps: {health.overlay ? 'granted' : 'NOT granted'} · Battery exemption: {health.batteryExempt ? 'granted' : 'NOT granted'}{health.maker ? ` · Phone: ${health.maker}` : ''}
        </Text>
        <Text style={[st.note, { color: t.sub }]}>Wake word (default "jarvis" also matches "Hello Jarvis" / "Hey Jarvis"). A custom word depends on how well Android's recognizer hears it.</Text>
        <Field t={t} value={s.wakeWord} placeholder="jarvis" onCommit={(v: string) => { const w = v.trim().toLowerCase() || 'jarvis'; apply({ wakeWord: w }); WakeWordEngine.setWord(w); }} />
        <Btn t={t} label="1. Allow draw over other apps (lets JARVIS open itself)" onPress={() => Native.requestOverlayPermission()} />
        <Btn t={t} label="2. Disable battery optimization for JARVIS" onPress={() => Native.requestIgnoreBatteryOptimizations()} />
        <Btn t={t} label="3. Open Autostart / background settings for this phone" onPress={autostart} />
        <Btn t={t} label="Refresh status" onPress={refresh} />
        <Text style={[st.note, { color: t.sub }]}>
          Also lock JARVIS in the Recents screen on Xiaomi, Oppo, Vivo, Samsung, OnePlus and Huawei phones. Android 14+ will not let a microphone service restart itself after a reboot; JARVIS posts a notification, tap it once. You can stop listening at any time from the notification.
        </Text>

        <Text style={[st.sec, { color: t.sub }]}>PHONE LOCK</Text>
        <Row t={t} label={D.adminActive() ? 'Device admin: enabled' : 'Device admin: off'}>
          <Chip t={t} label="Enable" onPress={() => D.requestAdmin()} />
        </Row>
        <Text style={[st.note, { color: t.sub }]}>Only grants permission to lock the screen. JARVIS cannot unlock, read, or store your PIN, pattern or password. To remove it, turn it off in Android Settings → Security → Device admin apps.</Text>

        <Text style={[st.sec, { color: t.sub }]}>AI SERVICE</Text>
        <Row t={t} label="Provider">
          <View style={st.chips}>{(['openai', 'gemini'] as const).map(p => <Chip t={t} key={p} on={s.aiProvider === p} label={p === 'openai' ? 'OpenAI-compatible' : 'Gemini'} onPress={() => apply({ aiProvider: p })} />)}</View>
        </Row>
        {s.aiProvider === 'openai' && <Field t={t} value={s.aiBaseUrl} onCommit={(v: string) => apply({ aiBaseUrl: v.trim() })} placeholder="Base URL" />}
        <Field t={t} value={s.aiModel} onCommit={(v: string) => apply({ aiModel: v.trim() })} placeholder="Model" />
        <Field t={t} value={s.aiApiKey} onCommit={(v: string) => apply({ aiApiKey: v.trim() })} placeholder="API key (stored encrypted on this phone)" secureTextEntry />

        <Text style={[st.sec, { color: t.sub }]}>APPEARANCE & PRIVACY</Text>
        <Row t={t} label="Theme"><View style={st.chips}>
          <Chip t={t} on={s.theme === 'dark'} label="Dark" onPress={() => apply({ theme: 'dark' })} />
          <Chip t={t} on={s.theme === 'light'} label="Light" onPress={() => apply({ theme: 'light' })} />
        </View></Row>
        <Btn t={t} label="Delete conversation history" onPress={() => Alert.alert('Delete history?', '', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: clear }])} />
        <Text style={[st.note, { color: t.sub }]}>The microphone is only used while the orb shows "Listening" or the background-listening notification is visible. What you say is sent to your chosen AI provider. History is kept in this app's private storage and excluded from Android backups.</Text>

        <Btn t={t} label="Close" onPress={onClose} />
        <Text style={[st.credit, { color: t.sub }]}>App by Ishant Upadhyay</Text>
      </ScrollView>
    </Modal>
  );
}

const st = StyleSheet.create({
  h: { fontSize: 28, fontWeight: '700', letterSpacing: 2, marginBottom: 10 },
  sec: { marginTop: 22, marginBottom: 6, fontSize: 12, letterSpacing: 1.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, flexWrap: 'wrap', gap: 8 },
  label: { fontSize: 16, flexShrink: 1 },
  chips: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  chip: { borderWidth: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  btn: { borderWidth: 1, borderRadius: 10, padding: 12, marginVertical: 6, alignItems: 'center' },
  input: { borderWidth: 1, borderRadius: 8, padding: 10, marginVertical: 5 },
  note: { fontSize: 12, lineHeight: 17, marginVertical: 4 },
  credit: { textAlign: 'center', marginTop: 24, fontSize: 12 },
});
