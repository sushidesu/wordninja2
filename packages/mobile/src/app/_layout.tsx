import '../global.css';

// NOTE: `@expo-google-fonts/*` 側の `useFonts` フックは使わない。
// あのフックはパッケージ自身が `react` を `import 'react'` で解決してしまうが、
// pnpm + hoisted linker のワークスペースでは root の react と mobile の react が
// 別インスタンスになっており "Invalid hook call" で落ちる。
// 代わりに `expo-font` (mobile から辿る react と一致) の `useFonts` に
// アセット定数だけを渡す形で回避する。
// 本番 body(M PLUS 1) の中間ウェイト。残りの本番フォント (Dela Gothic One / M PLUS 1 400・700) は fontAssets に含まれる。
import { MPLUS1_500Medium, MPLUS1_900Black } from '@expo-google-fonts/m-plus-1';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// フォント選定中の候補一式。本番フォントに加えて起動時にロードし、/font-preview で見比べる。
import { fontAssets } from '@/constants/font-catalog';
import { GameProvider } from '@/features/game/game-context';

SplashScreen.preventAutoHideAsync().catch(() => {
  // already-hidden is fine
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    MPLUS1_500Medium,
    MPLUS1_900Black,
    ...fontAssets,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <GameProvider>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" options={{ animation: 'fade' }} />
          </Stack>
        </GameProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
