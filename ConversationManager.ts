import AsyncStorage from '@react-native-async-storage/async-storage';
import { Message, Role } from '../types';

const KEY = 'jarvis_history_v1';
const MAX_STORED = 60;
const CONTEXT_WINDOW = 12;

let messages: Message[] = [];

export const ConversationManager = {
  async load(): Promise<Message[]> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) messages = JSON.parse(raw);
    } catch {}
    return messages;
  },
  all: () => messages,
  async add(role: Role, text: string): Promise<Message[]> {
    messages = [...messages, { id: `${Date.now()}-${Math.random()}`, role, text, ts: Date.now() }].slice(-MAX_STORED);
    try { await AsyncStorage.setItem(KEY, JSON.stringify(messages)); } catch {}
    return messages;
  },
  context: () => messages.slice(-CONTEXT_WINDOW).map(m => ({ role: m.role, content: m.text })),
  async clear() {
    messages = [];
    try { await AsyncStorage.removeItem(KEY); } catch {}
  },
};
