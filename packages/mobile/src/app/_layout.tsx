import '../global.css';

// NOTE: `@expo-google-fonts/*` 側の `useFonts` フックは使わない。
// あのフックはパッケージ自身が `react` を `import 'react'` で解決してしまうが、
// pnpm + hoisted linker のワークスペースでは root の react と mobile の react が
// 別インスタンスになっており "Invalid hook call" で落ちる。
// 代わりに `expo-font` (mobile から辿る react と一致) の `useFonts` に
// アセット定数だけを渡す形で回避する。
import { DotGothic16_400Regular } from '@expo-google-fonts/dotgothic16';
import {
  ZenKakuGothicNew_400Regular,
  ZenKakuGothicNew_500Medium,
  ZenKakuGothicNew_700Bold,
  ZenKakuGothicNew_900Black,
} from '@expo-google-fonts/zen-kaku-gothic-new';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import React, { useEffect } from 'react';
import { useColorScheme } from 'react-native';

SplashScreen.preventAutoHideAsync().catch(() => {
  // already-hidden is fine
});

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [fontsLoaded] = useFonts({
    DotGothic16_400Regular,
    ZenKakuGothicNew_400Regular,
    ZenKakuGothicNew_500Medium,
    ZenKakuGothicNew_700Bold,
    ZenKakuGothicNew_900Black,
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
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
