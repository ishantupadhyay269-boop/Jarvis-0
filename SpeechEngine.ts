import * as Speech from 'expo-speech';
import { SettingsManager } from './SettingsManager';

const DEVANAGARI = /[\u0900-\u097F]/;

export const SpeechEngine = {
  languageFor(text: string): string {
    const l = SettingsManager.get().language;
    if (l === 'hi') return 'hi-IN';
    if (l === 'en') return 'en-IN';
    return DEVANAGARI.test(text) ? 'hi-IN' : 'en-IN';
  },
  clean: (t: string) => t.replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim(),
  /** Resolves when speech finishes, is stopped, or errors. */
  speak(text: string): Promise<void> {
    const s = SettingsManager.get();
    const clean = SpeechEngine.clean(text);
    if (!clean) return Promise.resolve();
    return new Promise(resolve => {
      Speech.speak(clean, {
        language: SpeechEngine.languageFor(clean),
        rate: s.speechRate,
        voice: s.voice,
        onDone: () => resolve(),
        onStopped: () => resolve(),
        onError: () => resolve(),
      });
    });
  },
  stop: () => Speech.stop(),
  isSpeaking: () => Speech.isSpeakingAsync(),
  async voices() {
    try { return (await Speech.getAvailableVoicesAsync()).filter(v => /^(en|hi)/i.test(v.language)); } catch { return []; }
  },
};
