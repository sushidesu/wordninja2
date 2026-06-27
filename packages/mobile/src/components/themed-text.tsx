import { Text, type TextProps } from 'react-native';

import { ThemeColor, Type } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * アプリ全テキストの入口。役割 (`type`) を選ぶと family/size/lineHeight/letterSpacing が
 * `Type` トークンからまとめて決まる。生の fontSize/fontFamily を画面側に書かないことで一貫させる。
 *
 * 階層:
 * - title 系 (Dela): hero / h1 / h2 / h3 — 大見出し・お題・名前。
 * - label 系 (M PLUS 1 Bold): labelLg(ボタン) / label / labelSm(バッジ) — UI 文字。
 * - body 系 (M PLUS 1): body / bodySm / caption — 本文・補助。
 * - 機能: link / linkPrimary / code。
 *
 * `TextInput` など Text 以外は `Type.body` を直接参照する (theme.ts 参照)。
 */
export type ThemedTextType = keyof typeof Type;

export type ThemedTextProps = TextProps & {
  type?: ThemedTextType;
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'body', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const color = theme[themeColor ?? (type === 'linkPrimary' ? 'flame' : 'text')];

  return <Text style={[{ color }, Type[type], style]} {...rest} />;
}
