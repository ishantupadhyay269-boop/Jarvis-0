import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { Message, Settings, Status } from '../types';
import { SettingsManager } from '../modules/SettingsManager';
import { ConversationManager } from '../modules/ConversationManager';
import { SpeechEngine } from '../modules/SpeechEngine';
import { VoiceEngine } from '../modules/VoiceEngine';
import { WakeWordEngine } from '../modules/WakeWordEngine';
import { AIEngine } from '../modules/AIEngine';
import { processCommand } from '../modules/CommandProcessor';
import { AndroidDeviceController } from '../modules/AndroidDeviceController';
import { PermissionsAndroid } from 'react-native';

const STOP = /^(stop|goodbye|bye|that's all|thank you jarvis|ruko|bas karo|बस|रुको|धन्यवाद)\b/i;

export function useJarvis() {
  const [settings, setSettings] = useState<Settings>(SettingsManager.get());
  const [messages, setMessages] = useState<Message[]>([]);
  const [status, setStatus] = useState<Status>('idle');
  const [partial, setPartial] = useState('');
  const [level, setLevel] = useState(0);
  const [online, setOnline] = useState(true);
  const [notice, setNotice] = useState('');
  const retries = useRef(0);
  const busy = useRef(false);
  const sessionId = useRef(0);
  const [ready, setReady] = useState(false);

  const apply = useCallback(async (patch: Partial<Settings>) => setSettings(await SettingsManager.update(patch)), []);

  const say = useCallback(async (text: string) => {
    if (!text) return;
    setMessages(await ConversationManager.add('assistant', text));
    setStatus('speaking');
    await SpeechEngine.speak(text);
  }, []);

  const endSession = useCallback(async () => {
    sessionId.current++;
    await VoiceEngine.stop();
    setStatus('idle'); setPartial(''); setLevel(0);
    if (SettingsManager.get().wakeEnabled) WakeWordEngine.resume();
  }, []);

  const listen = useCallback(async () => {
    const my = ++sessionId.current;
    await SpeechEngine.stop();
    const mic = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
    if (mic !== PermissionsAndroid.RESULTS.GRANTED) { setNotice('Microphone permission is required.'); return; }
    WakeWordEngine.pause(); // free the mic from the background service
    setStatus('listening'); setPartial('');
    try {
      await VoiceEngine.start({
        onPartial: setPartial,
        onLevel: setLevel,
        onFinal: t => { if (my === sessionId.current) { retries.current = 0; handleInput(t, true); } },
        onError: async (code, msg) => {
          if (my !== sessionId.current) return;
          // 6 = no speech, 7 = no match: retry once quietly, then give up
          if ((code === 6 || code === 7) && retries.current < 1) { retries.current++; listen(); return; }
          retries.current = 0;
          if (code === 6 || code === 7) await say("I didn't catch that, Sir.");
          else setNotice(`Speech recognition problem (${msg}). Check the Google speech service.`);
          await endSession();
        },
      });
    } catch (e: any) {
      setNotice('Could not start speech recognition: ' + (e?.message ?? e));
      await endSession();
    }
  }, []);

  const handleInput = useCallback(async (text: string, fromVoice: boolean) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await VoiceEngine.stop(); setPartial('');
      setMessages(await ConversationManager.add('user', text));
      if (fromVoice && STOP.test(text.trim())) { await say('Very good, Sir.'); await endSession(); return; }
      setStatus('thinking');
      let reply = await processCommand(text, { speak: SpeechEngine.speak });
      if (reply === null) {
        try { reply = await AIEngine.ask(ConversationManager.context()); }
        catch { reply = "I'm unable to reach my AI service, Sir. Basic commands still work offline."; }
      }
      await say(reply);
      if (fromVoice && SettingsManager.get().continuous) { busy.current = false; await listen(); return; }
      await endSession();
    } finally { busy.current = false; }
  }, [listen, say, endSession]);

  const onOrbPress = useCallback(async () => {
    if (status === 'speaking') { await SpeechEngine.stop(); await listen(); }
    else if (status === 'listening') await endSession();
    else if (status === 'idle') await listen();
  }, [status, listen, endSession]);

  // boot: load settings + history BEFORE reacting to a wake event (a cold start from the
  // background service must use the saved language, not the defaults)
  useEffect(() => {
    (async () => {
      setSettings(await SettingsManager.load());
      setMessages(await ConversationManager.load());
      if (SettingsManager.get().wakeEnabled && WakeWordEngine.available) {
        const ok = await WakeWordEngine.start();
        if (!ok) { await apply({ wakeEnabled: false }); setNotice('Background listening could not start (microphone permission?).'); }
      }
      setReady(true);
    })();
    const net = setInterval(async () => setOnline((await AndroidDeviceController.network()).online), 5000);
    return () => clearInterval(net);
  }, []);

  // keep UI state honest about the background service (user may stop it from the notification)
  const syncWake = useCallback(() => {
    if (!WakeWordEngine.available || !SettingsManager.get().wakeEnabled) return;
    if (!WakeWordEngine.isEnabled()) {
      apply({ wakeEnabled: false });
      setNotice('Background listening was turned off from the notification.');
    } else if (!WakeWordEngine.isRunning()) {
      WakeWordEngine.start(); // app is in the foreground, so Android allows this
    }
  }, [apply]);

  // wake word (service -> app)
  useEffect(() => {
    if (!ready) return;
    const onWake = () => { if (!busy.current && WakeWordEngine.consumePending()) listen(); };
    const off = WakeWordEngine.onWake(onWake);
    const sub = AppState.addEventListener('change', st => { if (st === 'active') { syncWake(); onWake(); } });
    syncWake();
    onWake();
    return () => { off(); sub.remove(); };
  }, [ready, listen, syncWake]);

  return { settings, apply, messages, status, partial, level, online, notice, setNotice, onOrbPress, sendText: (t: string) => handleInput(t, false), clear: async () => { await ConversationManager.clear(); setMessages([]); } };
}
