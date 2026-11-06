export type Role = 'user' | 'assistant';
export interface Message { id: string; role: Role; text: string; ts: number }
export type Status = 'idle' | 'listening' | 'thinking' | 'speaking';
export type Lang = 'auto' | 'en' | 'hi';
export interface Settings {
  language: Lang;
  speechRate: number;
  voice?: string;
  theme: 'dark' | 'light';
  continuous: boolean;
  wakeEnabled: boolean;
  /** Custom wake word; 'jarvis' = built-in (also matches "hello/hey jarvis"). */
  wakeWord: string;
  aiProvider: 'openai' | 'gemini';
  aiBaseUrl: string;
  aiModel: string;
  aiApiKey: string;
}
