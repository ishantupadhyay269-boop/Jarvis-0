import * as SecureStore from 'expo-secure-store';
import { Settings } from '../types';

const KEY = 'jarvis_settings_v1';
const env = process.env;

export const DEFAULTS: Settings = {
  language: 'auto',
  speechRate: 1,
  theme: 'dark',
  continuous: true,
  wakeEnabled: false,
  wakeWord: 'jarvis',
  aiProvider: (env.EXPO_PUBLIC_AI_PROVIDER as Settings['aiProvider']) || 'openai',
  aiBaseUrl: env.EXPO_PUBLIC_AI_BASE_URL || 'https://api.groq.com/openai/v1',
  aiModel: env.EXPO_PUBLIC_AI_MODEL || 'llama-3.3-70b-versatile',
  aiApiKey: env.EXPO_PUBLIC_AI_API_KEY || '',
};

let cache: Settings = { ...DEFAULTS };

export const SettingsManager = {
  async load(): Promise<Settings> {
    try {
      const raw = await SecureStore.getItemAsync(KEY);
      if (raw) cache = { ...DEFAULTS, ...JSON.parse(raw) };
    } catch {}
    return cache;
  },
  get: () => cache,
  async update(patch: Partial<Settings>): Promise<Settings> {
    cache = { ...cache, ...patch };
    try { await SecureStore.setItemAsync(KEY, JSON.stringify(cache)); } catch {}
    return cache;
  },
};
