import React, { useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useJarvis } from './useJarvis';
import { Orb } from './Orb';
import SettingsScreen from './SettingsScreen';
import { themes } from './theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LABEL = { idle: 'Standing by', listening: 'Listening…', thinking: 'Thinking…', speaking: 'Speaking…' } as const;

export default function MainUI() {
  const j = useJarvis();
  const t = themes[j.settings.theme];
  const [text, setText] = useState('');
  const [open, setOpen] = useState(false);
  const list = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  const send = () => { const v = text.trim(); if (v) { setText(''); j.sendText(v); } };

  return (
    <KeyboardAvoidingView style={[s.root, { backgroundColor: t.bg, paddingTop: insets.top + 8, paddingBottom: insets.bottom }]} behavior="padding">
      <View style={s.header}>
        <View>
          <Text style={[s.title, { color: t.accent }]}>J.A.R.V.I.S</Text>
          <Text style={{ color: t.sub, fontSize: 11 }}>App by Ishant Upadhyay</Text>
        </View>
        <View style={s.right}>
          <View style={[s.dot, { backgroundColor: j.online ? '#35e08a' : '#ff5a5a' }]} />
          <Text style={{ color: t.sub, marginRight: 14 }}>{j.online ? 'Online' : 'Offline'}</Text>
          <Pressable onPress={() => setOpen(true)} hitSlop={12}><Text style={{ color: t.text, fontSize: 24 }}>⚙</Text></Pressable>
        </View>
      </View>

      <Orb status={j.status} level={j.level} theme={t} onPress={j.onOrbPress} />
      <Text style={[s.status, { color: t.accent }]}>{LABEL[j.status]}</Text>
      {!!j.partial && <Text style={{ color: t.sub, textAlign: 'center', paddingHorizontal: 24 }} numberOfLines={2}>{j.partial}</Text>}
      {!!j.notice && <Pressable onPress={() => j.setNotice('')}><Text style={s.notice}>{j.notice}</Text></Pressable>}

      <FlatList
        ref={list}
        style={s.list}
        data={j.messages}
        keyExtractor={m => m.id}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[s.bubble, item.role === 'user' ? s.userB : s.botB, { backgroundColor: item.role === 'user' ? t.user : t.bot }]}>
            <Text style={{ color: t.text }}>{item.text}</Text>
          </View>
        )}
      />

      <View style={s.inputRow}>
        <TextInput
          value={text} onChangeText={setText} onSubmitEditing={send}
          placeholder="Type to JARVIS…" placeholderTextColor={t.sub}
          style={[s.input, { color: t.text, backgroundColor: t.surface, borderColor: t.accent }]} returnKeyType="send"
        />
        <Pressable onPress={text.trim() ? send : j.onOrbPress} style={[s.mic, { backgroundColor: j.status === 'listening' ? '#ff4d6d' : t.accent }]}>
          <Text style={{ fontSize: 22, color: '#fff' }}>{text.trim() ? '➤' : '🎤'}</Text>
        </Pressable>
      </View>

      <SettingsScreen visible={open} onClose={() => setOpen(false)} theme={t} settings={j.settings} apply={j.apply} clear={j.clear} />
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20 },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: 4 },
  right: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  status: { textAlign: 'center', marginTop: 6, letterSpacing: 2, fontSize: 13 },
  notice: { color: '#ffb347', textAlign: 'center', padding: 8, fontSize: 12 },
  list: { flex: 1, marginTop: 10, paddingHorizontal: 14 },
  bubble: { padding: 10, borderRadius: 14, marginVertical: 4, maxWidth: '85%' },
  userB: { alignSelf: 'flex-end' },
  botB: { alignSelf: 'flex-start' },
  inputRow: { flexDirection: 'row', padding: 12, gap: 10, alignItems: 'center' },
  input: { flex: 1, borderWidth: 1, borderRadius: 24, paddingHorizontal: 16, paddingVertical: 10 },
  mic: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
});
