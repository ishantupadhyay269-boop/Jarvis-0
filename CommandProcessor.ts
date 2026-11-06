import { AndroidDeviceController as D } from './AndroidDeviceController';
import { AuthenticationManager } from './AuthenticationManager';

export interface CommandDeps { speak: (t: string) => Promise<void> }
const T = 'Sir';

const OPEN = '(?:open|launch|start|kholo|khol do|खोलो|खोलिए|खोल दो|चालू करो|chalu karo)';
const YT = '(?:youtube|यूट्यूब|यूटयूब)';
const CAM = '(?:camera|कैमरा|कैमेरा)';
const num = (s: string) => (s.match(/\+?\d[\d\s-]{4,}/)?.[0] ?? '').replace(/[\s-]/g, '');

/**
 * Returns the spoken reply, or null when the text is not a device command
 * (the caller then sends it to the AI engine).
 */
export async function processCommand(raw: string, deps: CommandDeps): Promise<string | null> {
  const t = raw.toLowerCase().trim()
    .replace(/^(?:hello|hallo|hey|hi|ok|okay|हेलो|हैलो|हे)\s+(?:jarvis|जार्विस|जारविस)[\s,.:!-]*/, '')
    .replace(/^(?:jarvis|जार्विस|जारविस)[\s,.:!-]*/, '')
    .replace(/[\s.,!?।]+$/, '')
    .trim();
  let m: RegExpMatchArray | null;

  // --- authentication (+ optional pending command) ---
  m = t.match(/^(?:authenticate me(?: and (.+))?|unlock (?:my )?phone|open my phone)$/);
  if (m) {
    await deps.speak(`Certainly, ${T}. Please authenticate to continue.`);
    if (!(await AuthenticationManager.available())) return `No fingerprint or screen lock is set up on this device, ${T}.`;
    if (!(await AuthenticationManager.authenticate())) return `Authentication failed, ${T}. I will not proceed.`;
    if (m[1]) return (await processCommand(m[1], deps)) ?? `Authenticated, ${T}, but I did not understand the follow-up command.`;
    return `Authenticated, ${T}. Android does not allow any app to unlock the lock screen, so please unlock the phone yourself.`;
  }

  // --- lock phone ---
  if (/^(lock (?:my |the )?(?:phone|screen)|phone lock karo|फोन लॉक करो)$/.test(t)) {
    if (!D.adminActive()) { D.requestAdmin(); return `I need device administrator permission to lock the screen, ${T}. Please approve it on the screen that just opened.`; }
    D.lockPhone(); return '';
  }

  // --- time / date (anchored so "time complexity" or "date of independence" go to the AI) ---
  if (/^(?:what(?:'s| is) the time(?: now)?|what time is it(?: now)?|current time|time|time kya hai|abhi kitne baje hain?|समय क्या है|टाइम क्या है)$/.test(t)) {
    return `It is ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}, ${T}.`;
  }
  if (/^(?:what(?:'s| is)(?: the| today's)? date(?: today)?|today's date|current date|date|aaj ki tarikh(?: kya hai)?|आज की तारीख(?: क्या है)?)$/.test(t)) {
    return `Today is ${new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${T}.`;
  }

  // --- battery / network ---
  if (/^(?:what(?:'s| is) (?:my |the )?)?battery(?: level| status| percentage| percent)?(?: left)?$|^how much battery(?: do i have| is left)?$|battery kitni|बैटरी कितनी/.test(t)) {
    const b = await D.battery();
    return `Battery is at ${b.percent} percent${b.charging ? ' and charging' : ''}, ${T}.`;
  }
  if (/^(?:network|internet|wifi|connection)(?: status)?$|^(?:am i|are we) (?:online|connected)|^(?:check|is my) (?:the |my )?(?:network|internet|wifi)/.test(t)) {
    const n = await D.network();
    return n.online ? `You are online via ${n.type}, ${T}.` : `You appear to be offline, ${T}.`;
  }

  // --- flashlight ---
  m = t.match(/\b(?:(?:turn |switch )?(on|off)(?: the)? (?:flashlight|torch)|(?:flashlight|torch) (on|off)|torch (jalao|band karo))\b/);
  if (m) {
    const on = (m[1] || m[2] || (m[3] === 'jalao' ? 'on' : 'off')) === 'on';
    return D.flashlight(on) ? `Flashlight ${on ? 'on' : 'off'}, ${T}.` : `I could not control the flashlight on this device, ${T}.`;
  }

  // --- volume ---
  m = t.match(/\bvolume (?:to |set to )?(\d{1,3})(?:\s*(?:percent|%))?/);
  if (m) { D.volume.set(parseInt(m[1], 10)); return `Volume set to ${Math.min(100, parseInt(m[1], 10))} percent, ${T}.`; }
  if (/\b(volume (up|increase)|louder|awaaz badhao|आवाज़ बढ़ाओ)\b/.test(t)) { D.volume.set(D.volume.get() + 15); return `Volume increased, ${T}.`; }
  if (/\b(volume (down|decrease)|quieter|awaaz kam karo|आवाज़ कम करो)\b/.test(t)) { D.volume.set(D.volume.get() - 15); return `Volume decreased, ${T}.`; }

  // --- timer ---
  m = t.match(/\b(?:set (?:a )?timer (?:for )?|timer (?:for )?)(\d+)\s*(second|sec|minute|min|hour|hr)s?\b/);
  if (m) {
    const n = parseInt(m[1], 10); const u = m[2];
    const secs = /^h/.test(u) ? n * 3600 : /^m/.test(u) ? n * 60 : n;
    await D.setTimer(secs);
    return `Opening the clock with a ${n} ${u === 'hr' ? 'hour' : u === 'min' ? 'minute' : u} timer, ${T}.`;
  }

  // --- reminder (implemented as a labelled alarm; Android has no silent reminder API) ---
  m = t.match(/^remind me (?:to )?(.+?) (?:at|by) (\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (m) {
    let h = parseInt(m[2], 10); const min = parseInt(m[3] ?? '0', 10);
    if (m[4] === 'pm' && h < 12) h += 12; if (m[4] === 'am' && h === 12) h = 0;
    await D.setAlarm(h, min, m[1]);
    return `Opening the clock with a reminder alarm for ${h}:${String(min).padStart(2, '0')}, ${T}. Please confirm it there.`;
  }

  // --- alarm ---
  m = t.match(/\b(?:set (?:an )?alarm (?:for|at)|alarm (?:set karo|lagao))\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (m) {
    let h = parseInt(m[1], 10); const min = parseInt(m[2] ?? '0', 10);
    if (m[3] === 'pm' && h < 12) h += 12; if (m[3] === 'am' && h === 12) h = 0;
    await D.setAlarm(h, min); return `Opening the alarm for ${h}:${String(min).padStart(2, '0')}, ${T}. Please confirm it in the clock app.`;
  }

  // --- YouTube ---
  m = t.match(/\b(?:play|search)\s+(.+?)\s+on youtube\b/) ?? t.match(/\byoutube (?:par|pe)\s+(.+?)\s+(?:chalao|search karo)\b/);
  if (m) { await D.openYouTube(m[1]); return `Searching YouTube for ${m[1]}, ${T}.`; }
  if (new RegExp(`^${OPEN}\\s+${YT}$|^${YT}\\s+${OPEN}$`).test(t)) { await D.openYouTube(); return `Opening YouTube, ${T}.`; }

  // --- camera / settings ---
  if (new RegExp(`^${OPEN}\\s+(?:the\\s+)?${CAM}$|^${CAM}\\s+${OPEN}$`).test(t)) { await D.openCamera(); return `Opening the camera, ${T}.`; }
  m = t.match(new RegExp(`^${OPEN}\\s+(?:the\\s+)?(?:(${D.settingsPages().join('|')})\\s+)?settings$|^(?:settings|सेटिंग्स)\\s+${OPEN}$`));
  if (m) { await D.openSettings(m[1] || 'main'); return `Opening settings, ${T}.`; }

  // --- phone / SMS ---
  m = t.match(/^(?:call|dial|phone)\s+(.+)$/);
  if (m) {
    const n = num(m[1]);
    if (!n) return `Android does not let me search your contacts without extra permission, ${T}. Please give me a number.`;
    await D.dial(n); return `Opening the dialer with ${n}, ${T}. Press call to connect.`;
  }
  m = t.match(/^(?:send (?:an )?(?:sms|text|message)|text)\s+(?:to\s+)?(\+?[\d\s-]{5,})\s*(?:saying|that says|message|:)?\s*(.*)$/);
  if (m) { await D.sms(num(m[1]), m[2]); return `Composing your message, ${T}. Please press send.`; }

  // --- web search ---
  m = t.match(/^(?:search(?: the web| google)? for|google|search)\s+(.+)$/);
  if (m) { await D.search(m[1]); return `Searching for ${m[1]}, ${T}.`; }

  // --- generic open app (English + Hindi word order) ---
  m = t.match(new RegExp(`^${OPEN}\\s+(.+)$`)) ?? t.match(new RegExp(`^(.+?)\\s+${OPEN}$`));
  if (m) {
    const label = D.openApp(m[1].replace(/^the\s+|\s+app$/g, ''));
    return label ? `Opening ${label}, ${T}.` : `I could not find an app called ${m[1]}, ${T}.`;
  }

  return null;
}
