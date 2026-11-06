import Voice from '@react-native-voice/voice';
import { SettingsManager } from './SettingsManager';

export interface VoiceHandlers {
  onPartial?: (t: string) => void;
  onFinal: (t: string) => void;
  onError: (code: number, msg: string) => void;
  onLevel?: (level: number) => void; // 0..1
}

let handlers: VoiceHandlers | null = null;
let delivered = false;

Voice.onSpeechPartialResults = e => handlers?.onPartial?.(e.value?.[0] ?? '');
Voice.onSpeechResults = e => {
  const t = e.value?.[0] ?? '';
  if (t && !delivered) { delivered = true; handlers?.onFinal(t); }
};
Voice.onSpeechError = e => {
  const msg = e.error?.message ?? 'unknown';
  const code = parseInt(msg, 10) || 0; // e.g. "7/No match", "6/No speech input"
  if (!delivered) { delivered = true; handlers?.onError(code, msg); }
};
Voice.onSpeechVolumeChanged = e => handlers?.onLevel?.(Math.max(0, Math.min(1, ((e.value ?? 0) + 2) / 12)));

export const VoiceEngine = {
  locale(): string {
    return SettingsManager.get().language === 'hi' ? 'hi-IN' : 'en-IN';
  },
  async start(h: VoiceHandlers) {
    handlers = h;
    delivered = false;
    try { await Voice.cancel(); } catch {}
    await Voice.start(VoiceEngine.locale());
  },
  async stop() {
    handlers = null;
    try { await Voice.cancel(); } catch {}
  },
  async isAvailable() {
    try { return !!(await Voice.isAvailable()); } catch { return false; }
  },
};
