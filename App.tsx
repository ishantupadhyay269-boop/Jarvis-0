import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import MainUI from './src/ui/MainUI';

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <MainUI />
    </SafeAreaProvider>
  );
}
