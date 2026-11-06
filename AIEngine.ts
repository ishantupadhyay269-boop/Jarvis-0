import { SettingsManager } from './SettingsManager';

export interface ChatMsg { role: 'user' | 'assistant'; content: string }
export interface AIProvider { chat(history: ChatMsg[], system: string): Promise<string> }

async function fetchTimeout(url: string, init: RequestInit, ms = 25000) {
  const ac = new AbortController();
  const id = setTimeout(() => ac.abort(), ms);
  try { return await fetch(url, { ...init, signal: ac.signal }); } finally { clearTimeout(id); }
}

class OpenAICompatible implements AIProvider {
  async chat(history: ChatMsg[], system: string) {
    const s = SettingsManager.get();
    const res = await fetchTimeout(`${s.aiBaseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${s.aiApiKey}` },
      body: JSON.stringify({
        model: s.aiModel,
        temperature: 0.6,
        messages: [{ role: 'system', content: system }, ...history],
      }),
    });
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = await res.json();
    return j.choices?.[0]?.message?.content?.trim() ?? '';
  }
}

class GeminiProvider implements AIProvider {
  async chat(history: ChatMsg[], system: string) {
    const s = SettingsManager.get();
    const res = await fetchTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${s.aiModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': s.aiApiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: history.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      }),
    });
    if (!res.ok) throw new Error(`AI error ${res.status}`);
    const j = await res.json();
    return j.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('').trim() ?? '';
  }
}

const SYSTEM = `You are JARVIS, a polite, intelligent, confident voice assistant. Address the user as "Sir".
Reply in the language the user used (English, Hindi, or Hinglish mixed). Keep answers short and speakable:
1-3 sentences unless asked to explain in detail. No markdown, no emojis, no lists read aloud.
You can calculate, translate, summarize and explain. Never claim you performed a phone action; device actions are handled separately.`;

export const AIEngine = {
  provider(): AIProvider {
    return SettingsManager.get().aiProvider === 'gemini' ? new GeminiProvider() : new OpenAICompatible();
  },
  configured: () => !!SettingsManager.get().aiApiKey,
  async ask(history: ChatMsg[]): Promise<string> {
    if (!AIEngine.configured()) {
      return 'My AI service is not configured yet, Sir. Please add an API key in Settings.';
    }
    const system = `${SYSTEM}\nCurrent date and time: ${new Date().toString()}.`;
    try {
      return await AIEngine.provider().chat(history, system);
    } catch (e: any) {
      const m = String(e?.message ?? e);
      if (/ 40[13]/.test(m)) return 'My AI service rejected the API key, Sir. Please check it in Settings.';
      if (/ 429/.test(m)) return 'My AI service is rate limited at the moment, Sir. Please try again shortly.';
      if (e?.name === 'AbortError') return 'My AI service took too long to answer, Sir.';
      return "I'm unable to reach my AI service, Sir. Basic commands still work offline.";
    }
  },
};
