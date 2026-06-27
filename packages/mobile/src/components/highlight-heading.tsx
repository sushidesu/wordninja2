import React from 'react';
import { StyleSheet, View, type TextStyle, type ViewStyle } from 'react-native';

import { ThemedText, type ThemedTextType } from '@/components/themed-text';
import { Colors, Spacing } from '@/constants/theme';

/**
 * deviationgame.com の `.heading-1.highlight` を再現する見出しラッパー。
 *
 * CSS 原本:
 * ```css
 * .heading-1.highlight {
 *   outline: 3px solid var(--outdraw-orange);
 *   margin: 0 -40px 40px;   ← 左右にネガティブ margin で枠が親の padding をハミ出る
 *   padding: 40px;
 * }
 * ```
 *
 * 3px の矩形枠がテキストを囲み、親のコンテナから左右にハミ出す。
 * 文字スタイルは `ThemedText` の見出しロール (title 系) に委譲する。
 */

type Props = {
  children: React.ReactNode;
  /** 枠の色。既定は `Colors.ink`。 */
  borderColor?: string;
  /** 文字色。既定は `Colors.ink`。 */
  color?: string;
  /** 見出しの大きさ (title 系ロール)。既定 hero。 */
  type?: Extract<ThemedTextType, 'hero' | 'h1' | 'h2' | 'h3'>;
  /** 左右のハミ出し量 (ネガティブ margin)。既定 lg。 */
  overflowX?: number;
  /** 内側の padding。既定 xl2。 */
  padding?: number;
  /** 下の margin。既定 xl2。 */
  marginBottom?: number;
  /** テキスト配置。既定 center。 */
  align?: 'center' | 'left' | 'right';
  /** ラッパー追加スタイル。 */
  style?: ViewStyle;
  /** テキスト追加スタイル。 */
  textStyle?: TextStyle;
};

export function HighlightHeading({
  children,
  borderColor = Colors.ink,
  color = Colors.ink,
  type = 'hero',
  overflowX = Spacing.lg,
  padding = Spacing.xl2,
  marginBottom = Spacing.xl2,
  align = 'center',
  style,
  textStyle,
}: Props) {
  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor,
          marginHorizontal: -overflowX,
          paddingVertical: padding,
          paddingHorizontal: padding,
          marginBottom,
        },
        style,
      ]}>
      <ThemedText type={type} style={[{ color, textAlign: align }, textStyle]}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 3,
  },
});
